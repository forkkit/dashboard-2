import {async, ComponentFixture, TestBed} from '@angular/core/testing';
import {BrowserModule, By} from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {Router} from '@angular/router';
import {RouterTestingModule} from '@angular/router/testing';
import {Auth} from '../../core/services';
import {SharedModule} from '../../shared/shared.module';
import {RouterStub} from '../../testing/router-stubs';
import {AuthMockService} from '../../testing/services/auth-mock.service';
import {click} from '../../testing/utils/click-handler';
import {PageNotFoundComponent} from './page-not-found.component';

const modules: any[] = [BrowserModule, RouterTestingModule, BrowserAnimationsModule, SharedModule];

describe('PageNotFoundComponent', () => {
  let fixture: ComponentFixture<PageNotFoundComponent>;
  let component: PageNotFoundComponent;
  let authService: AuthMockService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [...modules],
      declarations: [PageNotFoundComponent],
      providers: [
        {provide: Router, useClass: RouterStub},
        {provide: Auth, useClass: AuthMockService},
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(PageNotFoundComponent);
    component = fixture.componentInstance;

    authService = fixture.debugElement.injector.get(Auth) as any;
    router = fixture.debugElement.injector.get(Router);
  });

  it('should create the cmp', async(() => {
    expect(component).toBeTruthy();
  }));

  it('should navigate to clusters list', () => {
    const spyNavigate = jest.spyOn(router, 'navigate');
    authService.isAuth = true;

    fixture.detectChanges();
    const deButton = fixture.debugElement.query(By.css('button'));
    click(deButton);

    const navArgs = spyNavigate.mock.calls[0][0];
    expect(spyNavigate).toHaveBeenCalledTimes(1);
    expect(navArgs[0]).toBe('/projects');
  });

  it('should navigate to the front apge', () => {
    const spyNavigate = jest.spyOn(router, 'navigate');
    authService.isAuth = false;

    fixture.detectChanges();
    const deButton = fixture.debugElement.query(By.css('button'));
    click(deButton);

    const navArgs = spyNavigate.mock.calls[0][0];
    expect(spyNavigate).toHaveBeenCalledTimes(1);
    expect(navArgs[0]).toBe('');
  });
});
