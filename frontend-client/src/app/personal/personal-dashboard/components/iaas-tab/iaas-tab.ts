import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { VM, PersonalDashboardHelperService } from '../../personal-dashboard-helper.service';

@Component({
  selector: 'app-iaas-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './iaas-tab.html',
  styleUrl: './iaas-tab.scss'
})
export class IaasTabComponent {
  vms = input.required<VM[]>();

  openDeploy = output<{ type: 'vm' | 'catalog'; name: string }>();
  vmAction = output<{ id: string; action: 'stop' | 'start' | 'delete' }>();
  openUpgrade = output<VM>();

  searchTerm = signal<string>('');
  statusFilter = signal<'all' | 'running' | 'stopped' | 'provisioning'>('all');
  copiedIp = signal<string | null>(null);

  // Computed summary metrics
  totalVms = computed(() => this.vms().length);
  runningCount = computed(() => this.vms().filter(v => v.status === 'running').length);
  stoppedCount = computed(() => this.vms().filter(v => v.status === 'stopped').length);
  totalCpu = computed(() => this.vms().reduce((acc, v) => acc + (v.cpu || 0), 0));
  totalRam = computed(() => this.vms().reduce((acc, v) => acc + (v.ram || 0), 0));
  totalCost = computed(() => this.vms().reduce((acc, v) => acc + (v.cost || 0), 0));

  // Filtered VM list
  filteredVms = computed(() => {
    let list = this.vms();
    const query = this.searchTerm().trim().toLowerCase();
    const filter = this.statusFilter();

    if (filter !== 'all') {
      list = list.filter(v => v.status === filter);
    }

    if (query) {
      list = list.filter(v =>
        (v.name && v.name.toLowerCase().includes(query)) ||
        (v.ip && v.ip.toLowerCase().includes(query)) ||
        (v.os && v.os.toLowerCase().includes(query)) ||
        (v.catalogName && v.catalogName.toLowerCase().includes(query))
      );
    }

    return list;
  });

  constructor(public h: PersonalDashboardHelperService) { }

  onVmAction(id: string, action: 'stop' | 'start' | 'delete') {
    this.vmAction.emit({ id, action });
  }

  onUpgrade(vm: VM) {
    this.openUpgrade.emit(vm);
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

  setFilter(status: 'all' | 'running' | 'stopped' | 'provisioning') {
    this.statusFilter.set(status);
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
}
