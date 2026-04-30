import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, PLATFORM_ID, signal, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';

import { Personal, VM } from './personal-dashboard-helper.service';
import { PersonalDashboardHelperService } from './personal-dashboard-helper.service';
import { OverviewTabComponent } from './tabs/overview-tab/overview-tab';
import { IaasTabComponent } from './tabs/iaas-tab/iaas-tab';
import { PaasTabComponent } from './tabs/paas-tab/paas-tab';
import { SaasTabComponent } from './tabs/saas-tab/saas-tab';
import { MonitorTabComponent } from './tabs/monitor-tab/monitor-tab';
import { BillingTabComponent } from './tabs/billing-tab/billing-tab';
import { ProfileTabComponent } from './tabs/profile-tab/profile-tab';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-personal-dashboard',
  standalone: true,
  imports: [
    OverviewTabComponent,
    IaasTabComponent,
    PaasTabComponent,
    SaasTabComponent,
    MonitorTabComponent,
    BillingTabComponent,
    ProfileTabComponent,
  ],
  templateUrl: './personal-dashboard.html',
  styleUrl: './personal-dashboard.scss',
  encapsulation: ViewEncapsulation.None,
})
export class PersonalDashboard implements OnInit {
  /* inject() runs before property initializers, fixing TS2729 */
  h = inject(PersonalDashboardHelperService);

  activeTab = signal<string>('overview');
  wallet = signal<number>(142.50);
  private platformId = inject(PLATFORM_ID);
  isBrowserAndReady = false;
  actualPers = signal<Personal | null>(null);



  constructor(private router: Router, private http: HttpClient) {
  }

  ngOnInit() {

    this.monitorBars.set({
      'vm-001': this.h.createRandomBars(),
      'vm-002': this.h.createRandomBars(),
      'vm-003': this.h.createRandomBars(),
    });
    if (isPlatformBrowser(this.platformId)) {
      const token = localStorage.getItem('access_token');

      if (!token) {
        this.router.navigate(['/']);
        return;
      }
      this.isBrowserAndReady = true;
      this.loadCurrentPers();

    }
  }

  titles: Record<string, string> = {
    overview: "Vue d'ensemble", iaas: 'Mes VMs (IaaS)',
    paas: 'Services PaaS', saas: 'Catalogue SaaS',
    monitor: 'Monitoring', billing: 'Facturation & Wallet', profile: 'Mon profil',
  };

  /* ── VMs ──────────────────────────────────────────── */
  vms = signal<VM[]>([
    { id: 'vm-001', name: 'prod-web-01', os: 'Ubuntu 22.04', cpu: 4, ram: 8, disk: 100, cpuUse: 62, ramUse: 74, status: 'running', ip: '10.0.1.10', cost: 18.50 },
    { id: 'vm-002', name: 'dev-api-02', os: 'Debian 12', cpu: 2, ram: 4, disk: 50, cpuUse: 28, ramUse: 41, status: 'running', ip: '10.0.1.11', cost: 9.20 },
    { id: 'vm-003', name: 'staging-03', os: 'CentOS 9', cpu: 2, ram: 4, disk: 80, cpuUse: 0, ramUse: 0, status: 'stopped', ip: '10.0.1.12', cost: 0 },
  ]);

  monitorBars = signal<Record<string, number[]>>({});

  /* ── DEPLOY MODAL ─────────────────────────────────── */
  isDeployModalOpen = signal<boolean>(false);
  deployType = signal<'vm' | 'catalog'>('vm');
  deployName = signal<string>('');
  deployCpu = signal<number>(2);
  deployRam = signal<number>(4);
  deployDisk = signal<number>(50);
  deployVmName = signal<string>('');

  costPreview = computed(() =>
    ((this.deployCpu() * 2.5) + (this.deployRam() * 1.2) + (this.deployDisk() * 0.05)).toFixed(2)
  );

  /* ── TOAST ────────────────────────────────────────── */
  toastMsg = signal<string>('');
  toastColor = signal<string>('var(--green)');
  isToastVisible = signal<boolean>(false);

  /* ── NAVIGATION ───────────────────────────────────── */
  switchTab(key: string) { this.activeTab.set(key); }

  /* ── VM ACTIONS ───────────────────────────────────── */
  handleVmAction(event: { id: string; action: 'stop' | 'start' | 'delete' }) {
    this.vmAction(event.id, event.action);
  }

  vmAction(id: string, action: 'stop' | 'start' | 'delete') {
    const vmIndex = this.vms().findIndex(v => v.id === id);
    if (vmIndex === -1) return;
    const vm = this.vms()[vmIndex];

    if (action === 'delete') {
      if (!confirm(`Supprimer ${vm.name} ?`)) return;
      this.vms.update(list => list.filter(v => v.id !== id));
      this.showToast(`${vm.name} supprimée`, 'var(--red)');
      return;
    }

    this.vms.update(list => {
      const newList = [...list];
      if (action === 'stop') {
        newList[vmIndex] = { ...vm, status: 'stopped', cpuUse: 0, ramUse: 0 };
        this.showToast(`${vm.name} arrêtée`, 'var(--amber)');
      } else if (action === 'start') {
        this.ensureMonitorBars(vm.id);
        newList[vmIndex] = { ...vm, status: 'running', cpuUse: 35, ramUse: 40 };
        this.showToast(`${vm.name} démarrée`, 'var(--green)');
      }
      return newList;
    });
  }

  /* ── DEPLOY ───────────────────────────────────────── */
  handleOpenDeploy(event: { type: 'vm' | 'catalog'; name: string }) {
    this.openDeploy(event.type, event.name);
  }

  openDeploy(type: 'vm' | 'catalog', name: string = '') {
    this.deployType.set(type);
    this.deployName.set(name);
    this.deployCpu.set(2);
    this.deployRam.set(4);
    this.deployDisk.set(50);
    this.deployVmName.set('');
    this.isDeployModalOpen.set(true);
  }

  closeModal() { this.isDeployModalOpen.set(false); }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-ov')) this.closeModal();
  }

  confirmDeploy() {
    const isVm = this.deployType() === 'vm';
    this.closeModal();

    if (isVm) {
      const name = this.deployVmName() || 'new-vm';
      const newVm: VM = {
        id: 'vm-0' + Date.now(), name,
        os: 'Ubuntu 22.04',
        cpu: this.deployCpu(), ram: this.deployRam(), disk: this.deployDisk(),
        cpuUse: 0, ramUse: 0, status: 'provisioning',
        ip: '10.0.1.' + Math.floor(Math.random() * 99 + 10),
        cost: parseFloat(this.costPreview()),
      };
      this.vms.update(l => [...l, newVm]);
      this.showToast(`${name} en cours de déploiement…`, 'var(--blue)');

      setTimeout(() => {
        this.vms.update(list => {
          const idx = list.findIndex(v => v.id === newVm.id);
          if (idx !== -1) {
            this.ensureMonitorBars(newVm.id);
            const nl = [...list];
            nl[idx] = { ...list[idx], status: 'running', cpuUse: 15, ramUse: 20 };
            return nl;
          }
          return list;
        });
        this.showToast(`${name} est opérationnelle !`, 'var(--green)');
      }, 3000);
    } else {
      this.showToast('Service déployé avec succès !', 'var(--green)');
    }
  }

  /* ── WALLET ───────────────────────────────────────── */
  openRecharge() {
    this.wallet.update(w => w + 100);
    this.showToast('Wallet rechargé de 100 DT', 'var(--green)');
  }

  /* ── HELPERS ──────────────────────────────────────── */
  private ensureMonitorBars(vmId: string) {
    if (this.monitorBars()[vmId]) return;
    this.monitorBars.update(bars => ({ ...bars, [vmId]: this.h.createRandomBars() }));
  }

  showToast(msg: string, color: string = 'var(--green)') {
    this.toastMsg.set(msg);
    this.toastColor.set(color);
    this.isToastVisible.set(true);
    setTimeout(() => this.isToastVisible.set(false), 3400);
  }

  updateCpu(val: string) { this.deployCpu.set(parseInt(val, 10)); }
  updateRam(val: string) { this.deployRam.set(parseInt(val, 10)); }
  updateDisk(val: string) { this.deployDisk.set(parseInt(val, 10)); }
  updateDeployName(val: string) { this.deployVmName.set(val); }

  loadCurrentPers() {
    const url = `${environment.apiBaseUrl.replace(/\/$/, '')}/personal/me`;
    this.http.get<any>(url).subscribe({
      next: (pers) => {
        this.actualPers.set(pers);
        console.log(pers);
      },
      error: (err) => console.error('Failed to load current Personal', err)
    });

  }

}
