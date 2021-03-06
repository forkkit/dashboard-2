import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {BehaviorSubject, iif, merge, Observable, of, Subject, timer} from 'rxjs';
import {catchError, delay, map, retryWhen, shareReplay, switchMap, tap} from 'rxjs/operators';
import {webSocket} from 'rxjs/webSocket';

import {environment} from '../../../../environments/environment';
import {AppConfigService} from '../../../app-config.service';
import {Auth} from '../auth/auth.service';
import {
  AdminSettings,
  CustomLink,
  DEFAULT_ADMIN_SETTINGS,
  DEFAULT_USER_SETTINGS,
  UserSettings,
} from '../../../shared/entity/settings';
import {Settings} from 'http2';
import {Admin} from '../../../shared/entity/member';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private readonly restRoot = environment.restRoot;
  private readonly wsRoot = environment.wsRoot;
  private _userSettings$: Observable<UserSettings>;
  private _userSettingsRefresh$ = new Subject();
  private readonly _adminSettings$ = new BehaviorSubject(DEFAULT_ADMIN_SETTINGS);
  private _adminSettingsWatch$: Observable<AdminSettings>;
  private _admins$: Observable<Admin[]>;
  private _adminsRefresh$ = new Subject();
  private _customLinks$: Observable<CustomLink[]>;
  private _customLinksRefresh$ = new Subject();
  private _refreshTimer$ = timer(0, this._appConfigService.getRefreshTimeBase() * 5);

  constructor(
    private readonly _httpClient: HttpClient,
    private readonly _appConfigService: AppConfigService,
    private readonly _auth: Auth
  ) {}

  get defaultUserSettings(): UserSettings {
    return DEFAULT_USER_SETTINGS;
  }

  get userSettings(): Observable<UserSettings> {
    if (!this._userSettings$) {
      this._userSettings$ = merge(this._refreshTimer$, this._userSettingsRefresh$)
        .pipe(
          switchMap(() => iif(() => this._auth.authenticated(), this._getUserSettings(true), of(DEFAULT_USER_SETTINGS)))
        )
        .pipe(map(settings => this._defaultUserSettings(settings)))
        .pipe(shareReplay({refCount: true, bufferSize: 1}));
    }
    return this._userSettings$;
  }

  private _getUserSettings(defaultOnError = false): Observable<UserSettings> {
    const url = `${this.restRoot}/me/settings`;
    const observable = this._httpClient.get<UserSettings>(url);
    return defaultOnError ? observable.pipe(catchError(() => of(DEFAULT_USER_SETTINGS))) : observable;
  }

  private _defaultUserSettings(settings: UserSettings): UserSettings {
    if (!settings) {
      return DEFAULT_USER_SETTINGS;
    }

    Object.keys(DEFAULT_USER_SETTINGS).forEach(key => {
      settings[key] = settings[key] || DEFAULT_USER_SETTINGS[key];
    });

    return settings;
  }

  refreshUserSettings(): void {
    this._userSettingsRefresh$.next();
  }

  patchUserSettings(patch: UserSettings): Observable<UserSettings> {
    const url = `${this.restRoot}/me/settings`;
    return this._httpClient.patch<UserSettings>(url, patch);
  }

  get adminSettings(): Observable<AdminSettings> {
    // Subscribe to websocket and proxy all the settings updates coming from the API to the subject that is
    // exposed in this method. Thanks to that it is possible to have default value and retry mechanism that
    // will run in the background if connection will fail. Subscription to the API should happen only once.
    // Behavior subject is used internally to always emit last value when subscription happens.
    if (!this._adminSettingsWatch$) {
      const webSocket$ = webSocket<AdminSettings>(`${this.wsRoot}/admin/settings`)
        .asObservable()
        .pipe(
          retryWhen(
            // Display error in the console for debugging purposes, otherwise it would be ignored.
            errors =>
              errors.pipe(
                // eslint-disable-next-line no-console
                tap(console.debug),
                delay(this._appConfigService.getRefreshTimeBase() * 3)
              )
          )
        );
      this._adminSettingsWatch$ = iif(() => this._auth.authenticated(), webSocket$, of(DEFAULT_ADMIN_SETTINGS));
      this._adminSettingsWatch$.subscribe(settings => this._adminSettings$.next(this._defaultAdminSettings(settings)));
    }

    return this._adminSettings$;
  }

  get defaultAdminSettings(): AdminSettings {
    return DEFAULT_ADMIN_SETTINGS;
  }

  private _defaultAdminSettings(settings: AdminSettings): AdminSettings {
    if (!settings) {
      return DEFAULT_ADMIN_SETTINGS;
    }

    Object.keys(DEFAULT_ADMIN_SETTINGS).forEach(key => {
      settings[key] = settings[key] === undefined ? DEFAULT_ADMIN_SETTINGS[key] : settings[key];
    });

    return settings;
  }

  patchAdminSettings(patch: any): Observable<Settings> {
    const url = `${this.restRoot}/admin/settings`;
    return this._httpClient.patch<Settings>(url, patch);
  }

  get customLinks(): Observable<CustomLink[]> {
    if (!this._customLinks$) {
      this._customLinks$ = merge(this._refreshTimer$, this._customLinksRefresh$)
        .pipe(switchMap(() => this.getCustomLinks_()))
        .pipe(shareReplay({refCount: true, bufferSize: 1}));
    }
    return this._customLinks$;
  }

  private getCustomLinks_(): Observable<CustomLink[]> {
    const url = `${this.restRoot}/admin/settings/customlinks`;
    return this._httpClient.get<CustomLink[]>(url).pipe(catchError(() => of([])));
  }

  refreshCustomLinks(): void {
    this._customLinksRefresh$.next();
  }

  get admins(): Observable<Admin[]> {
    if (!this._admins$) {
      this._admins$ = merge(this._refreshTimer$, this._adminsRefresh$)
        .pipe(switchMap(() => this._getAdmins()))
        .pipe(shareReplay({refCount: true, bufferSize: 1}));
    }
    return this._admins$;
  }

  private _getAdmins(): Observable<Admin[]> {
    const url = `${this.restRoot}/admin`;
    return this._httpClient.get<Admin[]>(url);
  }

  refreshAdmins(): void {
    this._adminsRefresh$.next();
  }

  setAdmin(admin: Admin): Observable<Admin> {
    const url = `${this.restRoot}/admin`;
    return this._httpClient.put<Admin>(url, admin);
  }
}
