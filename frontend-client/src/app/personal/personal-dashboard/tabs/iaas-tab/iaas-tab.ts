import { Component, input, output } from '@angular/core';
import { VM } from '../../personal-dashboard-helper.service';
import { PersonalDashboardHelperService } from '../../personal-dashboard-helper.service';

@Component({
  selector: 'app-iaas-tab',
  standalone: true,
  imports: [],
  templateUrl: './iaas-tab.html',
})
export class IaasTabComponent {
  vms = input.required<VM[]>();

  openDeploy = output<{ type: 'vm' | 'catalog'; name: string }>();
  vmAction   = output<{ id: string; action: 'stop' | 'start' | 'delete' }>();

  constructor(public h: PersonalDashboardHelperService) {}

  onVmAction(id: string, action: 'stop' | 'start' | 'delete') {
    this.vmAction.emit({ id, action });
  }
}
