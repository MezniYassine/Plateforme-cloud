import { Component, input, output, signal } from '@angular/core';
import { VM, ServiceItem, PaasInstance } from '../../personal-dashboard-helper.service';
import { PersonalDashboardHelperService } from '../../personal-dashboard-helper.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-overview-tab',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './overview-tab.html',
  styleUrl: './overview-tab.scss'
})
export class OverviewTabComponent {
  vms    = input.required<VM[]>();
  paasInstances = input.required<PaasInstance[]>();

  openDeploy  = output<{ type: 'vm' | 'catalog'; name: string }>();
  switchTab   = output<string>();
  vmAction    = output<{ id: string; action: 'stop' | 'start' | 'delete' }>();

  copiedIp = signal<string | null>(null);

  constructor(public h: PersonalDashboardHelperService) {}

  onVmAction(id: string, action: 'stop' | 'start' | 'delete') {
    this.vmAction.emit({ id, action });
  }

  copyIp(ip: string, event?: Event) {
    if (event) event.stopPropagation();
    if (!ip || ip === 'N/A' || ip === 'En attente') return;
    navigator.clipboard.writeText(ip);
    this.copiedIp.set(ip);
    setTimeout(() => {
      if (this.copiedIp() === ip) {
        this.copiedIp.set(null);
      }
    }, 2000);
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

  getOsLogo(os?: string): string {
    const o = (os || '').toLowerCase();
    if (o.includes('ubuntu')) return 'assets/ubuntu.png';
    if (o.includes('debian')) return 'assets/Debian.png';
    if (o.includes('alpine')) return 'assets/alpine.png';
    if (o.includes('2000')) return 'assets/windows 2000.png';
    if (o.includes('windows') || o.includes('win')) return 'assets/windows 7.png';
    return 'assets/ubuntu.png';
  }

  getSgbdLogo(type: string): string {
    const t = (type || '').toUpperCase();
    if (t.includes('POSTGRESQL')) return 'assets/PostgreSQL Logo.png';
    if (t.includes('MYSQL')) return 'assets/MySQL Logo.png';
    if (t.includes('REDIS')) return 'assets/Redis logo.png';
    if (t.includes('MONGO')) return 'assets/MongoDB Logo.png';
    return 'assets/PostgreSQL Logo.png';
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
    if (type === 'MONGODB') return '#10B981';
    return 'var(--blue)';
  }
}
