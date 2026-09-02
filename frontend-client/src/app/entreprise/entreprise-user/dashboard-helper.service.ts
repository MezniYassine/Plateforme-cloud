import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { FormBuilder, FormGroup } from '@angular/forms';
import { DemandeService, DemandeApiItem } from '../../services/demande.service';
import { Router } from '@angular/router';
import { WalletService } from '../../services/wallet.service';

export interface MyRequest {
  id: string; name: string; type: 'vm' | 'db' | 'saas';
  specs: string; cost: number; date: string;
  justification: string;
  status: 'pending' | 'approved' | 'rejected';
  commentaireAdmin?: string;
}

export interface MyVM {
  id: string; name: string; os: string; ip: string;
  vcpu: number; ram_gb: number; disk: number; cost: number;
  cpu: number | null; ram: number | null;
  status: 'running' | 'stopped';
}

export interface MyService {
  id: string; name: string; type: 'db' | 'saas';
  url: string; specs: string; cost: number;
  bg: string; color: string;
  status?: string;
  connectionString?: string;
  dbUser?: string;
  dbPassword?: string;
  dateCreation?: string;
  metrics?: {
    cpuUsage: string;
    ramUsage: string;
    ramPercentage: string;
    usedStorageMb: number;
  };
}

export interface CatalogItem {
  id: string; name: string; desc: string;
  type: 'vm' | 'db' | 'saas';
  price: number; specs: string[];
  bg: string; color: string;
}

export interface VmTemplate { id: string; name: string; label: string }

export interface EntrepriseUser {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  role: string;
  telephone?: string;
  mfaStatus?: string;
  entreprise?: { nomEntreprise: string; taxId: string; };
}

export interface MetricHistoryItem {
  cpu: number;
  ram: number;
  disk: number;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class DashboardHelperService {
  private readonly base = environment.apiBaseUrl.replace(/\/$/, '');

  activePage = signal<string>('dashboard');
  currentDate = signal<string>('');
  private fb = inject(FormBuilder);
  profileForm!: FormGroup;

  readonly PAGE_TITLES: Record<string, string> = {
    dashboard: "Vue d'ensemble",
    'new-request': 'Demander une ressource',
    'my-requests': 'Mes demandes',
    vms: 'Mes VMs (IaaS)',
    services: 'Mes services',
    monitoring: 'Monitoring',
    profile: 'Mon profil',
  };

  private http = inject(HttpClient);
  private demandeService = inject(DemandeService);
  private router = inject(Router);
  private walletSvc = inject(WalletService);

  /** Récupère l'historique réel des métriques pour une ressource selon la période choisie */
  getMetricHistory(
    resourceType: 'IAAS' | 'PAAS' | 'SAAS',
    resourceId: string | number,
    range: '1h' | '24h' | 'yesterday' | '7d' | 'custom' | string = '1h',
    startDate?: string,
    endDate?: string
  ) {
    let url = `${this.base}/metrics/history/${resourceType}/${resourceId}?range=${range}`;
    if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
    return this.http.get<MetricHistoryItem[]>(url);
  }

  pageTitle = computed(() => this.PAGE_TITLES[this.activePage()] ?? 'Dashboard');
  setPage(p: string) { this.activePage.set(p); }

  userName = signal<string>('');
  actualUser = signal<EntrepriseUser | null>(null);
  companyName = signal<string>('');

  mySpend = computed(() => {
    return this.myRequests()
      .filter(r => r.status === 'approved')
      .reduce((acc, r) => acc + (r.cost || 0), 0);
  });

  // --- Wallet ---
  walletSolde = signal<number>(0);
  walletDevise = signal<string>('DT');
  walletLoading = signal<boolean>(false);

  myVMs = signal<MyVM[]>([]);
  myServices = signal<MyService[]>([]);
  myRequests = signal<MyRequest[]>([]);

  myReqFilter = signal<string>('all');

  filteredMyRequests = computed(() => {
    const f = this.myReqFilter();
    return f === 'all' ? this.myRequests() : this.myRequests().filter(r => r.status === f);
  });

  myServicesFilter = signal<string>('all');
  filteredMyServices = computed(() => {
    const f = this.myServicesFilter();
    return f === 'all' ? this.myServices() : this.myServices().filter(s => s.type === f);
  });

  pendingOwnCount = computed(() => this.myRequests().filter(r => r.status === 'pending').length);
  runningVmCount = computed(() => this.myVMs().filter(v => v.status === 'running').length);

  catalogFilter = signal<string>('all');

  catalogTabs = signal([
    { key: 'all', label: 'Tout' },
    { key: 'vm', label: 'IaaS - VMs' },
    { key: 'db', label: 'PaaS - Bases de donnees' },
    { key: 'saas', label: 'SaaS - Applications' },
  ]);

  catalogItems = signal<CatalogItem[]>([]);

  filteredCatalog = computed(() => {
    const f = this.catalogFilter();
    return f === 'all' ? this.catalogItems() : this.catalogItems().filter(i => i.type === f);
  });

  selectedService = signal<CatalogItem | null>(null);
  instanceName = signal<string>('');
  justification = signal<string>('');
  vmTemplates = signal<VmTemplate[]>([]);
  selectedTemplateName = signal<string>('');
  selectedSgbd = signal<'POSTGRESQL' | 'MYSQL' | 'REDIS' | 'MONGODB'>('POSTGRESQL');

  // --- SaaS-specific fields for entreprise requests ---
  selectedSaasApp = signal<string>('');
  saasAdminEmail = signal<string>('');
  saasAdminPassword = signal<string>('');
  saasLinkedPaasId = signal<number | null>(null);

  readonly SAAS_APP_OPTIONS = [
    { key: 'n8nio/n8n:latest', label: 'n8n', icon: '🔄', color: '#ea4b71', bg: '#fce4ec', desc: 'Automatisation de workflows' },
    { key: 'wordpress:latest', label: 'WordPress', icon: '📝', color: '#21759b', bg: '#e3f2fd', desc: 'CMS pour créer des sites web et blogs' },
    { key: 'phpmyadmin/phpmyadmin:latest', label: 'phpMyAdmin', icon: '🐬', color: '#f89b24', bg: '#fff8e1', desc: 'Interface web pour gérer MySQL' },
    { key: 'dpage/pgadmin4:latest', label: 'pgAdmin', icon: '🐘', color: '#326690', bg: '#e8f4fd', desc: 'Interface web pour gérer PostgreSQL' },
  ];

  selectService(s: CatalogItem) {
    this.selectedService.set(s);
    this.selectedSgbd.set('POSTGRESQL');
    if (s.type === 'vm') {
      if (this.vmTemplates().length === 0) {
        this.loadVmTemplates();
      } else if (!this.selectedTemplateName()) {
        this.selectedTemplateName.set(this.vmTemplates()[0].name);
      }
    }
  }
  updateTemplateName(val: string) { this.selectedTemplateName.set(val); }

  toastMsg = signal<string>('');
  toastColor = signal<string>('var(--green)');
  isToastVisible = signal<boolean>(false);

  getCompatiblePaas(saasName: string): any[] {
    const name = (saasName || '').toLowerCase();
    const runningPaas = this.myServices().filter(s => s.type === 'db' && s.status === 'running');

    if (name.includes('phpmyadmin')) return runningPaas.filter(s => s.specs.toUpperCase() === 'MYSQL');
    if (name.includes('pgadmin')) return runningPaas.filter(s => s.specs.toUpperCase() === 'POSTGRESQL');
    if (name.includes('mongo')) return runningPaas.filter(s => s.specs.toUpperCase() === 'MONGODB');
    if (name.includes('redis')) return runningPaas.filter(s => s.specs.toUpperCase() === 'REDIS');
    return [];
  }

  showToast(msg: string, color = 'var(--green)') {
    this.toastMsg.set(msg);
    this.toastColor.set(color);
    this.isToastVisible.set(true);
    setTimeout(() => this.isToastVisible.set(false), 3500);
  }

  // --- Upgrade ---
  isUpgradeModalOpen = signal<boolean>(false);
  upgradeCatalogues = signal<CatalogItem[]>([]);
  selectedUpgrade = signal<CatalogItem | null>(null);
  upgradeTarget = signal<{ type: 'vm' | 'paas', id: string, currentPrice: number, name: string } | null>(null);
  isUpgrading = signal<boolean>(false);

  // --- Confirm Toast ---
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
      const id = item.id as string;
      this.http.delete<any>(`${this.base}/esxi/my-vms/${id}`).subscribe({
        next: (res) => {
          this.myVMs.update(list => list.filter(v => v.id !== id));
          this.showToast(res?.message ?? 'VM supprimée', 'var(--red)');
        },
        error: (err) => {
          this.showToast(err?.error?.message ?? 'Impossible de supprimer la VM', 'var(--red)');
        }
      });
    } else if (item.type === 'paas') {
      const id = Number(String(item.id).replace('db-', ''));
      this.http.delete(`${this.base}/paas/${id}`).subscribe({
        next: () => {
          this.showToast('Service PaaS supprimé', 'var(--green)');
          this.loadMyServices();
        },
        error: (err: any) => {
          this.showToast(err?.error?.message ?? 'Erreur lors de la suppression', 'var(--red)');
        }
      });
    } else if (item.type === 'saas') {
      const id = Number(String(item.id).replace('saas-', ''));
      this.http.delete(`${this.base}/saas/${id}`).subscribe({
        next: () => {
          this.showToast('Application SaaS supprimée', 'var(--green)');
          this.loadMyServices();
        },
        error: (err: any) => {
          this.showToast(err?.error?.message ?? 'Erreur lors de la suppression', 'var(--red)');
        }
      });
    }
  }

  deleteVm(id: string, name: string) {
    this.showConfirmToast('vm', id, name);
  }

  deletePaas(id: string | number, name: string) {
    this.showConfirmToast('paas', id, name);
  }

  deleteSaas(id: string | number, name: string) {
    this.showConfirmToast('saas', id, name);
  }

  openUpgradeModal(type: 'vm' | 'paas', target: any) {
    const currentPrice = parseFloat(target.cost || '0');
    const name = target.name;

    this.upgradeTarget.set({ type, id: target.id, currentPrice, name });

    const typeService = type === 'vm' ? 'IAAS' : 'PAAS';
    this.http.get<any[]>(`${this.base}/catalogue/upgrade/${typeService}/${currentPrice}`).subscribe({
      next: (cats) => {
        this.upgradeCatalogues.set(cats.map(cat => this.mapCatalogItem(cat)));
        this.selectedUpgrade.set(null);
        this.isUpgradeModalOpen.set(true);
      },
      error: () => this.showToast('Erreur de chargement des offres', 'var(--red)')
    });
  }

  selectUpgrade(cat: CatalogItem) {
    this.selectedUpgrade.set(cat);
  }

  getUpgradeDiff(): string {
    const sel = this.selectedUpgrade();
    const tgt = this.upgradeTarget();
    if (!sel || !tgt) return '0.00';
    return Math.max(0, sel.price - tgt.currentPrice).toFixed(2);
  }

  closeUpgrade() {
    this.isUpgradeModalOpen.set(false);
    this.selectedUpgrade.set(null);
    this.upgradeTarget.set(null);
  }

  submitUpgrade() {
    const sel = this.selectedUpgrade();
    const tgt = this.upgradeTarget();
    if (!sel || !tgt) return;

    this.isUpgrading.set(true);
    const endpoint = tgt.type === 'vm'
      ? `${this.base}/esxi/my-vms/${tgt.id}/upgrade`
      : `${this.base}/paas/my-databases/${tgt.id}/upgrade`;

    this.http.post(endpoint, { catalogueId: sel.id }).subscribe({
      next: () => {
        this.showToast('Mise à niveau réussie', 'var(--green)');
        this.isUpgrading.set(false);
        this.closeUpgrade();
        if (tgt.type === 'vm') this.loadMyVms();
        else this.loadMyServices();
        this.loadWallet();
      },
      error: (err: any) => {
        this.isUpgrading.set(false);
        this.showToast(err?.error?.message || 'Erreur lors de la mise à niveau', 'var(--red)');
      }
    });
  }

  getInitials(name: string): string {
    return (name || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  sparkData(base: number | null): number[] {
    if (base === null) {
      return [];
    }

    return Array.from({ length: 14 }, () => {
      const jitter = Math.floor(Math.random() * 24) - 12;
      return Math.max(8, Math.min(95, base + jitter));
    });
  }

  statusText(s: string) {
    return ({ pending: 'En attente', approved: 'Approuve', rejected: 'Rejete', suspended: 'Suspendu' } as any)[s] || s;
  }

  setDate() {
    this.currentDate.set(new Date().toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }));
  }

  getInstanceNameError(): string {
    const name = this.instanceName().trim();
    if (!name) return '';
    if (name.toLowerCase().startsWith('template')) {
      return '⚠️ Le préfixe "template" est réservé par le système.';
    }
    if (name.length < 3 || name.length > 32 || !/^[a-zA-Z0-9_-]+$/.test(name)) {
      return '⚠️ 3 à 32 caractères (lettres, chiffres, - ou _ uniquement)';
    }
    return '';
  }

  isInstanceNameValid(): boolean {
    const name = this.instanceName().trim();
    if (!name) return false;
    if (name.toLowerCase().startsWith('template')) return false;
    const restrictedNames = ['mysql', 'sys', 'information_schema', 'performance_schema', 'postgres'];
    const svc = this.selectedService();
    if (svc && svc.type === 'db' && restrictedNames.includes(name.toLowerCase())) return false;
    return /^[a-zA-Z0-9_-]{3,32}$/.test(name);
  }

  isSaasEmailValid(): boolean {
    const svc = this.selectedService();
    if (!svc || svc.type !== 'saas') return true;
    const name = svc.name.toLowerCase();
    const isPhpMyAdmin = name.includes('phpmyadmin');
    const isWordPress = name.includes('wordpress');
    const isN8n = name.includes('n8n');
    if (isPhpMyAdmin || isWordPress || isN8n) return true;

    const email = this.saasAdminEmail().trim();
    if (name.includes('pgadmin')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }
    return email.length >= 3;
  }

  getSaasEmailError(): string {
    const svc = this.selectedService();
    if (!svc || svc.type !== 'saas') return '';
    const name = svc.name.toLowerCase();
    const isPhpMyAdmin = name.includes('phpmyadmin');
    const isWordPress = name.includes('wordpress');
    const isN8n = name.includes('n8n');
    if (isPhpMyAdmin || isWordPress || isN8n) return '';

    const email = this.saasAdminEmail().trim();
    if (name.includes('pgadmin')) {
      if (!email) return '⚠️ Adresse email requise pour pgAdmin';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) return '⚠️ Format d\'email invalide (ex: admin@domaine.com)';
    } else {
      if (!email) return '⚠️ Identifiant / Email requis (min. 3 caractères)';
      if (email.length < 3) return '⚠️ Minimum 3 caractères requis';
    }
    return '';
  }

  isSaasPasswordValid(): boolean {
    const svc = this.selectedService();
    if (!svc || svc.type !== 'saas') return true;
    const name = svc.name.toLowerCase();
    const isPhpMyAdmin = name.includes('phpmyadmin');
    const isWordPress = name.includes('wordpress');
    const isN8n = name.includes('n8n');
    if (isPhpMyAdmin || isWordPress || isN8n) return true;

    const pass = this.saasAdminPassword().trim();
    return pass.length >= 4;
  }

  getSaasPasswordError(): string {
    const svc = this.selectedService();
    if (!svc || svc.type !== 'saas') return '';
    const name = svc.name.toLowerCase();
    const isPhpMyAdmin = name.includes('phpmyadmin');
    const isWordPress = name.includes('wordpress');
    const isN8n = name.includes('n8n');
    if (isPhpMyAdmin || isWordPress || isN8n) return '';

    const pass = this.saasAdminPassword().trim();
    if (!pass) return '⚠️ Mot de passe requis';
    if (pass.length < 4) return '⚠️ Minimum 4 caractères requis';
    return '';
  }

  isRequestFormValid(): boolean {
    const svc = this.selectedService();
    if (!svc) return false;
    if (!this.isInstanceNameValid()) return false;
    if (!this.justification().trim()) return false;

    if (svc.type === 'vm') {
      if (this.vmTemplates().length > 0 && !this.selectedTemplateName()) return false;
      return true;
    }

    if (svc.type === 'db') {
      if (!this.selectedSgbd()) return false;
      const restrictedNames = ['mysql', 'sys', 'information_schema', 'performance_schema', 'postgres'];
      if (restrictedNames.includes(this.instanceName().trim().toLowerCase())) return false;
      return true;
    }

    if (svc.type === 'saas') {
      const name = svc.name.toLowerCase();
      const isPhpMyAdmin = name.includes('phpmyadmin');
      const isRedisCommander = name.includes('redis');
      const isMongoExpress = name.includes('mongo');
      const requiresLinkedPaas = isPhpMyAdmin || isRedisCommander || isMongoExpress;

      if (requiresLinkedPaas && !this.saasLinkedPaasId()) return false;
      if (!this.isSaasEmailValid()) return false;
      if (!this.isSaasPasswordValid()) return false;
      return true;
    }

    return true;
  }

  submitRequest() {
    const svc = this.selectedService();
    if (!svc) return;

    if (!this.isRequestFormValid()) {
      this.showToast('Veuillez remplir correctement tous les champs requis avant de soumettre', 'var(--amber)');
      return;
    }

    const instanceName = this.instanceName().trim();
    if (!instanceName) {
      this.showToast("Veuillez saisir un nom pour l'instance", 'var(--amber)');
      return;
    }
    if (instanceName.toLowerCase().startsWith('template')) {
      this.showToast("Le nom d'instance ne peut pas commencer par 'template' (mot-clé réservé par le système).", 'var(--red)');
      return;
    }
    if (instanceName.length < 3 || instanceName.length > 32 || !/^[a-zA-Z0-9_-]+$/.test(instanceName)) {
      this.showToast("Le nom d'instance doit comporter entre 3 et 32 caractères (lettres, chiffres, - ou _ uniquement).", 'var(--amber)');
      return;
    }

    if (svc.type === 'saas') {
      const nameExistsInServices = this.myServices().some(s => s.type === 'saas' && s.name.toLowerCase() === instanceName.toLowerCase());
      const nameExistsInRequests = this.myRequests().some(r => r.type === 'saas' && r.name.toLowerCase() === instanceName.toLowerCase() && r.status !== 'rejected');
      
      if (nameExistsInServices || nameExistsInRequests) {
        this.showToast("Ce nom d'application SaaS est déjà utilisé. Veuillez en choisir un autre.", 'var(--amber)');
        return;
      }
    }

    if (!this.justification().trim()) {
      this.showToast('Veuillez saisir une justification', 'var(--amber)');
      return;
    }
    if (svc.type === 'saas') {
      const svcNameLower = svc.name.toLowerCase();
      const isPhpMyAdmin = svcNameLower.includes('phpmyadmin');
      const isRedisCommander = svcNameLower.includes('redis');
      const isMongoExpress = svcNameLower.includes('mongo');
      const isWordPress = svcNameLower.includes('wordpress');
      const isN8n = svcNameLower.includes('n8n');
      const requiresLinkedPaas = isPhpMyAdmin || isRedisCommander || isMongoExpress;

      if (requiresLinkedPaas && !this.saasLinkedPaasId()) {
        const appLabel = isPhpMyAdmin ? 'phpMyAdmin (MySQL)'
          : isRedisCommander ? 'Redis Commander (Redis)'
          : 'Mongo Express (MongoDB)';
        this.showToast(`${appLabel} nécessite une base de données liée. Veuillez en sélectionner une.`, 'var(--amber)');
        return;
      }

      // WordPress and n8n configure their own credentials via first-launch wizard → no email/password needed here
      if (!isPhpMyAdmin && !isWordPress && !isN8n) {
        const email = this.saasAdminEmail().trim();
        if (!email) {
          this.showToast("Veuillez saisir un email pour l'accès SaaS", 'var(--amber)');
          return;
        }
        if (!email.includes('@') || !email.includes('.')) {
          this.showToast("Veuillez saisir une adresse email valide (ex: admin@domaine.com)", 'var(--amber)');
          return;
        }
        if (!this.saasAdminPassword().trim()) {
          this.showToast("Veuillez saisir un mot de passe pour l'accès SaaS", 'var(--amber)');
          return;
        }
      }
    }

    const payload: any = {
      nomInstanceSouhaite: this.instanceName().trim(),
      justification: this.justification().trim(),
      catalogueId: Number(svc.id),
      templateName: svc.type === 'vm' ? (this.selectedTemplateName() || undefined) : undefined,
      typeSgbd: svc.type === 'db' ? this.selectedSgbd() : undefined,
      appType: svc.type === 'saas' ? this.selectedSaasApp() : undefined,
      adminEmail: svc.type === 'saas' ? this.saasAdminEmail().trim() : undefined,
      adminPassword: svc.type === 'saas' ? this.saasAdminPassword().trim() : undefined,
      linkedPaasId: svc.type === 'saas' ? (this.saasLinkedPaasId() ?? undefined) : undefined,
    };

    this.demandeService.create(payload).subscribe({
      next: (demande) => {
        const newReq: MyRequest = this.mapApiDemande(demande);
        this.myRequests.update(list => [newReq, ...list]);
        this.selectedService.set(null);
        this.instanceName.set('');
        this.justification.set('');
        this.selectedSgbd.set('POSTGRESQL');
        this.selectedSaasApp.set('');
        this.saasAdminEmail.set('');
        this.saasAdminPassword.set('');
        this.saasLinkedPaasId.set(null);
        this.setPage('my-requests');
        this.showToast('Demande soumise - en attente de validation', 'var(--blue)');
      },
      error: (err) => {
        this.showToast(err?.error?.message ?? 'Impossible de soumettre la demande', 'var(--red)');
      }
    });
  }

  loadMyDemandes() {
    this.demandeService.getMyDemandes().subscribe({
      next: (demandes) => {
        this.myRequests.set(demandes.map(d => this.mapApiDemande(d)));
      },
      error: () => { }
    });
  }

  private mapApiDemande(d: DemandeApiItem): MyRequest {
    const statusMap: Record<string, 'pending' | 'approved' | 'rejected'> = {
      EN_ATTENTE: 'pending',
      APPROUVEE: 'approved',
      REJETEE: 'rejected',
    };
    const cat = d.catalogue;

    const typeMap: Record<string, 'vm' | 'db' | 'saas'> = {
      'IAAS': 'vm',
      'PAAS': 'db',
      'SAAS': 'saas'
    };
    const mappedType = cat && cat.typeService ? (typeMap[cat.typeService] || 'vm') : 'vm';

    let specs = '';
    if (cat) {
      if (mappedType === 'vm') {
        specs = `${cat.vcpu} vCPU - ${cat.ramMB} GB RAM - ${cat.stockageGB} GB SSD`;
      } else if (mappedType === 'db') {
        const sgbd = (d as any).typeSgbd || cat.typeSgbd || 'DB';
        specs = `${sgbd} · ${cat.vcpu} vCPU - ${cat.ramMB} GB RAM - ${cat.stockageGB} GB SSD`;
      } else {
        const parts = [];
        if (cat.vcpu) parts.push(`${cat.vcpu} vCPU`);
        if (cat.ramMB) parts.push(`${cat.ramMB} GB RAM`);
        if (cat.stockageGB) parts.push(`${cat.stockageGB} GB SSD`);
        specs = parts.join(' - ');
      }
    }

    return {
      id: String(d.id),
      name: d.nomInstanceSouhaite,
      type: mappedType,
      specs,
      cost: Number((d as any).prixMensuel || 0),
      date: new Date(d.dateDemande).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
      }),
      justification: d.justification,
      status: statusMap[d.status] ?? 'pending',
      commentaireAdmin: d.commentaireAdmin,
    };
  }

  resubmitRequest(r: MyRequest) {
    const svc = this.catalogItems().find(c => c.type === r.type);
    if (svc) {
      this.selectedService.set(svc);
      this.instanceName.set(r.name);
      this.justification.set(r.justification);
    }
    this.setPage('new-request');
  }

  vmAction(id: string, action: 'stop' | 'start') {
    const vm = this.myVMs().find(v => v.id === id);
    if (!vm) return;

    const newStatus = action === 'stop' ? 'stopped' as const : 'running' as const;
    const previousStatus = vm.status;

    // Mise à jour optimiste de l'UI (feedback immédiat)
    this.myVMs.update(list => list.map(v =>
      v.id === id
        ? { ...v, status: newStatus, cpu: newStatus === 'running' ? null : 0, ram: newStatus === 'running' ? null : 0 }
        : v
    ));
    this.showToast(
      action === 'stop' ? `Arrêt de ${vm.name} en cours...` : `Démarrage de ${vm.name} en cours...`,
      'var(--amber)'
    );

    // Appel API réel
    this.http.post<any>(`${this.base}/esxi/my-vms/${id}/power`, { action }).subscribe({
      next: (res) => {
        const actualStatus = res?.newStatus === 'RUNNING' ? 'running' as const : 'stopped' as const;
        this.myVMs.update(list => list.map(v =>
          v.id === id
            ? { ...v, status: actualStatus, cpu: actualStatus === 'running' ? null : 0, ram: actualStatus === 'running' ? null : 0 }
            : v
        ));
        this.showToast(
          action === 'stop' ? `${vm.name} arrêtée` : `${vm.name} démarrée`,
          action === 'stop' ? 'var(--amber)' : 'var(--green)'
        );
      },
      error: (err) => {
        // Revenir à l'état précédent en cas d'erreur
        this.myVMs.update(list => list.map(v =>
          v.id === id ? { ...v, status: previousStatus } : v
        ));
        this.showToast(
          err?.error?.message ?? `Impossible d'${action === 'stop' ? 'arrêter' : 'démarrer'} la VM`,
          'var(--red)'
        );
      }
    });
  }

  loadUserData() {
    this.http.get(`${this.base}/users/me`).subscribe({
      next: (data: any) => {
        this.actualUser.set(data);
        this.userName.set(((data.prenom ?? '') + ' ' + (data.nom ?? '')).trim());
        this.companyName.set(data.entreprise?.nomEntreprise ?? '');
      }
    });
  }

  loadVmTemplates() {
    this.http.get<any>(`${this.base}/esxi/templates`).subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        let templates = (list || [])
          .filter((vm: any) => String(vm?.name || '').toLowerCase().includes('template') || String(vm?.name || '').toLowerCase().includes('ubuntu') || String(vm?.name || '').toLowerCase().includes('debian') || String(vm?.name || '').toLowerCase().includes('windows'))
          .map((vm: any) => ({
            id: String(vm.id),
            name: vm.name,
            label: String(vm.name).replace(/^template\s*/i, '').trim() || vm.name
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
        console.error('Failed to load ESXi templates', err);
        const fallback = [
          { id: 'tmpl-ubuntu-server', name: 'Template Ubuntu Server', label: 'Ubuntu Server (64 bits)' },
          { id: 'tmpl-ubuntu-desktop', name: 'Template Ubuntu Desktop', label: 'Ubuntu Desktop (64 bits)' },
          { id: 'tmpl-debian', name: 'Template Debian', label: 'Debian GNU/Linux (64 bits)' },
          { id: 'tmpl-alpine', name: 'Template Alpine', label: 'Alpine Linux (64 bits)' },
          { id: 'tmpl-win7', name: 'Template Windows 7', label: 'Windows 7 (64 bits)' },
          { id: 'tmpl-win2000', name: 'Template Windows 2000', label: 'Windows 2000' },
        ];
        this.vmTemplates.set(fallback);
        if (!this.selectedTemplateName()) {
          this.selectedTemplateName.set(fallback[0].name);
        }
      }
    });
  }

  loadMyVms() {
    this.http.get<any[]>(`${this.base}/esxi/my-vms`).subscribe({
      next: (data) => {
        const mapped: MyVM[] = (data || []).map((vm: any) => {
          const isRunning = ['running', 'started'].includes(String(vm.status || '').toLowerCase());

          // Récupérer le prix de l'offre catalogue ou l'estimer dynamiquement selon la puissance de l'instance
          let cost = 0;
          if (vm.prixMensuel !== undefined && vm.prixMensuel !== null) {
            cost = Number(vm.prixMensuel);
          } else if (vm.catalogue && vm.catalogue.prix !== undefined) {
            cost = Number(vm.catalogue.prix);
          } else {
            // Formule d'estimation réaliste si pas liée au catalogue : 10 DT de base + 5 DT/vCPU + 2.5 DT/GB RAM + 0.1 DT/GB SSD
            const vcpuCount = vm.vCPU || vm.vcpu || 1;
            const ramGb = vm.ramGB || vm.ram_gb || 1;
            const storageGb = vm.stockageGB || vm.disk || 20;
            cost = 10 + (vcpuCount * 5) + (ramGb * 2.5) + (storageGb * 0.1);
          }
          // Formater avec 2 décimales maximum
          cost = Math.round(cost * 100) / 100;
          const cpuUsage = isRunning ? this.normalizePercent(vm.cpuUse ?? vm.cpu ?? vm.cpuUsage) : 0;
          const ramUsage = isRunning ? this.normalizePercent(vm.ramUse ?? vm.ram ?? vm.ramUsage) : 0;

          return {
            id: String(vm.id),
            name: vm.nomPersonnalise || vm.name || ('vm-' + vm.id),
            os: vm.os || '',
            ip: ((vm.ipAddress || vm.ip || '').includes('.')) ? (vm.ipAddress || vm.ip) : 'Aucun IP',
            vcpu: vm.vCPU || vm.vcpu || 1,
            ram_gb: vm.ramGB || vm.ram_gb || 1,
            disk: vm.stockageGB || vm.disk || 20,
            cost,
            cpu: cpuUsage,
            ram: ramUsage,
            status: isRunning ? 'running' as const : 'stopped' as const,
          };
        });
        this.myVMs.set(mapped);
      },
      error: () => { }
    });
  }

  private normalizePercent(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
      return null;
    }

    return Math.max(0, Math.min(100, Math.round(numeric)));
  }

  loadMyServices() {
    const paas$ = this.http.get<any[]>(`${this.base}/paas/mes-databases`);
    const saas$ = this.http.get<any[]>(`${this.base}/saas/mes-applications`);

    paas$.subscribe({
      next: (data) => {
        const existingServices = this.myServices();
        const paasItems: MyService[] = (data || []).map((db: any) => {
          const isRedis = db.typeSgbd?.toLowerCase() === 'redis';
          const isMongo = db.typeSgbd?.toLowerCase() === 'mongodb';
          const existing = existingServices.find(s => s.id === 'db-' + db.id);
          return {
            id: 'db-' + String(db.id),
            name: db.nomPersonnalise || db.name || ('db-' + db.id),
            type: 'db' as const,
            url: db.containerIp ? `${db.containerIp}:${db.mappedPort}` : 'En cours...',
            status: db.status === 'RUNNING' ? 'running' : 'stopped',
            bg: isRedis ? 'var(--red-light, #fee2e2)' : (isMongo ? 'var(--green-light, #dcfce7)' : 'var(--orange-light, #ffedd5)'),
            color: isRedis ? 'var(--red, #ef4444)' : (isMongo ? 'var(--green, #22c55e)' : 'var(--orange, #f97316)'),
            specs: db.typeSgbd || 'POSTGRESQL',
            cost: db.prixMensuel ? Number(db.prixMensuel) : (db.catalogue?.prix ? Number(db.catalogue.prix) : 0),
            connectionString: db.connectionString,
            dbUser: db.dbUser,
            dbPassword: db.dbPassword,
            dateCreation: db.dateCreation,
            metrics: existing ? existing.metrics : undefined
          };
        });

        saas$.subscribe({
          next: (saasData) => {
            const saasItems: MyService[] = (saasData || []).map((app: any) => {
              const nameLower = (app.nomPersonnalise || '').toLowerCase();
              const isPhpMyAdmin = nameLower.includes('phpmyadmin') || nameLower.includes('pma');
              const isWordPress = nameLower.includes('wordpress') || nameLower.includes('wp');
              const hasExplicitCreds = !isPhpMyAdmin && !isWordPress && app.ownerEmail && app.ownerEmail !== 'admin@cloud.local';

              return {
                id: 'saas-' + String(app.id),
                name: app.nomPersonnalise || ('saas-' + app.id),
                type: 'saas' as const,
                url: app.connectionString || '',
                status: app.status === 'RUNNING' ? 'running' : 'stopped',
                bg: '#ecfeff',
                color: '#0891b2',
                specs: 'Application SaaS',
                cost: app.prixMensuel ? Number(app.prixMensuel) : (app.catalogue?.prix ? Number(app.catalogue.prix) : 0),
                connectionString: app.connectionString,
                dbUser: hasExplicitCreds ? app.ownerEmail : undefined,
                dbPassword: hasExplicitCreds ? app.ownerPassword : undefined,
                dateCreation: app.dateCreation,
              };
            });

            this.myServices.set([...paasItems, ...saasItems]);

            // Fetch metrics uniquement pour les bases de données PaaS
            paasItems.filter(s => s.status === 'running').forEach(s => {
              this.loadServiceMetrics(s.id);
            });
          },
          error: () => {
            this.myServices.set(paasItems);
            paasItems.filter(s => s.status === 'running').forEach(s => {
              this.loadServiceMetrics(s.id);
            });
          }
        });
      },
      error: () => { }
    });
  }

  loadServiceMetrics(serviceId: string) {
    const isSaas = serviceId.startsWith('saas-');
    const endpoint = isSaas ? 'saas' : 'paas';
    const numericId = serviceId.replace('saas-', '').replace('db-', '');

    this.http.get<any>(`${this.base}/${endpoint}/${numericId}/metrics`).subscribe({
      next: (metrics) => {
        this.myServices.update(services =>
          services.map(s => s.id === serviceId ? { ...s, metrics } : s)
        );
      },
      error: () => { }
    });
  }

  provisionVm(payload: { name: string; ramGB: number; vCPU: number; storageGB?: number; templateName?: string; catalogueId?: number }) {
    return this.http.post<any>(`${this.base}/esxi/provision`, payload);
  }

  loadWallet() {
    this.walletSvc.getWallet().subscribe({
      next: (data) => {
        this.walletSolde.set(data.solde);
        this.walletDevise.set(data.devise);
      },
      error: () => { }
    });
  }

  rechargerWallet() {
    if (this.walletLoading()) return;
    this.walletLoading.set(true);
    this.walletSvc.recharger().subscribe({
      next: (res) => {
        this.walletSolde.set(res.nouveauSolde);
        this.walletLoading.set(false);
        this.showToast(`Wallet rechargé ! Nouveau solde : ${res.nouveauSolde.toFixed(3)} DT`, 'var(--green)');
      },
      error: (err) => {
        this.walletLoading.set(false);
        this.showToast(err?.error?.message ?? 'Impossible de recharger le wallet', 'var(--red)');
      }
    });
  }



  mapCatalogItem(cat: any): CatalogItem {
    const typeMap: Record<string, 'vm' | 'db' | 'saas'> = {
      'IAAS': 'vm',
      'PAAS': 'db',
      'SAAS': 'saas'
    };
    const type = cat.typeService ? (typeMap[cat.typeService] || 'saas') : 'saas';

    let specs: string[] = [];
    if (cat.specs) {
      specs = typeof cat.specs === 'string' ? cat.specs.split('.').map((s: string) => s.trim()) : cat.specs;
    } else {
      if (type === 'vm') {
        specs = [
          (cat.vcpu || 0) + ' vCPU',
          (cat.ramMB || 0) + ' GB RAM',
          (cat.stockageGB || 0) + ' GB SSD'
        ];
      } else {
        if (cat.vcpu) specs.push(cat.vcpu + ' vCPU');
        if (cat.ramMB) specs.push(cat.ramMB + ' GB RAM');
        if (cat.stockageGB) specs.push(cat.stockageGB + ' GB SSD');
      }
    }
    return {
      id: String(cat.id),
      name: cat.nomService || cat.name || 'Service sans nom',
      desc: cat.description || cat.desc || '',
      type: type as 'vm' | 'db' | 'saas',
      price: Number(cat.prix !== undefined ? cat.prix : (cat.price || 0)),
      specs,
      bg: cat.bg || 'var(--blue-light)',
      color: cat.color || 'var(--blue)',
    };
  }

  loadCatalog() {
    this.http.get<any[]>(`${this.base}/catalogue`).subscribe({
      next: (data) => {
        const items: CatalogItem[] = (data || []).map((cat: any) => this.mapCatalogItem(cat));
        this.catalogItems.set(items);
      },
      error: (err) => {
        console.error('Failed to load catalog', err);
        this.showToast('Impossible de charger le catalogue', 'var(--red)');
      }
    });
  }

  updateProfile(data: any) {
    return this.http.patch(`${this.base}/users/update-profile`, data);
  }

  updatePassword(data: any) {
    return this.http.patch(`${this.base}/users/update-password`, data);
  }
  logout() {
    localStorage.removeItem('access_token');
    this.router.navigate(['/login']);
  }
}
