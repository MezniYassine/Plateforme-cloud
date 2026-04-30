import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListClient } from './list-client';

describe('ListClient', () => {
  let component: ListClient;
  let fixture: ComponentFixture<ListClient>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListClient]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListClient);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
