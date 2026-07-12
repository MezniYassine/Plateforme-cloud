import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VmConsole } from './vm-console';

describe('VmConsole', () => {
  let component: VmConsole;
  let fixture: ComponentFixture<VmConsole>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VmConsole]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VmConsole);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
