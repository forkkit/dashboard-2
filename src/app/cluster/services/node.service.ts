import {EventEmitter, Injectable, Injector} from '@angular/core';
import {MatDialog, MatDialogConfig} from '@angular/material/dialog';
import * as _ from 'lodash';
import {Observable, of} from 'rxjs';
import {catchError, first, flatMap, map} from 'rxjs/operators';

import {NotificationService} from '../../core/services';
import {ApiService} from '../../core/services';
import {GoogleAnalyticsService} from '../../google-analytics.service';
import {ConfirmationDialogComponent} from '../../shared/components/confirmation-dialog/confirmation-dialog.component';
import {Cluster} from '../../shared/entity/cluster';
import {Datacenter} from '../../shared/entity/datacenter';
import {NodeDeployment, NodeDeploymentPatch} from '../../shared/entity/node-deployment';
import {NodeData} from '../../shared/model/NodeSpecChange';
import {NodeDataModalComponent, NodeDataModalData} from '../cluster-details/node-data-modal/node-data-modal.component';

@Injectable()
export class NodeService {
  private readonly _notificationService: NotificationService;

  private static _getNodeDeploymentEntity(nodeData: NodeData): NodeDeployment {
    return {
      name: nodeData.name,
      spec: {
        template: nodeData.spec,
        replicas: nodeData.count,
        dynamicConfig: nodeData.dynamicConfig,
      },
    };
  }

  private static _createPatch(data: NodeDataModalData): NodeDeploymentPatch {
    const patch: NodeDeploymentPatch = {
      spec: {
        replicas: data.nodeData.count,
        template: data.nodeData.spec,
        dynamicConfig: data.nodeData.dynamicConfig,
      },
    };

    // As we are using merge patch to send whole spec we need to ensure that previous values will be unset
    // and replaced by the values from patch. That's why we need to set undefined fields to null.
    // It is not part of API service as it is not required in all cases (i.e. replicas count change).
    patch.spec.template.operatingSystem.ubuntu = patch.spec.template.operatingSystem.ubuntu || null;
    patch.spec.template.operatingSystem.centos = patch.spec.template.operatingSystem.centos || null;
    patch.spec.template.operatingSystem.containerLinux = patch.spec.template.operatingSystem.containerLinux || null;
    patch.spec.template.operatingSystem.flatcar = patch.spec.template.operatingSystem.flatcar || null;
    patch.spec.template.operatingSystem.sles = patch.spec.template.operatingSystem.sles || null;

    return patch;
  }

  constructor(
    private readonly _apiService: ApiService,
    private readonly _googleAnalyticsService: GoogleAnalyticsService,
    private readonly _matDialog: MatDialog,
    private readonly _inj: Injector
  ) {
    this._notificationService = this._inj.get(NotificationService);
  }

  createNodeDeployment(nodeData: NodeData, dc: Datacenter, cluster: Cluster, project: string): void {
    this._apiService
      .createNodeDeployment(cluster, NodeService._getNodeDeploymentEntity(nodeData), dc.metadata.name, project)
      .pipe(first())
      .subscribe(() => {
        this._notificationService.success(
          `A new node deployment was created in the <strong>${cluster.name}</strong> cluster`
        );
        this._googleAnalyticsService.emitEvent('clusterOverview', 'nodeAdded');
      });
  }

  showNodeDeploymentCreateDialog(
    count: number,
    cluster: Cluster,
    projectID: string,
    datacenter: Datacenter
  ): Observable<boolean> {
    const dialogRef = this._matDialog.open(NodeDataModalComponent, {
      data: {
        cluster,
        datacenter,
        projectID,
        existingNodesCount: count,
        editMode: false,
      },
    });

    return dialogRef.afterClosed().pipe<boolean>(
      map((data: NodeDataModalData) => {
        if (data) {
          this.createNodeDeployment(data.nodeData, data.datacenter, data.cluster, data.projectID);
          return true;
        }
        return false;
      })
    );
  }

  showNodeDeploymentEditDialog(
    nd: NodeDeployment,
    cluster: Cluster,
    projectID: string,
    datacenter: Datacenter,
    changeEventEmitter: EventEmitter<NodeDeployment>
  ): Observable<boolean> {
    const dialogRef = this._matDialog.open(NodeDataModalComponent, {
      data: {
        cluster,
        datacenter,
        projectID,
        existingNodesCount: nd.spec.replicas,
        editMode: true,
        nodeDeployment: nd,
        nodeData: {
          count: nd.spec.replicas,
          name: nd.name,
          spec: _.cloneDeep(nd.spec.template),
          valid: true,
          dynamicConfig: nd.spec.dynamicConfig,
        } as NodeData,
      },
    });

    return dialogRef
      .afterClosed()
      .pipe(
        flatMap(
          (data: NodeDataModalData): Observable<NodeDeployment> => {
            if (data) {
              return this._apiService
                .patchNodeDeployment(
                  data.nodeDeployment,
                  NodeService._createPatch(data),
                  data.cluster.id,
                  data.datacenter.metadata.name,
                  data.projectID
                )
                .pipe(first())
                .pipe(
                  catchError(() => {
                    this._notificationService.error(
                      `Could not update the <strong>${data.nodeDeployment.name}</strong> node deployment `
                    );
                    this._googleAnalyticsService.emitEvent('clusterOverview', 'nodeDeploymentUpdateFailed');
                    return of(undefined);
                  })
                );
            }
            return of(undefined);
          }
        )
      )
      .pipe(
        flatMap(
          (nd: NodeDeployment): Observable<boolean> => {
            if (nd) {
              this._notificationService.success(`The <strong>${nd.name}</strong> node deployment was updated`);
              this._googleAnalyticsService.emitEvent('clusterOverview', 'nodeDeploymentUpdated');
              if (changeEventEmitter) {
                changeEventEmitter.emit(nd);
              }
              return of(true);
            }
            return of(false);
          }
        )
      )
      .pipe(first());
  }

  showNodeDeploymentDeleteDialog(
    nd: NodeDeployment,
    clusterID: string,
    projectID: string,
    dcName: string,
    changeEventEmitter: EventEmitter<NodeDeployment>
  ): Observable<boolean> {
    const dialogConfig: MatDialogConfig = {
      disableClose: false,
      hasBackdrop: true,
      data: {
        title: 'Delete Node Deployment',
        message: `Delete "<strong>${nd.name}</strong>" permanently?`,
        confirmLabel: 'Delete',
      },
    };

    const dialogRef = this._matDialog.open(ConfirmationDialogComponent, dialogConfig);
    this._googleAnalyticsService.emitEvent('clusterOverview', 'deleteNodeDialogOpened');

    return dialogRef
      .afterClosed()
      .pipe(
        flatMap(
          (isConfirmed: boolean): Observable<boolean> => {
            if (isConfirmed) {
              return this._apiService
                .deleteNodeDeployment(clusterID, nd, dcName, projectID)
                .pipe(first())
                .pipe(
                  catchError(() => {
                    this._notificationService.error('Could not remove the <strong>${nd.name}</strong> node deployment');
                    this._googleAnalyticsService.emitEvent('clusterOverview', 'nodeDeploymentDeleteFailed');
                    return of(false);
                  })
                );
            }
            return of(false);
          }
        )
      )
      .pipe(
        flatMap(
          (data: any): Observable<boolean> => {
            if (data) {
              this._notificationService.success(`The <strong>${nd.name}</strong> node deployment was removed`);
              this._googleAnalyticsService.emitEvent('clusterOverview', 'nodeDeploymentDeleted');
              if (changeEventEmitter) {
                changeEventEmitter.emit(nd);
              }
              return of(true);
            }
            return of(false);
          }
        )
      )
      .pipe(first());
  }
}
