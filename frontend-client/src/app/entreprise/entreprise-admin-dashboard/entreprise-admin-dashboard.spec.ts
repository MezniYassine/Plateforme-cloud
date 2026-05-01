import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EntrepriseAdminDashboard } from './entreprise-admin-dashboard';

describe('EntrepriseAdminDashboard', () => {
  let component: EntrepriseAdminDashboard;
  let fixture: ComponentFixture<EntrepriseAdminDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EntrepriseAdminDashboard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EntrepriseAdminDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
