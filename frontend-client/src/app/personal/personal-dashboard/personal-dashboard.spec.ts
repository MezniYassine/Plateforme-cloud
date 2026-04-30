import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PersonalDashboard } from './personal-dashboard';

describe('PersonalDashboard', () => {
  let component: PersonalDashboard;
  let fixture: ComponentFixture<PersonalDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PersonalDashboard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PersonalDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
