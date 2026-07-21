import { Component, signal, inject, OnInit } from '@angular/core';
import { EsxiService } from './esxi-page.service';

@Component({
  selector: 'app-esxi-page',
  standalone: true,
  templateUrl: './esxi-page.html',
  styleUrls: ['./esxi-page.scss']
})
export class EsxiPageComponent implements OnInit {
  private esxiService = inject(EsxiService);

  // Tes stats du haut (Cards)
  esxiStats = signal([
    { label: 'Hôtes ESXi', val: '1', sub: 'En ligne', bg: 'var(--blue-light)', color: 'var(--blue)' },
    { label: 'vCPU total', val: '0', sub: 'Calcul en cours...', bg: 'var(--teal-light)', color: 'var(--teal)' },
    { label: 'RAM totale', val: '0 GB', sub: 'Calcul en cours...', bg: 'var(--purple-light)', color: 'var(--purple)' },
    { label: 'VMs actives', val: '0', sub: 'Sur 1 hôte', bg: 'var(--green-light)', color: 'var(--green)' },
  ]);

  // Ton tableau de serveurs
  esxiHosts = signal<any[]>([]);
  selectedHost = signal<any | null>(null);
  vms = signal<any[]>([]);
  showVmModal = signal(false);
  isLoadingVms = signal(false);

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.esxiService.getHostStats().subscribe((data) => {
      this.esxiHosts.set([{
        id: 'h1',
        name: data.hostname,
        model: 'Lab Desktop (i7)',
        ip: data.ip,
        vcpu: data.vcpuTotal,
        ram: data.ramTotal,
        cpuPct: data.cpuPercent,
        ramPct: data.ramPercent,
        vms: data.totalVmsCount ?? data.vmsCount,
        status: data.status === 'Online' ? 'approved' : 'rejected'
      }]);

      this.esxiStats.update(stats => {
        stats[1].val = data.vcpuTotal.toString();
        stats[1].sub = `${data.cpuPercent}% alloués`;
        stats[2].val = data.ramTotal;
        stats[2].sub = `${data.ramPercent}% utilisés`;
        stats[3].val = data.vmsCount.toString();
        return [...stats];
      });
    });
  }

  openVmModal(host: any) {
    this.selectedHost.set(host);
    this.showVmModal.set(true);
    this.isLoadingVms.set(true);
    this.esxiService.getVms().subscribe((data) => {
      this.vms.set(data || []);
      this.isLoadingVms.set(false);
    }, () => {
      this.vms.set([]);
      this.isLoadingVms.set(false);
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
    this.esxiService.toggleVmPower(vm.id, action).subscribe(() => {
      vm.state = action === 'start' ? 'poweredOn' : 'poweredOff';
      vm.isActionPending = false;
      this.vms.update(current => [...current]);
    }, () => {
      vm.isActionPending = false;
      this.vms.update(current => [...current]);
    });
  }

  getVmStatusLabel(state: string) {
    return state === 'poweredOn' ? 'Running' : 'Stopped';
  }
}
