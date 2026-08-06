import { Component, input, output } from '@angular/core';
import { VM } from '../../personal-dashboard-helper.service';
import { PersonalDashboardHelperService } from '../../personal-dashboard-helper.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-iaas-tab',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './iaas-tab.html',
})
export class IaasTabComponent {
  vms = input.required<VM[]>();

  openDeploy = output<{ type: 'vm' | 'catalog'; name: string }>();
  vmAction = output<{ id: string; action: 'stop' | 'start' | 'delete' }>();
  openUpgrade = output<VM>();

  constructor(public h: PersonalDashboardHelperService) { }

  onVmAction(id: string, action: 'stop' | 'start' | 'delete') {
    this.vmAction.emit({ id, action });
  }

  onUpgrade(vm: VM) {
    this.openUpgrade.emit(vm);
  }
}
