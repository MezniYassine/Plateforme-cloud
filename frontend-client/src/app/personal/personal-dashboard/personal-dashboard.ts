import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnDestroy, OnInit, PLATFORM_ID, signal, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';

import { Personal, VM, VmEntity, VmTemplate, ServiceItem, SaasInstance, MetricHistoryItem } from './personal-dashboard-helper.service';
import { PersonalDashboardHelperService } from './personal-dashboard-helper.service';
import { OverviewTabComponent } from './components/overview-tab/overview-tab';
import { IaasTabComponent } from './components/iaas-tab/iaas-tab';
import { PaasTabComponent } from './components/paas-tab/paas-tab';
import { SaasTabComponent } from './components/saas-tab/saas-tab';
import { MonitorTabComponent } from './components/monitor-tab/monitor-tab';
import { BillingTabComponent } from './components/billing-tab/billing-tab';
import { ProfileTabComponent } from './components/profile-tab/profile-tab';
import { SupportContactModalComponent } from '../../common/support-contact-modal/support-contact-modal.component';
import { AiChatViewComponent } from '../../common/ai-chat-view/ai-chat-view.component';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';
import { PaasInstance } from './personal-dashboard-helper.service';
import { SaasAppType } from './saas-app-types';

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
    SupportContactModalComponent,
    AiChatViewComponent,
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
    'ai-chat': 'Assistant IA',
  };

  isSidebarCollapsed = signal<boolean>(typeof localStorage !== 'undefined' ? localStorage.getItem('sidebar_collapsed_personal') === 'true' : false);

  toggleSidebar() {
    this.isSidebarCollapsed.update(v => !v);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('sidebar_collapsed_personal', String(this.isSidebarCollapsed()));
    }
  }

  /* ── VMs & PAAS ──────────────────────────────────────────── */
  vms = signal<VM[]>([]);
  paasInstances = signal<PaasInstance[]>([]);
  saasInstances = signal<SaasInstance[]>([]);

  monitorHistory = signal<Record<string, MetricHistoryItem[]>>({});
  monitorBars = signal<Record<string, number[]>>({});
  monitorBarTimes = signal<Record<string, string[]>>({});
  lastRefresh = signal<Date | null>(null);

  /* ── DEPLOY MODAL ─────────────────────────────────── */
  isDeployModalOpen = signal<boolean>(false);
  deployType = signal<'vm' | 'paas' | 'saas' | 'catalog'>('vm');
  deployName = signal<string>('');
  deployCpu = signal<number>(2);
  deployRam = signal<number>(4);
  deployDisk = signal<number>(50);
  deployVmName = signal<string>('');
  vmTemplates = signal<VmTemplate[]>([]);
  selectedTemplateName = signal<string>('');
  isLoadingTemplates = signal<boolean>(false);

  selectTemplate(name: string) {
    this.selectedTemplateName.set(name);
  }

  getOsLogo(name?: string): string {
    const o = (name || '').toLowerCase();
    if (o.includes('ubuntu')) return 'assets/ubuntu.png';
    if (o.includes('debian')) return 'assets/Debian.png';
    if (o.includes('alpine')) return 'assets/alpine.png';
    if (o.includes('2000')) return 'assets/windows 2000.png';
    if (o.includes('windows') || o.includes('win')) return 'assets/windows 7.png';
    return 'assets/ubuntu.png';
  }
  deployStep = signal<1 | 2>(1);
  selectedPlan = signal<ServiceItem | null>(null);
  selectedSgbd = signal<'POSTGRESQL' | 'MYSQL' | 'REDIS' | 'MONGODB'>('POSTGRESQL');
  selectedSaasApp = signal<string>('wordpress:latest');
  saasLinkedPaasId = signal<number | null>(null);
  saasAdminEmail = signal<string>('');
  saasAdminPassword = signal<string>('');

  saasAppNameMapping: Record<string, string> = {
    'wordpress:latest': 'WordPress',
    'phpmyadmin/phpmyadmin:latest': 'phpMyAdmin',
    'dpage/pgadmin4:latest': 'pgAdmin',
    'n8nio/n8n:latest': 'n8n',
    'mongo-express:latest': 'Mongo Express',
    'rediscommander/redis-commander:latest': 'Redis Commander',
  };

  getCompatiblePaas(saasApp: string): PaasInstance[] {
    const all = this.paasInstances();
    if (saasApp === 'dpage/pgadmin4:latest') return all.filter(p => p.typeSgbd === 'POSTGRESQL');
    if (saasApp === 'phpmyadmin/phpmyadmin:latest') return all.filter(p => p.typeSgbd === 'MYSQL');
    if (saasApp === 'mongo-express:latest') return all.filter(p => p.typeSgbd === 'MONGODB');
    if (saasApp === 'rediscommander/redis-commander:latest') return all.filter(p => p.typeSgbd === 'REDIS');
    if (saasApp === 'wordpress:latest') return all.filter(p => p.typeSgbd === 'MYSQL');
    return [];
  }

  /* ── UPGRADE MODAL ─────────────────────────────────── */
  isUpgradeModalOpen = signal<boolean>(false);
  upgradeTarget = signal<{ type: 'vm' | 'paas' | 'saas', id: string | number, currentPrice: number, name: string } | null>(null);
  upgradeCatalogues = signal<ServiceItem[]>([]);
  selectedUpgrade = signal<ServiceItem | null>(null);
  isUpgrading = signal<boolean>(false);

  vmPlans = computed(() =>
    this.h.catalogItems().filter(item => item.icon === 'vm' || item.tag === 'IaaS' || item.tag === 'IAAS')
  );

  paasPlans = computed(() =>
    this.h.catalogItems().filter(item => item.icon === 'db' || item.icon === 'redis' || item.icon === 'mongo' || item.icon === 'PAAS' || item.tag === 'PaaS' || item.tag === 'PAAS' || (item as any).typeService === 'PAAS')
  );

  saasPlans = computed(() => {
    const all = this.h.catalogItems().filter(item => item.tag === 'SaaS' || item.tag === 'SAAS' || (item as any).typeService === 'SAAS');
    if (this.deployType() === 'saas') {
      const appName = this.saasAppNameMapping[this.selectedSaasApp()] || 'WordPress';
      return all.filter(p => p.name.toLowerCase() === appName.toLowerCase());
    }
    return all;
  });

  costPreview = computed(() => {
    if (this.deployType() === 'saas') {
      const appName = this.saasAppNameMapping[this.selectedSaasApp()] || 'WordPress';
      const all = this.h.catalogItems().filter(item => item.tag === 'SaaS' || item.tag === 'SAAS' || (item as any).typeService === 'SAAS');
      const matchingPlan = all.find(p => p.name.toLowerCase() === appName.toLowerCase());
      if (matchingPlan) return parseFloat(matchingPlan.price || '0').toFixed(2);
    }
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
  private itemToDelete: { type: 'vm' | 'paas' | 'saas', id: string | number } | null = null;

  showConfirmToast(type: 'vm' | 'paas' | 'saas', id: string | number, name: string) {
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
    } else if (item.type === 'saas') {
      const saasId = item.id as number;
      this.h.deleteSaas(saasId).subscribe({
        next: () => {
          this.showToast('Application SaaS supprimée', 'var(--green)');
          const clientId = this.actualPers()?.client?.id;
          if (clientId) this.loadMySaas(clientId);
        },
        error: (err) => {
          this.showToast(err?.error?.message ?? 'Erreur lors de la suppression', 'var(--red)');
        }
      });
    }
  }

  /* ── NAVIGATION ───────────────────────────────────── */
  switchTab(key: string) { this.activeTab.set(key); }

  /* ── UPGRADE LOGIC ────────────────────────────────── */
  openUpgradeModal(target: any, type: 'vm' | 'paas' | 'saas') {
    let currentPrice = 0;
    let name = '';

    if (type === 'vm') {
      currentPrice = (target as VM).cost;
      name = (target as VM).name;
    } else {
      currentPrice = parseFloat(target.prixMensuel || '0');
      name = (target as PaasInstance).nomPersonnalise;
    }

    this.upgradeTarget.set({ type, id: target.id, currentPrice, name });

    const typeService = type === 'vm' ? 'IAAS' : type === 'saas' ? 'SAAS' : 'PAAS';
    this.http.get<any[]>(`${environment.apiBaseUrl.replace(/\/$/, '')}/catalogue/upgrade/${typeService}/${currentPrice}`).subscribe({
      next: (cats) => {
        this.upgradeCatalogues.set(cats.map(cat => this.h.mapCatalogItem(cat)));
        this.selectedUpgrade.set(null);
        this.isUpgradeModalOpen.set(true);
      },
      error: () => this.showToast('Erreur de chargement des offres', 'var(--red)')
    });
  }

  selectUpgrade(cat: ServiceItem) {
    this.selectedUpgrade.set(cat);
  }

  getUpgradeDiff(): string {
    const target = this.upgradeTarget();
    const upgrade = this.selectedUpgrade();
    if (!target || !upgrade) return '0.00';
    return (parseFloat(upgrade.price || '0') - target.currentPrice).toFixed(2);
  }

  closeUpgrade() {
    this.isUpgradeModalOpen.set(false);
    this.upgradeTarget.set(null);
  }

  submitUpgrade() {
    const target = this.upgradeTarget();
    const upgrade = this.selectedUpgrade();
    if (!target || !upgrade) return;

    this.isUpgrading.set(true);
    const url = target.type === 'vm'
      ? `${environment.apiBaseUrl.replace(/\/$/, '')}/esxi/my-vms/${target.id}/upgrade`
      : target.type === 'saas'
        ? `${environment.apiBaseUrl.replace(/\/$/, '')}/saas/my-applications/${target.id}/upgrade`
        : `${environment.apiBaseUrl.replace(/\/$/, '')}/paas/my-databases/${target.id}/upgrade`;

    this.http.post(url, { catalogueId: upgrade.id }).subscribe({
      next: () => {
        this.isUpgrading.set(false);
        this.closeUpgrade();
        this.showToast('Mise à niveau réussie', 'var(--green)');
        this.h.loadWallet();
        if (target.type === 'vm') this.loadMyVms();
        else if (target.type === 'saas') {
          const clientId = this.actualPers()?.client?.id;
          if (clientId) this.loadMySaas(clientId);
        } else {
          const clientId = this.actualPers()?.client?.id;
          if (clientId) this.loadMyPaas(clientId);
        }
      },
      error: (err) => {
        this.isUpgrading.set(false);
        this.showToast(err?.error?.message ?? 'Échec de la mise à niveau', 'var(--red)');
      }
    });
  }

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
  handleOpenDeploy(event: { type: 'vm' | 'paas' | 'saas' | 'catalog'; name: string }) {
    this.openDeploy(event.type, event.name);
  }

  openDeploy(type: 'vm' | 'paas' | 'saas' | 'catalog', name: string = '') {
    this.deployType.set(type);
    this.deployName.set(name);
    this.deployCpu.set(1);
    this.deployRam.set(1);
    this.deployDisk.set(10);
    this.deployVmName.set('');
    this.deployStep.set(1);
    this.selectedPlan.set(null);
    this.selectedSgbd.set('POSTGRESQL');
    this.selectedSaasApp.set('WORDPRESS');
    this.saasLinkedPaasId.set(null);
    this.saasAdminEmail.set('');
    if (type === 'vm') {
      if (this.vmTemplates().length === 0) {
        this.loadVmTemplates();
      } else if (!this.selectedTemplateName()) {
        this.selectedTemplateName.set(this.vmTemplates()[0].name);
      }
    }
    this.isDeployModalOpen.set(true);
  }

  isDeployNameValid(): boolean {
    const name = this.deployVmName().trim();
    if (!name) return false;
    if (name.toLowerCase().startsWith('template')) return false;
    const restrictedNames = ['mysql', 'sys', 'information_schema', 'performance_schema', 'postgres'];
    if (this.deployType() === 'paas' && restrictedNames.includes(name.toLowerCase())) return false;
    return /^[a-zA-Z0-9_-]{3,32}$/.test(name);
  }

  getDeployNameError(): string {
    const name = this.deployVmName().trim();
    if (!name) return '';
    if (name.toLowerCase().startsWith('template')) {
      return 'Le préfixe "template" est réservé par le système.';
    }
    const restrictedNames = ['mysql', 'sys', 'information_schema', 'performance_schema', 'postgres'];
    if (this.deployType() === 'paas' && restrictedNames.includes(name.toLowerCase())) {
      return `Le nom '${name}' est réservé par le système de base de données.`;
    }
    if (name.length < 3 || name.length > 32 || !/^[a-zA-Z0-9_-]+$/.test(name)) {
      return '3 à 32 caractères (lettres, chiffres, - ou _ uniquement)';
    }
    return '';
  }

  isSaasEmailValid(): boolean {
    const app = this.selectedSaasApp();
    const email = this.saasAdminEmail().trim();
    if (app === 'dpage/pgadmin4:latest') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }
    if (app === 'mongo-express:latest' || app === 'rediscommander/redis-commander:latest' || app === 'n8nio/n8n:latest') {
      return email.length >= 3;
    }
    return true;
  }

  getSaasEmailError(): string {
    const app = this.selectedSaasApp();
    const email = this.saasAdminEmail().trim();
    if (app === 'dpage/pgadmin4:latest') {
      if (!email) return 'Adresse email requise pour pgAdmin';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) return 'Format d\'email invalide (ex: admin@domaine.com)';
    } else if (app === 'mongo-express:latest' || app === 'rediscommander/redis-commander:latest' || app === 'n8nio/n8n:latest') {
      if (!email) return 'Identifiant / Email requis (min. 3 caractères)';
      if (email.length < 3) return 'Minimum 3 caractères requis';
    }
    return '';
  }

  isSaasPasswordValid(): boolean {
    const app = this.selectedSaasApp();
    const pass = this.saasAdminPassword().trim();
    if (app === 'dpage/pgadmin4:latest' || app === 'mongo-express:latest' || app === 'rediscommander/redis-commander:latest' || app === 'n8nio/n8n:latest') {
      return pass.length >= 4;
    }
    return true;
  }

  getSaasPasswordError(): string {
    const app = this.selectedSaasApp();
    const pass = this.saasAdminPassword().trim();
    if (app === 'dpage/pgadmin4:latest' || app === 'mongo-express:latest' || app === 'rediscommander/redis-commander:latest' || app === 'n8nio/n8n:latest') {
      if (!pass) return 'Mot de passe requis';
      if (pass.length < 4) return 'Minimum 4 caractères requis';
    }
    return '';
  }

  isDeployValid(): boolean {
    if (!this.isDeployNameValid()) return false;
    const type = this.deployType();

    if (type === 'vm') {
      if (this.vmTemplates().length > 0 && !this.selectedTemplateName()) return false;
      if (this.deployStep() === 2 && !this.selectedPlan()) return false;
      return true;
    }

    if (type === 'paas') {
      if (!this.selectedSgbd()) return false;
      if (this.deployStep() === 2 && !this.selectedPlan()) return false;
      return true;
    }

    if (type === 'saas') {
      if (!this.selectedSaasApp()) return false;
      if (!this.isSaasEmailValid()) return false;
      if (!this.isSaasPasswordValid()) return false;
      return true;
    }

    return true;
  }

  updateDeployName(val: string) {
    this.deployVmName.set(val);
  }

  goToStep2() {
    const rawName = this.deployVmName().trim();
    if (!rawName) {
      this.showToast("Veuillez saisir un nom d'instance", 'var(--red)');
      return;
    }
    if (rawName.toLowerCase().startsWith('template')) {
      this.showToast("Le nom d'instance ne peut pas commencer par 'template' (mot-clé réservé par le système).", 'var(--red)');
      return;
    }
    if (rawName.length < 3 || rawName.length > 32) {
      this.showToast("Le nom d'instance doit comporter entre 3 et 32 caractères.", 'var(--red)');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(rawName)) {
      this.showToast("Caractères non autorisés. Utilisez uniquement des lettres, chiffres, tirets (-) et underscores (_).", 'var(--red)');
      return;
    }
    if (this.deployType() === 'vm' && !this.selectedTemplateName() && this.vmTemplates().length > 0) {
      this.showToast('Veuillez sélectionner un système d\'exploitation', 'var(--red)');
      return;
    }

    if (this.deployType() === 'saas') {
      const saasApp = this.selectedSaasApp();
      const appName = this.saasAppNameMapping[saasApp] || 'WordPress';
      const matchingPlan = this.saasPlans().find(p => p.name.toLowerCase() === appName.toLowerCase());
      if (matchingPlan) {
        this.selectPlan(matchingPlan);
      }
    }

    this.deployStep.set(2);
  }

  goToStep1() {
    this.deployStep.set(1);
  }

  selectPlan(plan: ServiceItem) {
    this.selectedPlan.set(plan);
    if (plan.vcpu) this.deployCpu.set(plan.vcpu);
    if (plan.ramGB) this.deployRam.set(plan.ramGB);
    if (plan.stockageGB) this.deployDisk.set(plan.stockageGB);

    (plan.specs ?? []).forEach(spec => {
      const lower = spec.toLowerCase().trim();
      const num = parseFloat(lower.match(/\d+(\.\d+)?/)?.[0] ?? '0');
      if (!num) return;
      if ((lower.includes('vcpu') || lower.includes('cpu')) && !plan.vcpu) {
        this.deployCpu.set(num);
      } else if (lower.includes('ram') && !plan.ramGB) {
        this.deployRam.set(num);
      } else if ((lower.includes('gb') || lower.includes('ssd') || lower.includes('stockage')) && !plan.stockageGB) {
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

      this.isDeploying.set(true);
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
          this.isDeploying.set(false);
          this.vms.update(list => [this.mapVm(res.vm), ...list]);
          this.startVmPolling();
        },
        error: (err) => {
          this.isDeploying.set(false);
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

      const restrictedNames = ['mysql', 'sys', 'information_schema', 'performance_schema', 'postgres'];
      if (restrictedNames.includes(this.deployVmName().toLowerCase())) {
        this.showToast(`Le nom '${this.deployVmName()}' est réservé par le système. Veuillez en choisir un autre.`, 'var(--red)');
        return;
      }

      this.isDeploying.set(true);
      this.closeModal();
      this.showToast(`PaaS en cours de déploiement...`, 'var(--blue)', 0);

      this.h.createPaas({
        nomPersonnalise: this.deployVmName(),
        typeSgbd: this.selectedSgbd(),
        clientId: clientId,
        catalogueId: selectedPlan.id
      }).subscribe({
        next: () => {
          this.isDeploying.set(false);
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
    } else if (this.deployType() === 'saas') {
      if (!this.isDeployNameValid()) {
        this.showToast(this.getDeployNameError() || "Veuillez saisir un nom d'application valide", 'var(--red)');
        return;
      }

      if (!this.isSaasEmailValid()) {
        this.showToast(this.getSaasEmailError() || "Email admin requis ou invalide", 'var(--red)');
        return;
      }

      if (!this.isSaasPasswordValid()) {
        this.showToast(this.getSaasPasswordError() || "Mot de passe admin requis (min. 4 caractères)", 'var(--red)');
        return;
      }

      let selectedPlan = this.selectedPlan();
      if (!selectedPlan) {
        const saasApp = this.selectedSaasApp();
        const appName = this.saasAppNameMapping[saasApp] || 'WordPress';
        const all = this.h.catalogItems().filter(item => item.tag === 'SaaS' || item.tag === 'SAAS' || (item as any).typeService === 'SAAS');
        selectedPlan = all.find(p => p.name.toLowerCase() === appName.toLowerCase()) || null;
      }

      const clientId = this.actualPers()?.client?.id;
      if (!clientId) {
        this.showToast('Erreur: Client non identifié', 'var(--red)');
        return;
      }

      this.isDeploying.set(true);
      this.closeModal();
      this.showToast(`Application SaaS en cours de déploiement...`, 'var(--blue)', 0);

      this.h.createSaas({
        nomPersonnalise: this.deployVmName(),
        appType: this.selectedSaasApp(),
        clientId: clientId,
        catalogueId: selectedPlan?.id,
        linkedPaasServiceId: this.saasLinkedPaasId() ?? undefined,
        adminEmail: this.saasAdminEmail() || undefined,
        adminPassword: this.saasAdminPassword() || undefined,
      }).subscribe({
        next: () => {
          this.isDeploying.set(false);
          this.showToast('Application SaaS déployée avec succès !', 'var(--green)');
          this.h.loadWallet();
          if (clientId) this.loadMySaas(clientId);
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
  private loadingHistory = new Set<string>();

  private ensureMonitorBars(vmId: string) {
    if (this.monitorBars()[vmId] || this.loadingHistory.has(vmId)) return;
    this.loadingHistory.add(vmId);

    this.h.getMetricHistory('IAAS', vmId).subscribe({
      next: (history) => {
        if (history && history.length > 0) {
          const bars = history.map(item => item.cpu);
          const times = history.map(item => {
            const d = new Date(item.timestamp);
            return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          });
          this.monitorHistory.update(h => ({ ...h, [vmId]: history }));
          this.monitorBars.update(b => ({ ...b, [vmId]: bars }));
          this.monitorBarTimes.update(t => ({ ...t, [vmId]: times }));
        } else {
          const now = Date.now();
          const items: MetricHistoryItem[] = Array.from({ length: 20 }, (_, i) => ({
            cpu: 0,
            ram: 0,
            disk: 0,
            timestamp: new Date(now - (19 - i) * 3 * 60 * 1000).toISOString(),
          }));
          const bars = items.map(i => i.cpu);
          const times = items.map(i => new Date(i.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
          this.monitorHistory.update(h => ({ ...h, [vmId]: items }));
          this.monitorBars.update(b => ({ ...b, [vmId]: bars }));
          this.monitorBarTimes.update(t => ({ ...t, [vmId]: times }));
        }
      },
      error: (err) => {
        console.warn(`Impossible de charger l'historique métrique pour VM ${vmId}`, err);
        const now = Date.now();
        const items: MetricHistoryItem[] = Array.from({ length: 20 }, (_, i) => ({
          cpu: 0,
          ram: 0,
          disk: 0,
          timestamp: new Date(now - (19 - i) * 3 * 60 * 1000).toISOString(),
        }));
        const bars = items.map(i => i.cpu);
        const times = items.map(i => new Date(i.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
        this.monitorHistory.update(h => ({ ...h, [vmId]: items }));
        this.monitorBars.update(b => ({ ...b, [vmId]: bars }));
        this.monitorBarTimes.update(t => ({ ...t, [vmId]: times }));
      }
    });
  }

  /** Fait glisser une nouvelle valeur + timestamp dans le graphique de chaque VM running sans effacer l'historique */
  private slideMonitorBars(vms: VM[]) {
    const MAX = 20;
    const STEP_MS = 3 * 60 * 1000; // 3 minutes par point pour 1 heure

    const newHistory = { ...this.monitorHistory() };
    const newBars = { ...this.monitorBars() };
    const newTimes = { ...this.monitorBarTimes() };
    const now = Date.now();

    for (const vm of vms) {
      if (!newHistory[vm.id] || newHistory[vm.id].length === 0) {
        this.ensureMonitorBars(vm.id);
        continue;
      }
      if (vm.status === 'running' && vm.cpuUse !== null && vm.cpuUse !== undefined) {
        const history = [...newHistory[vm.id]];
        const lastItem = history[history.length - 1];
        const lastTime = lastItem ? new Date(lastItem.timestamp).getTime() : 0;

        const newItem: MetricHistoryItem = {
          cpu: vm.cpuUse,
          ram: vm.ramUse ?? (lastItem?.ram || 0),
          disk: lastItem?.disk || (vm.disk || 0),
          timestamp: new Date(now).toISOString(),
        };

        if (now - lastTime < STEP_MS) {
          // Dans le même créneau de 3 minutes -> mettre à jour le dernier point
          history[history.length - 1] = newItem;
        } else {
          // Nouveau créneau -> ajouter et garder 20 points
          history.push(newItem);
          if (history.length > MAX) {
            history.shift();
          }
        }

        newHistory[vm.id] = history;
        newBars[vm.id] = history.map(item => item.cpu);
        newTimes[vm.id] = history.map(item => new Date(item.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
      }
    }

    this.monitorHistory.set(newHistory);
    this.monitorBars.set(newBars);
    this.monitorBarTimes.set(newTimes);
  }

  private toastTimeout: any;

  showToast(msg: string, color: string = 'var(--green)', duration: number = 3400) {
    this.toastMsg.set(msg);
    this.toastColor.set(color);
    this.isToastVisible.set(true);

    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }

    if (duration > 0) {
      this.toastTimeout = setTimeout(() => this.isToastVisible.set(false), duration);
    }
  }

  updateCpu(val: string) { this.deployCpu.set(parseInt(val, 10)); }
  updateRam(val: string) { this.deployRam.set(parseInt(val, 10)); }
  updateDisk(val: string) { this.deployDisk.set(parseInt(val, 10)); }
  updateTemplateName(val: string) { this.selectedTemplateName.set(val); }

  loadCurrentPers() {
    const url = `${environment.apiBaseUrl.replace(/\/$/, '')}/personal/me`;
    this.http.get<any>(url).subscribe({
      next: (pers) => {
        this.actualPers.set(pers);
        console.log('Current pers:', pers);
        if (pers?.client?.id) {
          this.loadMyPaas(pers.client.id);
          this.loadMySaas(pers.client.id);
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

  deleteSaas(id: number) {
    const saas = this.saasInstances().find(s => s.id === id);
    if (saas) {
      this.showConfirmToast('saas', id, saas.nomPersonnalise);
    }
  }

  loadMySaas(clientId: number) {
    this.h.getMySaas(clientId).subscribe({
      next: (data) => {
        this.saasInstances.set(data || []);
      },
      error: (err) => {
        console.error('Failed to load SaaS instances', err);
      }
    });
  }

  loadSaasMetrics(serviceId: number) {
    this.h.getSaasMetrics(serviceId).subscribe({
      next: (metrics) => {
        this.saasInstances.update(instances =>
          instances.map(s => s.id === serviceId ? { ...s, metrics } : s)
        );
      },
      error: () => { }
    });
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
    this.isLoadingTemplates.set(true);
    this.h.getVmTemplates().subscribe({
      next: (res) => {
        this.isLoadingTemplates.set(false);
        const rawList = res.data ?? [];
        let templates = rawList
          .filter((vm) => vm.name && vm.name.toLowerCase().includes('template'))
          .map((vm) => ({
            id: vm.id,
            name: vm.name,
            label: vm.name.replace(/^template\s*/i, '').trim() || vm.name,
          }));

        if (templates.length === 0) {
          templates = [
            { id: 'tmpl-ubuntu-server', name: 'Template Ubuntu Server', label: 'Ubuntu Server (64 bits)' },
            { id: 'tmpl-ubuntu-desktop', name: 'Template Ubuntu Desktop', label: 'Ubuntu Desktop (64 bits)' },
            { id: 'tmpl-debian', name: 'Template Debian', label: 'Debian GNU/Linux (64 bits)' },
            { id: 'tmpl-alpine', name: 'Template Alpine', label: 'Alpine Linux (64 bits)' },
            { id: 'tmpl-win7', name: 'Template Windows 7', label: 'Windows 7 (64 bits)' },
            { id: 'tmpl-win2000', name: 'Template Windows 2000', label: 'Windows 2000' },
          ];
        }

        this.vmTemplates.set(templates);

        if (templates.length > 0 && !this.selectedTemplateName()) {
          this.selectedTemplateName.set(templates[0].name);
        }
      },
      error: (err) => {
        this.isLoadingTemplates.set(false);
        console.error('Failed to load ESXi templates, applying verified ESXi templates', err);
        const fallbackTemplates = [
          { id: 'tmpl-ubuntu-server', name: 'Template Ubuntu Server', label: 'Ubuntu Server (64 bits)' },
          { id: 'tmpl-ubuntu-desktop', name: 'Template Ubuntu Desktop', label: 'Ubuntu Desktop (64 bits)' },
          { id: 'tmpl-debian', name: 'Template Debian', label: 'Debian GNU/Linux (64 bits)' },
          { id: 'tmpl-alpine', name: 'Template Alpine', label: 'Alpine Linux (64 bits)' },
          { id: 'tmpl-win7', name: 'Template Windows 7', label: 'Windows 7 (64 bits)' },
          { id: 'tmpl-win2000', name: 'Template Windows 2000', label: 'Windows 2000' },
        ];
        this.vmTemplates.set(fallbackTemplates);
        if (!this.selectedTemplateName()) {
          this.selectedTemplateName.set(fallbackTemplates[0].name);
        }
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
        this.loadMySaas(clientId);
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
