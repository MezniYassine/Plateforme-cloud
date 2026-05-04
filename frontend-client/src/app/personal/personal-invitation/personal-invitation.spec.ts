import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PersonalInvitation } from './personal-invitation';

describe('PersonalInvitation', () => {
  let component: PersonalInvitation;
  let fixture: ComponentFixture<PersonalInvitation>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PersonalInvitation]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PersonalInvitation);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
