import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DashboardHelperService, MyVM } from '../../dashboard-helper.service';

@Component({
  selector: 'app-vms',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './vms.html',
  styleUrls: ['./vms.scss']
})
export class Vms {
  state = inject(DashboardHelperService);

  copiedIp = signal<string | null>(null);
  searchTerm = signal<string>('');
  statusFilter = signal<string>('all');

  stats = computed(() => {
    const list = this.state.myVMs();
    const total = list.length;
    const runningCount = list.filter(v => v.status === 'running').length;
    const stoppedCount = list.filter(v => v.status !== 'running').length;
    const totalVcpus = list.reduce((acc, v) => acc + (v.vcpu || 0), 0);
    const totalCost = list.reduce((acc, v) => acc + (v.cost || 0), 0);
    return { total, runningCount, stoppedCount, totalVcpus, totalCost };
  });

  filteredVms = computed(() => {
    let list = this.state.myVMs();
    const sf = this.statusFilter();
    if (sf !== 'all') {
      list = list.filter(v => (sf === 'running' ? v.status === 'running' : v.status !== 'running'));
    }
    const query = this.searchTerm().trim().toLowerCase();
    if (!query) return list;
    return list.filter(v =>
      (v.name && v.name.toLowerCase().includes(query)) ||
      (v.os && v.os.toLowerCase().includes(query)) ||
      (v.ip && v.ip.toLowerCase().includes(query))
    );
  });

  getOsLogo(os?: string): string {
    const o = (os || '').toLowerCase();
    if (o.includes('ubuntu')) return 'assets/ubuntu.png';
    if (o.includes('debian')) return 'assets/Debian.png';
    if (o.includes('alpine')) return 'assets/alpine.png';
    if (o.includes('2000')) return 'assets/windows 2000.png';
    if (o.includes('windows') || o.includes('win')) return 'assets/windows 7.png';
    return 'assets/ubuntu.png';
  }

  getOsClass(os?: string): string {
    const o = (os || '').toLowerCase();
    if (o.includes('ubuntu')) return 'os-ubuntu';
    if (o.includes('debian')) return 'os-debian';
    if (o.includes('alpine')) return 'os-alpine';
    if (o.includes('windows') || o.includes('win')) return 'os-windows';
    return 'os-default';
  }

  copyIp(ip: string, event: MouseEvent) {
    event.stopPropagation();
    if (!ip) return;
    navigator.clipboard.writeText(ip);
    this.copiedIp.set(ip);
    setTimeout(() => this.copiedIp.set(null), 2000);
  }
}
