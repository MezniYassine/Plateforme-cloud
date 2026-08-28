import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EsxiService } from './esxi-page.service';

@Component({
  selector: 'app-esxi-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './esxi-page.html',
  styleUrls: ['./esxi-page.scss']
})
export class EsxiPageComponent implements OnInit {
  private esxiService = inject(EsxiService);

  // 4 KPI Cards aligned with Dynamix Cloud Palette
  esxiStats = signal([
    { label: 'Hôtes ESXi', val: '1', sub: 'Hôte actif', cardClass: 'card-anthracite-dark', icon: 'server' },
    { label: 'vCPU alloués', val: '0', sub: 'Calcul en cours...', cardClass: 'card-orange-deep', icon: 'cpu' },
    { label: 'RAM totale', val: '0 GB', sub: 'Calcul en cours...', cardClass: 'card-anthracite-mid', icon: 'ram' },
    { label: 'VMs actives', val: '0', sub: 'VMs en ligne', cardClass: 'card-orange-vibrant', icon: 'vms' },
  ]);

  // Real ESXi Hosts & VMs data
  esxiHosts = signal<any[]>([]);
  selectedHost = signal<any | null>(null);
  vms = signal<any[]>([]);
  showVmModal = signal(false);
  isLoadingVms = signal(false);

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.esxiService.getHostStats().subscribe({
      next: (data) => {
        if (data) {
          const vcpu = data.vcpuTotal || 8;
          const ram = typeof data.ramTotal === 'string' ? data.ramTotal : `${data.ramTotal || 32} GB`;
          const cpuPct = data.cpuPercent || 0;
          const ramPct = data.ramPercent || 0;
          const vmCount = data.vmsCount ?? data.totalVmsCount ?? 0;

          this.esxiHosts.set([{
            id: 'h1',
            name: data.hostname || 'ESXi Lab Host',
            model: data.model || '',
            ip: data.ip || '192.168.1.100',
            vcpu: vcpu,
            ram: ram,
            cpuPct: cpuPct,
            ramPct: ramPct,
            vms: vmCount,
            status: data.status === 'Offline' ? 'rejected' : 'approved'
          }]);

          this.esxiStats.update(stats => {
            stats[0].val = '1';
            stats[0].sub = 'Hôte actif';
            stats[1].val = `${vcpu} vCPU`;
            stats[1].sub = `${cpuPct}% alloués`;
            stats[2].val = ram;
            stats[2].sub = `${ramPct}% utilisés`;
            stats[3].val = `${vmCount}`;
            stats[3].sub = 'VM(s) en ligne';
            return [...stats];
          });
        }
      },
      error: (err) => console.warn('Could not load ESXi host stats', err)
    });
  }

  openVmModal(host: any) {
    this.selectedHost.set(host);
    this.showVmModal.set(true);
    this.isLoadingVms.set(true);
    this.esxiService.getVms().subscribe({
      next: (data) => {
        const clientVms = (data || []).filter((v: any) => {
          const n = (v.name || '').toLowerCase();
          return !n.includes('template') && !n.includes('dbaas') && !n.includes('paas') && !n.includes('saas') && !n.includes('vcenter');
        });
        this.vms.set(clientVms);
        this.isLoadingVms.set(false);
      },
      error: () => {
        this.vms.set([]);
        this.isLoadingVms.set(false);
      }
    });
  }

  closeVmModal() {
    this.showVmModal.set(false);
    this.selectedHost.set(null);
    this.vms.set([]);
  }

  toggleVmPower(vm: any) {
    if (vm.isActionPending) {
      return;
    }
    const action = vm.state === 'poweredOn' ? 'stop' : 'start';
    vm.isActionPending = true;
    this.esxiService.toggleVmPower(vm.id, action).subscribe({
      next: () => {
        vm.state = action === 'start' ? 'poweredOn' : 'poweredOff';
        vm.isActionPending = false;
        this.vms.update(current => [...current]);
      },
      error: () => {
        vm.isActionPending = false;
        this.vms.update(current => [...current]);
      }
    });
  }

  getVmStatusLabel(state: string) {
    return state === 'poweredOn' ? 'En ligne (Running)' : 'Arrêtée (Powered Off)';
  }
}
