import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnDestroy, OnInit, PLATFORM_ID, signal, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';

import { Personal, VM, VmEntity, VmTemplate, ServiceItem } from './personal-dashboard-helper.service';
import { PersonalDashboardHelperService } from './personal-dashboard-helper.service';
import { OverviewTabComponent } from './components/overview-tab/overview-tab';
import { IaasTabComponent } from './components/iaas-tab/iaas-tab';
import { PaasTabComponent } from './components/paas-tab/paas-tab';
import { SaasTabComponent } from './components/saas-tab/saas-tab';
import { MonitorTabComponent } from './components/monitor-tab/monitor-tab';
import { BillingTabComponent } from './components/billing-tab/billing-tab';
import { ProfileTabComponent } from './components/profile-tab/profile-tab';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';
import { PaasInstance } from './personal-dashboard-helper.service';

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
export class PersonalDashboard implements OnInit, OnDestroy {
  /* inject() runs before property initializers, fixing TS2729 */
  h = inject(PersonalDashboardHelperService);

  activeTab = signal<string>('overview');
  private platformId = inject(PLATFORM_ID);
  isBrowserAndReady = false;
  actualPers = signal<Personal | null>(null);
  isDeploying = signal<boolean>(false);
  private vmPoll?: ReturnType<typeof setInterval>;



  constructor(private router: Router, private http: HttpClient) {
  }

  ngOnInit() {

    this.monitorBars.set({
      'vm-001': this.h.createRandomBars(),
      'vm-002': this.h.createRandomBars(),
      'vm-003': this.h.createRandomBars(),
    });
    if (isPlatformBrowser(this.platformId)) {
      this.isBrowserAndReady = true;
      this.loadCurrentPers();
      this.loadVmTemplates();
      this.h.loadCatalog(() => this.loadMyVms());
      this.h.loadWallet();
      this.startVmPolling();
    }
  }

  ngOnDestroy() {
    this.stopVmPolling();
  }

  titles: Record<string, string> = {
    overview: "Vue d'ensemble", iaas: 'Mes VMs (IaaS)',
    paas: 'Services PaaS', saas: 'Catalogue SaaS',
    monitor: 'Monitoring', billing: 'Facturation & Wallet', profile: 'Mon profil',
  };

  /* ── VMs & PAAS ──────────────────────────────────────────── */
  vms = signal<VM[]>([]);
  paasInstances = signal<PaasInstance[]>([]);

  monitorBars = signal<Record<string, number[]>>({});
  monitorBarTimes = signal<Record<string, string[]>>({});
  lastRefresh = signal<Date | null>(null);

  /* ── DEPLOY MODAL ─────────────────────────────────── */
  isDeployModalOpen = signal<boolean>(false);
  deployType = signal<'vm' | 'paas' | 'catalog'>('vm');
  deployName = signal<string>('');
  deployCpu = signal<number>(2);
  deployRam = signal<number>(4);
  deployDisk = signal<number>(50);
  deployVmName = signal<string>('');
  vmTemplates = signal<VmTemplate[]>([]);
  selectedTemplateName = signal<string>('');
  deployStep = signal<1 | 2>(1);
  selectedPlan = signal<ServiceItem | null>(null);
  selectedSgbd = signal<'POSTGRESQL' | 'MYSQL' | 'REDIS' | 'MONGODB'>('POSTGRESQL');

  vmPlans = computed(() =>
    this.h.catalogItems().filter(item => item.icon === 'vm' || item.tag === 'IaaS' || item.tag === 'IAAS')
  );

  paasPlans = computed(() =>
    this.h.catalogItems().filter(item => item.icon === 'db' || item.icon === 'redis' || item.icon === 'mongo' || item.icon === 'PAAS' || item.tag === 'PaaS' || item.tag === 'PAAS' || (item as any).typeService === 'PAAS')
  );

  costPreview = computed(() => {
    const plan = this.selectedPlan();
    if (plan) return parseFloat(plan.price || '0').toFixed(2);
    return '0.00';
  });

  /* ── TOAST ────────────────────────────────────────── */
  toastMsg = signal<string>('');
  toastColor = signal<string>('var(--green)');
  isToastVisible = signal<boolean>(false);

  /* ── CONFIRM TOAST ────────────────────────────────── */
  isConfirmToastVisible = signal<boolean>(false);
  confirmToastMsg = signal<string>('');
  private itemToDelete: { type: 'vm' | 'paas', id: string | number } | null = null;

  showConfirmToast(type: 'vm' | 'paas', id: string | number, name: string) {
    this.itemToDelete = { type, id };
    this.confirmToastMsg.set(`Supprimer ${name} ?`);
    this.isConfirmToastVisible.set(true);
  }

  cancelDelete() {
    this.isConfirmToastVisible.set(false);
    this.itemToDelete = null;
  }

  confirmDelete() {
    const item = this.itemToDelete;
    if (!item) return;

    this.isConfirmToastVisible.set(false);
    this.itemToDelete = null;

    if (item.type === 'vm') {
      const vmId = item.id as string;
      const vm = this.vms().find(v => v.id === vmId);
      if (!vm) return;

      this.h.deleteVm(vmId).subscribe({
        next: () => {
          this.vms.update(list => list.filter(v => v.id !== vmId));
          this.showToast(`${vm.name} supprimée`, 'var(--red)');
        },
        error: (err) => {
          this.showToast(err?.error?.message ?? 'Suppression impossible', 'var(--red)');
        },
      });
    } else if (item.type === 'paas') {
      const paasId = item.id as number;
      this.h.deletePaas(paasId).subscribe({
        next: () => {
          this.showToast('Service PaaS supprimé', 'var(--green)');
          const clientId = this.actualPers()?.client?.id;
          if (clientId) this.loadMyPaas(clientId);
        },
        error: (err) => {
          this.showToast(err?.error?.message ?? 'Erreur lors de la suppression', 'var(--red)');
        }
      });
    }
  }

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
      this.showConfirmToast('vm', id, vm.name);
      return;
    }

    // Mettre la VM en état "provisioning" pendant l'appel API (feedback visuel)
    this.vms.update(list => {
      const newList = [...list];
      newList[vmIndex] = { ...vm, status: 'provisioning' };
      return newList;
    });

    this.h.powerVm(id, action).subscribe({
      next: (res) => {
        const newStatus: VM['status'] = res.newStatus === 'RUNNING' ? 'running' : 'stopped';
        this.vms.update(list => {
          const idx = list.findIndex(v => v.id === id);
          if (idx === -1) return list;
          const newList = [...list];
          if (newStatus === 'running') {
            this.ensureMonitorBars(id);
            newList[idx] = { ...list[idx], status: 'running', cpuUse: null, ramUse: null };
          } else {
            newList[idx] = { ...list[idx], status: 'stopped', cpuUse: 0, ramUse: 0 };
          }
          return newList;
        });
        const label = action === 'start' ? 'démarrée' : 'arrêtée';
        const color = action === 'start' ? 'var(--green)' : 'var(--amber)';
        this.showToast(`${vm.name} ${label}`, color);
        this.loadMyVms();
      },
      error: (err) => {
        // Restaurer l'état original en cas d'erreur
        this.vms.update(list => {
          const idx = list.findIndex(v => v.id === id);
          if (idx === -1) return list;
          const newList = [...list];
          newList[idx] = { ...vm };
          return newList;
        });
        this.showToast(err?.error?.message ?? `Impossible d'exécuter l'action`, 'var(--red)');
      },
    });
  }

  /* ── DEPLOY ───────────────────────────────────────── */
  handleOpenDeploy(event: { type: 'vm' | 'paas' | 'catalog'; name: string }) {
    this.openDeploy(event.type, event.name);
  }

  openDeploy(type: 'vm' | 'paas' | 'catalog', name: string = '') {
    this.deployType.set(type);
    this.deployName.set(name);
    this.deployCpu.set(2);
    this.deployRam.set(4);
    this.deployDisk.set(50);
    this.deployVmName.set('');
    this.deployStep.set(1);
    this.selectedPlan.set(null);
    this.selectedSgbd.set('POSTGRESQL');
    if (!this.selectedTemplateName() && this.vmTemplates().length > 0) {
      this.selectedTemplateName.set(this.vmTemplates()[0].name);
    }
    this.isDeployModalOpen.set(true);
  }

  goToStep2() {
    if (!this.deployVmName().trim()) {
      this.showToast("Veuillez saisir un nom d'instance", 'var(--red)');
      return;
    }
    if (this.deployType() === 'vm' && !this.selectedTemplateName() && this.vmTemplates().length > 0) {
      this.showToast('Veuillez sélectionner un système d\'exploitation', 'var(--red)');
      return;
    }
    this.deployStep.set(2);
  }

  goToStep1() {
    this.deployStep.set(1);
  }

  selectPlan(plan: ServiceItem) {
    this.selectedPlan.set(plan);
    (plan.specs ?? []).forEach(spec => {
      const lower = spec.toLowerCase().trim();
      const num = parseInt(lower.match(/\d+/)?.[0] ?? '0', 10);
      if (!num) return;
      if (lower.includes('vcpu') || lower.includes('cpu')) {
        this.deployCpu.set(num);
      } else if (lower.includes('ram')) {
        this.deployRam.set(num);
      } else if (lower.includes('gb') || lower.includes('ssd') || lower.includes('stockage')) {
        if (!lower.includes('ram')) this.deployDisk.set(num);
      }
    });
  }

  closeModal() { this.isDeployModalOpen.set(false); }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-ov')) this.closeModal();
  }

  confirmDeploy() {
    if (this.deployType() === 'vm') {
      const templateName = this.selectedTemplateName();
      const selectedPlan = this.selectedPlan();
      if (!templateName) {
        this.showToast('Veuillez sélectionner un OS', 'var(--red)');
        return;
      }
      if (!selectedPlan) {
        this.showToast('Veuillez sélectionner un plan IaaS', 'var(--red)');
        return;
      }
      const name = this.deployVmName() || `vm-${Date.now().toString().slice(-4)}`;

      this.closeModal();
      this.showToast(`${name} en cours de déploiement...`, 'var(--blue)');

      this.h.createVm({
        name,
        ramGB: this.deployRam(),
        vCPU: this.deployCpu(),
        storageGB: this.deployDisk(),
        templateName,
        catalogueId: selectedPlan.id,
      }).subscribe({
        next: (res) => {
          this.vms.update(list => [this.mapVm(res.vm), ...list]);
          this.startVmPolling();
        },
        error: (err) => {
          this.showToast(err?.error?.message ?? 'Déploiement impossible', 'var(--red)');
        },
      });
      return;

    } else if (this.deployType() === 'paas') {
      const selectedPlan = this.selectedPlan();
      if (!selectedPlan) {
        this.showToast('Veuillez sélectionner un plan PaaS', 'var(--red)');
        return;
      }
      const clientId = this.actualPers()?.client?.id;
      if (!clientId) {
        this.showToast('Erreur: Client non identifié', 'var(--red)');
        return;
      }

      this.closeModal();
      this.showToast(`PaaS en cours de déploiement...`, 'var(--blue)');

      this.h.createPaas({
        nomPersonnalise: this.deployVmName(),
        typeSgbd: this.selectedSgbd(),
        clientId: clientId,
        catalogueId: selectedPlan.id
      }).subscribe({
        next: () => {
          this.showToast('Service PaaS déployé avec succès !', 'var(--green)');
          this.h.loadWallet(); // Reload wallet to update balance
          const clientId = this.actualPers()?.client?.id;
          if (clientId) this.loadMyPaas(clientId);
        },
        error: (err) => {
          this.isDeploying.set(false);
          this.showToast(err?.error?.message ?? 'Déploiement impossible', 'var(--red)');
        }
      });
    }
  }

  /* ── WALLET ───────────────────────────────────────── */
  openRecharge() {
    this.h.rechargerWallet();
  }

  /* ── HELPERS ──────────────────────────────────────── */
  private ensureMonitorBars(vmId: string) {
    if (this.monitorBars()[vmId]) return;
    const bars = this.h.createRandomBars();
    const times = this.h.createBarTimes(bars.length);
    this.monitorBars.update(b => ({ ...b, [vmId]: bars }));
    this.monitorBarTimes.update(t => ({ ...t, [vmId]: times }));
  }

  /** Fait glisser une nouvelle valeur + timestamp dans le graphique de chaque VM running */
  private slideMonitorBars(vms: VM[]) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const MAX = 20;

    const newBars = { ...this.monitorBars() };
    const newTimes = { ...this.monitorBarTimes() };

    for (const vm of vms) {
      if (!newBars[vm.id]) continue;          // sera créé par ensureMonitorBars
      const metric = vm.status === 'running' ? (vm.cpuUse ?? 0) : 0;
      newBars[vm.id] = [...newBars[vm.id].slice(-(MAX - 1)), metric];
      newTimes[vm.id] = [...(newTimes[vm.id] ?? []).slice(-(MAX - 1)), timeStr];
    }

    this.monitorBars.set(newBars);
    this.monitorBarTimes.set(newTimes);
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
  updateTemplateName(val: string) { this.selectedTemplateName.set(val); }

  loadCurrentPers() {
    const url = `${environment.apiBaseUrl.replace(/\/$/, '')}/personal/me`;
    this.http.get<any>(url).subscribe({
      next: (pers) => {
        this.actualPers.set(pers);
        console.log('Current pers:', pers);
        if (pers?.client?.id) {
          this.loadMyPaas(pers.client.id);
        }
      },
      error: (err) => console.error('Failed to load current Personal', err)
    });
  }

  loadMyPaas(clientId: number) {
    this.h.getMyPaas(clientId).subscribe({
      next: (data) => {
        const existing = this.paasInstances();
        data = data.map((p: PaasInstance) => {
          const prev = existing.find(e => e.id === p.id);
          if (prev && prev.metrics) {
            p.metrics = prev.metrics;
          }
          return p;
        });
        this.paasInstances.set(data);

        // Fetch metrics for running databases
        data.filter((p: PaasInstance) => p.status === 'RUNNING').forEach((p: PaasInstance) => {
          this.loadPaasMetrics(p.id);
        });
      },
      error: (err) => {
        console.error('Failed to load PaaS instances', err);
      }
    });
  }

  loadPaasMetrics(serviceId: number) {
    this.http.get<any>(`${environment.apiBaseUrl.replace(/\/$/, '')}/paas/${serviceId}/metrics`).subscribe({
      next: (metrics) => {
        this.paasInstances.update(instances =>
          instances.map(p => p.id === serviceId ? { ...p, metrics } : p)
        );
      },
      error: () => { }
    });
  }

  deletePaas(id: number) {
    const paas = this.paasInstances().find(p => p.id === id);
    if (paas) {
      this.showConfirmToast('paas', id, paas.nomPersonnalise);
    }
  }

  private provisioningVms = new Set<string>();

  loadMyVms() {
    this.h.getMyVms().subscribe({
      next: (entities) => {
        const mapped = entities.map((vm) => this.mapVm(vm));
        mapped.forEach(vm => {
          if (vm.status === 'provisioning') {
            this.provisioningVms.add(vm.id);
          } else if (vm.status === 'running' && this.provisioningVms.has(vm.id)) {
            this.provisioningVms.delete(vm.id);
            this.showToast(`${vm.name} provisionnée avec succès !`, 'var(--green)');
            this.h.loadWallet();
          }
        });

        this.vms.set(mapped);
        mapped.forEach((vm) => this.ensureMonitorBars(vm.id));
        this.slideMonitorBars(mapped);
        this.lastRefresh.set(new Date());
      },
      error: (err) => {
        console.error('Failed to load personal VMs', err);
        this.showToast('Impossible de charger vos VMs', 'var(--red)');
      },
    });
  }

  loadVmTemplates() {
    this.h.getVmTemplates().subscribe({
      next: (res) => {
        const templates = (res.data ?? [])
          .filter((vm) => vm.name.toLowerCase().startsWith('template'))
          .map((vm) => ({
            id: vm.id,
            name: vm.name,
            label: vm.name.replace(/^template\s*/i, '').trim() || vm.name,
          }));

        this.vmTemplates.set(templates);

        if (templates.length > 0 && !this.selectedTemplateName()) {
          this.selectedTemplateName.set(templates[0].name);
        }
      },
      error: (err) => {
        console.error('Failed to load ESXi templates', err);
        this.showToast('Impossible de charger les templates ESXi', 'var(--red)');
      },
    });
  }

  private mapVm(entity: VmEntity): VM {
    return this.h.toVm(entity);
  }

  private startVmPolling() {
    if (this.vmPoll) return;
    this.vmPoll = setInterval(() => {
      this.loadMyVms();
      const clientId = this.actualPers()?.client?.id;
      if (clientId) {
        this.loadMyPaas(clientId);
      }
    }, 4000);
  }

  private stopVmPolling() {
    if (!this.vmPoll) return;
    clearInterval(this.vmPoll);
    this.vmPoll = undefined;
  }

  logout() {
    localStorage.removeItem('access_token');
    this.router.navigate(['/login']);
  }

}
