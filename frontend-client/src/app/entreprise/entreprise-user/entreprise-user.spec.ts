import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EntrepriseUser } from './entreprise-user';

describe('EntrepriseUser', () => {
  let component: EntrepriseUser;
  let fixture: ComponentFixture<EntrepriseUser>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EntrepriseUser]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EntrepriseUser);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
