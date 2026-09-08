import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EsxiService } from './esxi-page.service';

@Component({
  selector: 'app-esxi-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
    { label: 'VMs actives', val: '0', sub: 'Calcul en cours...', cardClass: 'card-orange-vibrant', icon: 'vms' },
  ]);

  // Real ESXi Hosts & VMs data
  esxiHosts = signal<any[]>([]);
  vms = signal<any[]>([]);
  isLoadingVms = signal(false);

  // Filter & Search Signals
  searchQuery = signal<string>('');
  filterTab = signal<'all' | 'running' | 'stopped' | 'templates'>('all');

  filteredVms = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const tab = this.filterTab();

    return this.vms().filter((vm) => {
      // 1. Text search
      const matchesSearch =
        !q ||
        (vm.name && vm.name.toLowerCase().includes(q)) ||
        (vm.id && vm.id.toString().includes(q)) ||
        (vm.ip && vm.ip.toLowerCase().includes(q)) ||
        (vm.vmType && vm.vmType.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      // 2. Tab filter
      if (tab === 'running') return vm.state === 'poweredOn';
      if (tab === 'stopped') return vm.state === 'poweredOff';
      if (tab === 'templates') return (vm.name || '').toLowerCase().includes('template');
      return true;
    });
  });

  runningVmsCount = computed(() => this.vms().filter((v) => v.state === 'poweredOn').length);
  stoppedVmsCount = computed(() => this.vms().filter((v) => v.state !== 'poweredOn').length);
  templatesCount = computed(() => this.vms().filter((v) => (v.name || '').toLowerCase().includes('template')).length);

  ngOnInit() {
    this.loadData();
    this.loadVms();
  }

  loadData() {
    this.esxiService.getHostStats().subscribe({
      next: (data) => {
        if (data) {
          const vcpu = data.vcpuTotal || 2;
          const ram = typeof data.ramTotal === 'string' ? data.ramTotal : `${data.ramTotal || 8} GB`;
          const cpuPct = data.cpuPercent || 0;
          const ramPct = data.ramPercent || 0;

          this.esxiHosts.set([{
            id: 'h1',
            name: data.hostname || 'esxi-host-01',
            model: data.model || 'VMware ESXi Host',
            ip: data.ip || '192.168.8.132',
            vcpu: vcpu,
            ram: ram,
            cpuPct: cpuPct,
            ramPct: ramPct,
            status: data.status === 'Offline' ? 'rejected' : 'approved'
          }]);

          this.esxiStats.update(stats => {
            stats[0].val = '1';
            stats[0].sub = 'Hôte actif';
            stats[1].val = `${vcpu} vCPU`;
            stats[1].sub = `${cpuPct}% alloués`;
            stats[2].val = ram;
            stats[2].sub = `${ramPct}% utilisés`;
            return [...stats];
          });
        }
      },
      error: (err) => console.warn('Could not load ESXi host stats', err)
    });
  }

  loadVms() {
    this.isLoadingVms.set(true);
    this.esxiService.getVms().subscribe({
      next: (data) => {
        const allVms = (data || []).map((v: any) => {
          const nameLower = (v.name || '').toLowerCase();
          let type = 'VM Client';
          let typeClass = 'type-vm';

          if (nameLower.includes('template')) {
            type = 'Template';
            typeClass = 'type-template';
          } else if (nameLower.includes('dbaas') || nameLower.includes('paas')) {
            type = 'Système (DBaaS)';
            typeClass = 'type-dbaas';
          } else if (nameLower.includes('saas')) {
            type = 'Système (SaaS)';
            typeClass = 'type-saas';
          } else if (nameLower.includes('windows')) {
            type = 'VM Windows';
            typeClass = 'type-windows';
          } else if (nameLower.includes('ubuntu') || nameLower.includes('debian') || nameLower.includes('alpine')) {
            type = 'VM Linux';
            typeClass = 'type-linux';
          }

          return {
            ...v,
            vmType: type,
            vmTypeClass: typeClass,
            ip: v.ipAddress || v.ip || null,
            isActionPending: false,
          };
        });

        this.vms.set(allVms);
        this.isLoadingVms.set(false);

        // Update KPI Card 4
        const running = allVms.filter((v: any) => v.state === 'poweredOn').length;
        const total = allVms.length;
        this.esxiStats.update(stats => {
          if (stats[3]) {
            stats[3].val = `${running} / ${total}`;
            stats[3].sub = `${running} en ligne sur ${total} VMs`;
          }
          return [...stats];
        });
      },
      error: (err) => {
        console.error('Erreur chargement VMs ESXi:', err);
        this.vms.set([]);
        this.isLoadingVms.set(false);
      }
    });
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

        // Update Card 4
        const running = this.vms().filter(v => v.state === 'poweredOn').length;
        const total = this.vms().length;
        this.esxiStats.update(stats => {
          if (stats[3]) {
            stats[3].val = `${running} / ${total}`;
            stats[3].sub = `${running} en ligne sur ${total} VMs`;
          }
          return [...stats];
        });
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
