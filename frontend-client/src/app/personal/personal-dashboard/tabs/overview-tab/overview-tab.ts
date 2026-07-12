import { Component, input, output } from '@angular/core';
import { VM, ServiceItem } from '../../personal-dashboard-helper.service';
import { PersonalDashboardHelperService } from '../../personal-dashboard-helper.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-overview-tab',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './overview-tab.html',
})
export class OverviewTabComponent {
  vms    = input.required<VM[]>();

  openDeploy  = output<{ type: 'vm' | 'catalog'; name: string }>();
  switchTab   = output<string>();
  vmAction    = output<{ id: string; action: 'stop' | 'start' | 'delete' }>();

  constructor(public h: PersonalDashboardHelperService) {}

  onVmAction(id: string, action: 'stop' | 'start' | 'delete') {
    this.vmAction.emit({ id, action });
  }

  get totalSpend(): number {
    return this.vms().reduce((acc, vm) => acc + (vm.cost || 0), 0);
  }
}
