import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Suspanded } from './suspanded';

describe('Suspanded', () => {
  let component: Suspanded;
  let fixture: ComponentFixture<Suspanded>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Suspanded]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Suspanded);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
