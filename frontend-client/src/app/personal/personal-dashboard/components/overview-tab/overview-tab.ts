import { Component, input, output } from '@angular/core';
import { VM, ServiceItem, PaasInstance } from '../../personal-dashboard-helper.service';
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
  paasInstances = input.required<PaasInstance[]>();

  openDeploy  = output<{ type: 'vm' | 'catalog'; name: string }>();
  switchTab   = output<string>();
  vmAction    = output<{ id: string; action: 'stop' | 'start' | 'delete' }>();

  constructor(public h: PersonalDashboardHelperService) {}

  onVmAction(id: string, action: 'stop' | 'start' | 'delete') {
    this.vmAction.emit({ id, action });
  }

  get vmsSpend(): number {
    return this.vms().reduce((acc, vm) => acc + (vm.cost || 0), 0);
  }

  get paasSpend(): number {
    return this.paasInstances().reduce((acc, paas) => acc + (parseFloat(paas.prixMensuel as unknown as string) || 0), 0);
  }

  get totalSpend(): number {
    return this.vmsSpend + this.paasSpend;
  }

  getIconForSgbd(type: string): string {
    if (type === 'POSTGRESQL') return 'db';
    if (type === 'MYSQL') return 'db';
    if (type === 'REDIS') return 'redis';
    if (type === 'MONGODB') return 'mongo';
    return 'db';
  }

  getColorForSgbd(type: string): string {
    if (type === 'POSTGRESQL') return 'var(--blue)';
    if (type === 'MYSQL') return '#e65c00';
    if (type === 'REDIS') return 'var(--red)';
    if (type === 'MONGODB') return '#10B981'; // Green color for Mongo
    return 'var(--blue)';
  }
}
