import { Component, OnInit, inject, signal, computed, input, output, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { jwtDecode } from 'jwt-decode';
import { environment } from '../../../../../environments/environment';
import { Admin, DeployedResource, TeamMember } from '../../entreprise-helper.service';

export interface CatalogItem {
  id: string;
  name: string;
  desc: string;
  type: 'vm' | 'db' | 'saas';
  price: number;
  specs: string[];
  bg: string;
  color: string;
  rawOffer?: any;
}

export interface VmTemplate {
  id: string;
  name: string;
  label: string;
}

@Component({
  selector: 'ent-deploy-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './deploy-page.html',
  styleUrls: ['./deploy-page.scss']
})
export class DeployPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = environment.apiBaseUrl.replace(/\/$/, '');

  /* INPUTS & OUTPUTS */
  actualAdmin = input<Admin | null>(null);
  teamMembers = input<TeamMember[]>([]);
  walletBalance = input<number>(0);
  walletDevise = input<string>('DT');
  deployedResources = input<DeployedResource[]>([]);

  resourceDeployed = output<void>();
  navigateTo = output<string>();

  /* MAIN TAB: CATALOG vs MY RESOURCES */
  activeMainTab = signal<'catalog' | 'my-resources'>('catalog');

  /* CATALOG & FILTERS */
  activeFilter = signal<'all' | 'iaas' | 'paas' | 'saas'>('all');
  searchTerm = signal<string>('');
  catalogOffers = signal<CatalogItem[]>([]);
  isLoadingCatalog = signal<boolean>(true);

  selectedOffer = signal<CatalogItem | null>(null);
  deployStep = signal<1 | 2>(1); // 1: Select Plan, 2: Configure & Deploy

  /* IaaS / VM Configuration */
  vmTemplates = signal<VmTemplate[]>([]);
  selectedTemplateName = signal<string>('');
  instanceName = signal<string>('');
  customCpu = signal<number>(2);
  customRam = signal<number>(4);
  customDisk = signal<number>(40);

  /* PaaS / Database Configuration */
  selectedSgbd = signal<'POSTGRESQL' | 'MYSQL' | 'MONGODB' | 'REDIS'>('POSTGRESQL');

  /* SaaS / Application Configuration */
  readonly SAAS_APP_OPTIONS = [
    { key: 'wordpress:latest', label: 'WordPress CMS', icon: 'assets/Wordpress logo.png', desc: 'CMS leader pour sites web, blogs et portails' },
    { key: 'n8nio/n8n:latest', label: 'n8n Workflow', icon: 'assets/n8n_Logo.png', desc: 'Automatisation de flux et orchestrateur d\'API' },
    { key: 'phpmyadmin/phpmyadmin:latest', label: 'phpMyAdmin', icon: 'assets/MySQL Logo.png', desc: 'Gestionnaire web pour bases MySQL / MariaDB' },
    { key: 'dpage/pgadmin4:latest', label: 'pgAdmin 4', icon: 'assets/PostgreSQL Logo.png', desc: 'Console d\'administration PostgreSQL' },
  ];
  selectedSaasApp = signal<string>('wordpress:latest');
  saasAdminEmail = signal<string>('');
  saasAdminPassword = signal<string>('');
  isSaasPasswordVisible = signal<boolean>(false);
  saasLinkedPaasId = signal<number | null>(null);
  companyDatabases = signal<any[]>([]);

  /* Collaborator Assignment */
  selectedCollaboratorId = signal<number | string | null>(null); // null = for admin/company

  /* Execution state */
  isDeploying = signal<boolean>(false);
  pendingResourceName = signal<string | null>(null);
  deploySuccess = signal<{
    title?: string;
    name: string;
    type: string;
    details?: string;
    isCompleted?: boolean;
  } | null>(null);

  /* MY RESOURCES VIEW FILTER & STATE */
  resFilter = signal<'all' | 'vm' | 'db' | 'saas'>('all');
  resSearchTerm = signal<string>('');
  passwordVisibilityMap = signal<Record<string, boolean>>({});
  copiedField = signal<string | null>(null);

  /* UPGRADE MODAL STATE */
  isUpgradeModalOpen = signal<boolean>(false);
  upgradeTarget = signal<DeployedResource | null>(null);
  upgradeCatalogues = signal<CatalogItem[]>([]);
  selectedUpgrade = signal<CatalogItem | null>(null);
  isUpgrading = signal<boolean>(false);

  /* DELETE MODAL STATE */
  isDeleteModalOpen = signal<boolean>(false);
  deleteTarget = signal<DeployedResource | null>(null);
  isDeleting = signal<boolean>(false);

  /* TOAST FEEDBACK */
  toastMsg = signal<string>('');
  toastType = signal<'success' | 'error' | 'warning' | 'info'>('success');
  isToastVisible = signal<boolean>(false);

  /* COMPUTED */
  filteredOffers = computed(() => {
    const filter = this.activeFilter();
    const search = this.searchTerm().toLowerCase().trim();
    let list = this.catalogOffers();

    if (filter === 'iaas') list = list.filter(o => o.type === 'vm');
    else if (filter === 'paas') list = list.filter(o => o.type === 'db');
    else if (filter === 'saas') list = list.filter(o => o.type === 'saas');

    if (search) {
      list = list.filter(o =>
        o.name.toLowerCase().includes(search) ||
        o.desc.toLowerCase().includes(search) ||
        o.specs.some(s => s.toLowerCase().includes(search))
      );
    }
    return list;
  });

  isWalletSufficient = computed(() => {
    const offer = this.selectedOffer();
    if (!offer) return true;
    return (this.walletBalance() ?? 0) >= offer.price;
  });

  walletDiff = computed(() => {
    const offer = this.selectedOffer();
    if (!offer) return 0;
    return Math.max(0, (this.walletBalance() ?? 0) - offer.price);
  });

  nameValidationError = computed<string | null>(() => {
    const raw = this.instanceName();
    const name = (raw || '').trim();
    if (!name) return null;

    const offer = this.selectedOffer();
    const offerType = offer?.type;

    // 1. Contrôle de saisie spécifique IaaS : interdiction formelle de commencer par "template"
    if (offerType === 'vm' && name.toLowerCase().startsWith('template')) {
      return 'Le nom d\'une instance IaaS ne peut pas commencer par "template" (terme réservé par le système).';
    }

    // 2. Contrôle de format et longueur
    if (name.length < 3) {
      return 'Le nom d\'instance doit comporter au moins 3 caractères.';
    }
    if (name.length > 32) {
      return 'Le nom d\'instance ne peut pas dépasser 32 caractères.';
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return 'Caractères autorisés : lettres, chiffres, tirets (-) et underscores (_) uniquement.';
    }

    // 3. Contrôle d\'unicité des noms d\'instances pour l\'admin et l\'organisation
    const deployed = this.deployedResources() || [];
    const nameLower = name.toLowerCase();

    if (offerType === 'db') {
      const duplicatePaas = deployed.find(
        r => r.type === 'db' && r.name && r.name.trim().toLowerCase() === nameLower
      );
      if (duplicatePaas) {
        return `Une instance PaaS (Base de données) nommée "${name}" existe déjà. Deux instances ne peuvent pas avoir le même nom.`;
      }
    } else if (offerType === 'saas') {
      const duplicateSaas = deployed.find(
        r => r.type === 'saas' && r.name && r.name.trim().toLowerCase() === nameLower
      );
      if (duplicateSaas) {
        return `Une application SaaS nommée "${name}" existe déjà. Deux instances ne peuvent pas avoir le même nom.`;
      }
    } else if (offerType === 'vm') {
      const duplicateVm = deployed.find(
        r => r.type === 'vm' && r.name && r.name.trim().toLowerCase() === nameLower
      );
      if (duplicateVm) {
        return `Une machine virtuelle IaaS nommée "${name}" existe déjà. Deux instances ne peuvent pas avoir le même nom.`;
      }
    }

    return null;
  });

  /* SCOPE FILTER: 'admin' (default) vs 'all' */
  scopeFilter = signal<'admin' | 'all'>('admin');

  adminId = computed(() => {
    const admin = this.actualAdmin();
    if (admin?.id) return Number(admin.id);
    if (typeof localStorage !== 'undefined') {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const decoded: any = jwtDecode(token);
          if (decoded?.sub) return Number(decoded.sub);
        } catch {}
      }
    }
    return null;
  });

  isResourceReady(r: DeployedResource): boolean {
    if (!r) return false;
    const s = (r.status || '').toUpperCase();
    if (s === 'PROVISIONING' || s === 'CREATING' || s === 'PENDING') {
      return false;
    }
    if (r.ip && (r.ip.toLowerCase().includes('provisionnement') || r.ip.toLowerCase().includes('création'))) {
      return false;
    }
    return true;
  }

  adminResources = computed(() => {
    const list = this.deployedResources() || [];
    const admin = this.actualAdmin();
    const aId = this.adminId();

    const adminNom = (admin?.nom || '').trim().toLowerCase();
    const adminPrenom = (admin?.prenom || '').trim().toLowerCase();
    const adminFullName = `${adminPrenom} ${adminNom}`.trim();

    return list.filter(r => {
      // 0. Do not include if still provisioning
      if (!this.isResourceReady(r)) {
        return false;
      }

      // 1. Direct match on ownerId
      if (r.ownerId != null && aId != null && Number(r.ownerId) === aId) {
        return true;
      }
      // 2. Match by full name
      if (r.owner) {
        const ownerLower = r.owner.toLowerCase().trim();
        if (adminFullName && (ownerLower === adminFullName || ownerLower.includes(adminFullName) || adminFullName.includes(ownerLower))) {
          return true;
        }
        if (adminNom && adminPrenom && ownerLower.includes(adminNom) && ownerLower.includes(adminPrenom)) {
          return true;
        }
      }
      return false;
    });
  });

  baseScopedResources = computed(() => {
    const raw = this.scopeFilter() === 'admin' ? this.adminResources() : (this.deployedResources() || []);
    return raw.filter(r => this.isResourceReady(r));
  });

  filteredResources = computed(() => {
    let list = this.baseScopedResources();
    const filter = this.resFilter();
    const query = this.resSearchTerm().toLowerCase().trim();

    if (filter !== 'all') {
      list = list.filter(r => r.type === filter);
    }

    if (query) {
      list = list.filter(r =>
        (r.name && r.name.toLowerCase().includes(query)) ||
        (r.owner && r.owner.toLowerCase().includes(query)) ||
        (r.specs && r.specs.toLowerCase().includes(query)) ||
        (r.ip && r.ip.toLowerCase().includes(query)) ||
        (r.typeSgbd && r.typeSgbd.toLowerCase().includes(query))
      );
    }
    return list;
  });

  resourceStats = computed(() => {
    const list = this.baseScopedResources();
    const total = list.length;
    const vmCount = list.filter(r => r.type === 'vm').length;
    const dbCount = list.filter(r => r.type === 'db').length;
    const saasCount = list.filter(r => r.type === 'saas').length;
    const totalCost = list.reduce((acc, r) => acc + (r.cost || 0), 0);
    return { total, vmCount, dbCount, saasCount, totalCost };
  });

  isResourceAdmin(r: DeployedResource): boolean {
    const aId = this.adminId();
    if (r.ownerId != null && aId != null && Number(r.ownerId) === aId) {
      return true;
    }
    const admin = this.actualAdmin();
    const adminFullName = `${admin?.prenom || ''} ${admin?.nom || ''}`.trim().toLowerCase();
    if (adminFullName && r.owner?.toLowerCase().trim() === adminFullName) {
      return true;
    }
    return false;
  }

  constructor() {
    effect(() => {
      const success = this.deploySuccess();
      const allResources = this.deployedResources() || [];

      if (!success || success.isCompleted) {
        return;
      }

      const targetName = (this.pendingResourceName() || success.name || '').toLowerCase().trim();
      if (!targetName) return;

      // Chercher si la ressource est maintenant présente et opérationnelle dans deployedResources
      const found = allResources.find(r => 
        (r.name?.toLowerCase().trim() === targetName || (r.realId && String(r.realId) === targetName)) &&
        this.isResourceReady(r)
      );

      if (found) {
        // Le provisionnement est terminé !
        this.deploySuccess.set({
          title: 'Ressource Déployée avec Succès !',
          name: found.name,
          type: success.type,
          details: (found.connectionString || found.ip)
            ? `Point d'accès : ${found.connectionString || found.ip}`
            : 'Votre ressource est désormais active et opérationnelle.',
          isCompleted: true,
        });
        this.pendingResourceName.set(null);
        this.showToast(`${found.name} : Déploiement terminé avec succès !`, 'success');
      }
    });
  }

  ngOnInit() {
    this.loadCatalog();
    this.loadVmTemplates();
    this.loadCompanyDatabases();
    if (this.actualAdmin()?.email) {
      this.saasAdminEmail.set(this.actualAdmin()?.email || '');
    }
  }

  showToast(msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') {
    this.toastMsg.set(msg);
    this.toastType.set(type);
    this.isToastVisible.set(true);
    setTimeout(() => this.isToastVisible.set(false), 4000);
  }

  /* ── DATA LOADERS ── */
  loadCatalog() {
    this.isLoadingCatalog.set(true);
    this.http.get<any[]>(`${this.base}/catalogue`).subscribe({
      next: (data) => {
        const typeMap: Record<string, 'vm' | 'db' | 'saas'> = {
          IAAS: 'vm',
          PAAS: 'db',
          SAAS: 'saas',
        };

        const mapped: CatalogItem[] = (data || []).map((cat: any) => {
          const type = typeMap[cat.typeService] || 'saas';
          let specs: string[] = [];
          if (cat.specs) {
            specs = typeof cat.specs === 'string' ? cat.specs.split('.').map((s: string) => s.trim()) : cat.specs;
          } else {
            if (type === 'vm') {
              specs = [
                `${cat.vcpu || 1} vCPU`,
                `${cat.ramMB || 1} GB RAM`,
                `${cat.stockageGB || 20} GB SSD`
              ];
            } else {
              if (cat.vcpu) specs.push(`${cat.vcpu} vCPU`);
              if (cat.ramMB) specs.push(`${cat.ramMB} GB RAM`);
              if (cat.stockageGB) specs.push(`${cat.stockageGB} GB SSD`);
            }
          }

          return {
            id: String(cat.id),
            name: cat.nomService || cat.name || 'Offre Cloud',
            desc: cat.description || cat.desc || '',
            type,
            price: Number(cat.prix ?? cat.price ?? 0),
            specs,
            bg: cat.bg || '#f8fafc',
            color: cat.color || '#F07A1F',
            rawOffer: cat,
          };
        });

        this.catalogOffers.set(mapped);
        this.isLoadingCatalog.set(false);
      },
      error: () => {
        this.isLoadingCatalog.set(false);
        this.showToast('Impossible de récupérer les offres du catalogue', 'error');
      }
    });
  }

  loadVmTemplates() {
    this.http.get<any>(`${this.base}/esxi/templates`).subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        let templates = (list || []).map((vm: any) => ({
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
        if (templates.length > 0) {
          this.selectedTemplateName.set(templates[0].name);
        }
      },
      error: () => {
        const fallback = [
          { id: 'tmpl-ubuntu-server', name: 'Template Ubuntu Server', label: 'Ubuntu Server (64 bits)' },
          { id: 'tmpl-ubuntu-desktop', name: 'Template Ubuntu Desktop', label: 'Ubuntu Desktop (64 bits)' },
          { id: 'tmpl-debian', name: 'Template Debian', label: 'Debian GNU/Linux (64 bits)' },
          { id: 'tmpl-alpine', name: 'Template Alpine', label: 'Alpine Linux (64 bits)' },
          { id: 'tmpl-win7', name: 'Template Windows 7', label: 'Windows 7 (64 bits)' },
          { id: 'tmpl-win2000', name: 'Template Windows 2000', label: 'Windows 2000' },
        ];
        this.vmTemplates.set(fallback);
        this.selectedTemplateName.set(fallback[0].name);
      }
    });
  }

  loadCompanyDatabases() {
    this.http.get<any[]>(`${this.base}/paas/mes-databases`).subscribe({
      next: (data) => {
        this.companyDatabases.set((data || []).filter(d => d.status === 'RUNNING'));
      },
      error: () => {}
    });
  }

  /* ── SELECTION & WIZARD STEPS ── */
  generateUniqueDefaultName(prefix: string, baseName: string, type: 'vm' | 'db' | 'saas'): string {
    const clean = baseName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    let candidate = `${prefix}-${clean}`.slice(0, 32);
    if (type === 'vm' && candidate.toLowerCase().startsWith('template')) {
      candidate = `vm-${candidate}`.slice(0, 32);
    }
    const deployed = this.deployedResources() || [];
    const exists = (n: string) => deployed.some(r => r.type === type && r.name?.trim().toLowerCase() === n.trim().toLowerCase());

    if (!exists(candidate)) {
      return candidate;
    }
    let i = 1;
    while (i <= 99) {
      const suffixed = `${candidate.slice(0, 29)}-${i}`;
      if (!exists(suffixed)) {
        return suffixed;
      }
      i++;
    }
    return candidate;
  }

  selectOffer(offer: CatalogItem) {
    this.selectedOffer.set(offer);
    this.deploySuccess.set(null);

    // Initialiser les valeurs selon le type
    if (offer.type === 'vm') {
      const raw = offer.rawOffer;
      this.customCpu.set(raw?.vcpu || 2);
      this.customRam.set(raw?.ramMB || 4);
      this.customDisk.set(raw?.stockageGB || 40);
    } else if (offer.type === 'db') {
      const lower = offer.name.toLowerCase();
      if (lower.includes('mysql')) this.selectedSgbd.set('MYSQL');
      else if (lower.includes('mongo')) this.selectedSgbd.set('MONGODB');
      else if (lower.includes('redis')) this.selectedSgbd.set('REDIS');
      else this.selectedSgbd.set('POSTGRESQL');
    } else if (offer.type === 'saas') {
      // Dériver automatiquement l'application SaaS exacte choisie dans le catalogue
      const lower = (offer.name || '').toLowerCase();
      if (lower.includes('redis')) {
        this.selectedSaasApp.set('rediscommander/redis-commander:latest');
      } else if (lower.includes('mongo')) {
        this.selectedSaasApp.set('mongo-express:latest');
      } else if (lower.includes('phpmyadmin')) {
        this.selectedSaasApp.set('phpmyadmin/phpmyadmin:latest');
      } else if (lower.includes('pgadmin')) {
        this.selectedSaasApp.set('dpage/pgadmin4:latest');
      } else if (lower.includes('n8n')) {
        this.selectedSaasApp.set('n8nio/n8n:latest');
      } else {
        this.selectedSaasApp.set('wordpress:latest');
      }

      // Pré-sélectionner la première base compatible si disponible
      this.saasLinkedPaasId.set(null);
      const compat = this.getCompatibleDatabases();
      if (compat.length > 0) {
        this.saasLinkedPaasId.set(compat[0].id);
      }
    }

    // Le nom d'instance doit être toujours vide à l'ouverture pour forcer la saisie
    this.instanceName.set('');
    this.selectedCollaboratorId.set(null);

    this.deployStep.set(2);
  }

  backToOffers() {
    this.deployStep.set(1);
    this.selectedOffer.set(null);
    this.deploySuccess.set(null);
    this.pendingResourceName.set(null);
    this.instanceName.set('');
    this.saasLinkedPaasId.set(null);
    this.selectedCollaboratorId.set(null);
  }

  isLinkedPaasRequired(): boolean {
    const saas = this.selectedSaasApp().toLowerCase();
    return saas.includes('phpmyadmin') || saas.includes('pgadmin') || saas.includes('redis') || saas.includes('mongo');
  }

  getLinkedPaasLabel(): string {
    const saas = this.selectedSaasApp().toLowerCase();
    if (saas.includes('phpmyadmin')) return 'Base de données MySQL liée';
    if (saas.includes('pgadmin')) return 'Base de données PostgreSQL liée';
    if (saas.includes('redis')) return 'Base de données Redis liée (Cache)';
    if (saas.includes('mongo')) return 'Base de données MongoDB liée';
    return 'Base de données PaaS liée';
  }

  getRequiredSgbdName(): string {
    const saas = this.selectedSaasApp().toLowerCase();
    if (saas.includes('phpmyadmin')) return 'MySQL';
    if (saas.includes('pgadmin')) return 'PostgreSQL';
    if (saas.includes('redis')) return 'Redis';
    if (saas.includes('mongo')) return 'MongoDB';
    return 'compatible';
  }

  isSaasCredentialsRequired(): boolean {
    const saas = this.selectedSaasApp().toLowerCase();
    return saas.includes('pgadmin') || saas.includes('n8n');
  }

  getCompatibleDatabases(): any[] {
    const saas = this.selectedSaasApp().toLowerCase();
    let dbs = this.companyDatabases() || [];

    // Inclure également les bases présentes dans deployedResources
    const deployedDbs = (this.deployedResources() || []).filter(r => r.type === 'db');
    if (deployedDbs.length > 0) {
      const existingIds = new Set(dbs.map(d => d.id));
      for (const r of deployedDbs) {
        const id = r.realId || Number(String(r.id).replace('paas-', ''));
        if (id && !existingIds.has(id)) {
          dbs.push({
            id,
            nomPersonnalise: r.name,
            typeSgbd: r.typeSgbd,
            status: r.status,
            hostIp: r.ip?.split(':')[0] || 'localhost',
            port: r.ip?.split(':')[1] || '5432'
          });
        }
      }
    }

    if (saas.includes('phpmyadmin')) {
      return dbs.filter(d => (d.typeSgbd || '').toUpperCase() === 'MYSQL');
    }
    if (saas.includes('pgadmin')) {
      return dbs.filter(d => (d.typeSgbd || '').toUpperCase() === 'POSTGRESQL');
    }
    if (saas.includes('redis')) {
      return dbs.filter(d => (d.typeSgbd || '').toUpperCase() === 'REDIS');
    }
    if (saas.includes('mongo')) {
      return dbs.filter(d => (d.typeSgbd || '').toUpperCase() === 'MONGODB');
    }
    return dbs;
  }

  /* ── VALIDATION & DEPLOYMENT ── */
  validateForm(): string | null {
    const name = this.instanceName().trim();
    if (!name) return 'Veuillez saisir un nom pour l\'instance.';

    const nameError = this.nameValidationError();
    if (nameError) return nameError;

    const offer = this.selectedOffer();
    if (!offer) return 'Aucune offre sélectionnée.';

    if (!this.isWalletSufficient()) {
      return `Solde insuffisant (${this.walletBalance()} ${this.walletDevise()}). Cette ressource coûte ${offer.price} ${this.walletDevise()}/mois.`;
    }

    if (offer.type === 'vm') {
      if (!this.selectedTemplateName()) return 'Veuillez sélectionner un système d\'exploitation.';
    }

    if (offer.type === 'saas') {
      if (this.isLinkedPaasRequired() && !this.saasLinkedPaasId()) {
        const dbs = this.getCompatibleDatabases();
        if (dbs.length === 0) {
          return `Aucune base ${this.getRequiredSgbdName()} active trouvée dans votre organisation. Vous devez d'abord déployer une base PaaS compatible.`;
        }
        return `Veuillez sélectionner une base de données ${this.getRequiredSgbdName()} liée pour cette application.`;
      }

      if (this.isSaasCredentialsRequired()) {
        const email = this.saasAdminEmail().trim();
        if (!email || !email.includes('@') || !email.includes('.')) {
          return 'Veuillez saisir une adresse email valide pour l\'administrateur de l\'application.';
        }
        if (!this.saasAdminPassword().trim()) {
          return 'Veuillez définir un mot de passe d\'administration pour cette application.';
        }
      }
    }

    return null;
  }

  confirmAndDeploy() {
    const error = this.validateForm();
    if (error) {
      this.showToast(error, 'warning');
      return;
    }

    const offer = this.selectedOffer();
    if (!offer) return;

    this.isDeploying.set(true);

    const rawCollaboratorId = this.selectedCollaboratorId();
    const fallbackAdminId = this.adminId() ?? Number(this.actualAdmin()?.id);
    const targetClientId = (rawCollaboratorId !== null && rawCollaboratorId !== undefined && rawCollaboratorId !== '' && !isNaN(Number(rawCollaboratorId)))
      ? Number(rawCollaboratorId)
      : Number(fallbackAdminId);

    if (!targetClientId || isNaN(targetClientId)) {
      this.isDeploying.set(false);
      this.showToast('Identifiant utilisateur introuvable. Veuillez vous reconnecter.', 'error');
      return;
    }

    // Si la ressource est attribuée à un collaborateur, basculer la vue des ressources sur toute l'équipe
    if (rawCollaboratorId !== null && rawCollaboratorId !== undefined && rawCollaboratorId !== '') {
      this.scopeFilter.set('all');
    }

    if (offer.type === 'vm') {
      this.deployVm(offer, targetClientId);
    } else if (offer.type === 'db') {
      this.deployPaas(offer, targetClientId);
    } else if (offer.type === 'saas') {
      this.deploySaas(offer, targetClientId);
    }
  }

  private deployVm(offer: CatalogItem, clientId: number) {
    const payload = {
      name: this.instanceName().trim(),
      ramGB: Number(this.customRam()),
      vCPU: Number(this.customCpu()),
      storageGB: Number(this.customDisk()),
      templateName: this.selectedTemplateName(),
      catalogueId: Number(offer.id),
      clientId: Number(clientId),
    };

    this.http.post<any>(`${this.base}/esxi/provision`, payload).subscribe({
      next: (res) => {
        this.isDeploying.set(false);
        this.pendingResourceName.set(payload.name);
        this.deploySuccess.set({
          title: 'Ressource en cours de provisionnement...',
          name: payload.name,
          type: 'Machine Virtuelle IaaS',
          details: `Provisionnement initié sur le template ${payload.templateName}. L'instance apparaîtra dans vos ressources dès que la configuration et le démarrage seront terminés.`,
          isCompleted: false
        });
        this.showToast(`Machine Virtuelle ${payload.name} : en cours de provisionnement...`, 'info');
        this.resourceDeployed.emit();
      },
      error: (err) => {
        this.isDeploying.set(false);
        this.showToast(err?.error?.message || 'Erreur lors du déploiement de la VM', 'error');
      }
    });
  }

  private deployPaas(offer: CatalogItem, clientId: number) {
    const payload = {
      nomPersonnalise: this.instanceName().trim(),
      typeSgbd: this.selectedSgbd(),
      clientId: Number(clientId),
      catalogueId: Number(offer.id)
    };

    this.http.post<any>(`${this.base}/paas/create`, payload).subscribe({
      next: (res) => {
        this.isDeploying.set(false);
        this.pendingResourceName.set(payload.nomPersonnalise);
        this.deploySuccess.set({
          title: 'Ressource en cours de provisionnement...',
          name: payload.nomPersonnalise,
          type: `Base de données PaaS (${payload.typeSgbd})`,
          details: `Provisionnement de la base de données initié. Elle apparaîtra dans vos ressources dès que le conteneur sera prêt.`,
          isCompleted: false
        });
        this.showToast(`Base de données ${payload.nomPersonnalise} : en cours de provisionnement...`, 'info');
        this.resourceDeployed.emit();
      },
      error: (err) => {
        this.isDeploying.set(false);
        this.showToast(err?.error?.message || 'Erreur lors du déploiement de la base', 'error');
      }
    });
  }

  private deploySaas(offer: CatalogItem, clientId: number) {
    const needsCreds = this.isSaasCredentialsRequired();
    const payload: any = {
      nomPersonnalise: this.instanceName().trim(),
      appType: this.selectedSaasApp(),
      clientId: Number(clientId),
      catalogueId: Number(offer.id),
      linkedPaasServiceId: this.saasLinkedPaasId() ? Number(this.saasLinkedPaasId()) : undefined,
      adminEmail: needsCreds ? this.saasAdminEmail().trim() : undefined,
      adminPassword: needsCreds ? this.saasAdminPassword().trim() : undefined
    };

    this.http.post<any>(`${this.base}/saas/create`, payload).subscribe({
      next: (res) => {
        this.isDeploying.set(false);
        this.pendingResourceName.set(payload.nomPersonnalise);
        this.deploySuccess.set({
          title: 'Ressource en cours de provisionnement...',
          name: payload.nomPersonnalise,
          type: 'Application SaaS Managée',
          details: `Déploiement du conteneur applicatif initié. L'instance apparaîtra dans vos ressources dès son démarrage complet.`,
          isCompleted: false
        });
        this.showToast(`Application SaaS ${payload.nomPersonnalise} : en cours de provisionnement...`, 'info');
        this.resourceDeployed.emit();
      },
      error: (err) => {
        this.isDeploying.set(false);
        this.showToast(err?.error?.message || 'Erreur lors du déploiement SaaS', 'error');
      }
    });
  }

  /* ── INTERACTIVE RESOURCES ACTIONS (CARDS) ── */
  copyToClipboard(text: string | undefined, fieldId: string, event?: Event) {
    if (event) event.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      this.copiedField.set(fieldId);
      setTimeout(() => {
        if (this.copiedField() === fieldId) this.copiedField.set(null);
      }, 2000);
    });
  }

  togglePassword(id: string, event?: Event) {
    if (event) event.stopPropagation();
    this.passwordVisibilityMap.update(map => ({
      ...map,
      [id]: !map[id]
    }));
  }

  isPasswordVisible(id: string): boolean {
    return !!this.passwordVisibilityMap()[id];
  }

  openSaasApp(url?: string, event?: Event) {
    if (event) event.stopPropagation();
    if (!url) {
      this.showToast('Point d\'accès en cours de génération...', 'warning');
      return;
    }
    const targetUrl = url.startsWith('http') ? url : `http://${url}`;
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  }

  openVmConsole(vmId: string, event?: Event) {
    if (event) event.stopPropagation();
    this.router.navigate(['/vm-console'], {
      state: { id: vmId, returnUrl: '/entreprise-admin-dashboard' }
    });
  }

  toggleVmPower(res: DeployedResource, event?: Event) {
    if (event) event.stopPropagation();
    const isRunning = res.status === 'RUNNING' || res.status === 'running';
    const action = isRunning ? 'stop' : 'start';
    const vmId = res.realId || res.id;

    this.showToast(action === 'stop' ? `Arrêt de ${res.name} en cours...` : `Démarrage de ${res.name} en cours...`, 'warning');
    this.http.post<any>(`${this.base}/esxi/my-vms/${vmId}/power`, { action }).subscribe({
      next: () => {
        this.showToast(`${res.name} : Commande ${action === 'stop' ? 'arrêt' : 'démarrage'} envoyée !`, 'success');
        this.resourceDeployed.emit();
      },
      error: (err) => {
        this.showToast(err?.error?.message || `Erreur lors de l'action ${action}`, 'error');
      }
    });
  }

  /* ── UPGRADE MODAL ── */
  openUpgradeModal(res: DeployedResource, event?: Event) {
    if (event) event.stopPropagation();
    const currentPrice = Number(res.cost || 0);
    this.upgradeTarget.set(res);
    this.selectedUpgrade.set(null);

    const typeService = res.type === 'vm' ? 'IAAS' : res.type === 'db' ? 'PAAS' : 'SAAS';
    this.http.get<any[]>(`${this.base}/catalogue/upgrade/${typeService}/${currentPrice}`).subscribe({
      next: (cats) => {
        const typeMap: Record<string, 'vm' | 'db' | 'saas'> = {
          IAAS: 'vm',
          PAAS: 'db',
          SAAS: 'saas',
        };
        const mapped = (cats || []).map((cat: any) => ({
          id: String(cat.id),
          name: cat.nomService || cat.name || 'Plan Supérieur',
          desc: cat.description || cat.desc || '',
          type: typeMap[cat.typeService] || 'vm',
          price: Number(cat.prix ?? cat.price ?? 0),
          specs: cat.specs ? (typeof cat.specs === 'string' ? cat.specs.split('.').map((s: string) => s.trim()) : cat.specs) : [
            cat.vcpu ? `${cat.vcpu} vCPU` : '',
            cat.ramMB ? `${cat.ramMB} GB RAM` : '',
            cat.stockageGB ? `${cat.stockageGB} GB SSD` : ''
          ].filter(Boolean),
          bg: cat.bg || '#f8fafc',
          color: cat.color || '#F07A1F',
          rawOffer: cat,
        }));
        this.upgradeCatalogues.set(mapped);
        this.isUpgradeModalOpen.set(true);
      },
      error: () => {
        this.showToast('Aucun plan supérieur disponible pour cette offre', 'warning');
      }
    });
  }

  selectUpgrade(cat: CatalogItem) {
    this.selectedUpgrade.set(cat);
  }

  getUpgradeDiff(): string {
    const sel = this.selectedUpgrade();
    const tgt = this.upgradeTarget();
    if (!sel || !tgt) return '0.00';
    return Math.max(0, sel.price - tgt.cost).toFixed(2);
  }

  closeUpgrade() {
    this.isUpgradeModalOpen.set(false);
    this.upgradeTarget.set(null);
    this.selectedUpgrade.set(null);
  }

  submitUpgrade() {
    const sel = this.selectedUpgrade();
    const tgt = this.upgradeTarget();
    if (!sel || !tgt) return;

    this.isUpgrading.set(true);
    const targetId = tgt.realId || tgt.id.replace(/^(paas-|saas-)/, '');
    const endpoint = tgt.type === 'vm'
      ? `${this.base}/esxi/my-vms/${targetId}/upgrade`
      : tgt.type === 'db'
      ? `${this.base}/paas/my-databases/${targetId}/upgrade`
      : `${this.base}/saas/my-applications/${targetId}/upgrade`;

    this.http.post(endpoint, { catalogueId: Number(sel.id) }).subscribe({
      next: () => {
        this.isUpgrading.set(false);
        this.closeUpgrade();
        this.showToast(`Mise à niveau de ${tgt.name} effectuée avec succès !`, 'success');
        this.resourceDeployed.emit();
      },
      error: (err) => {
        this.isUpgrading.set(false);
        this.showToast(err?.error?.message || 'Erreur lors de la mise à niveau', 'error');
      }
    });
  }

  /* ── DELETE MODAL ── */
  openDeleteModal(res: DeployedResource, event?: Event) {
    if (event) event.stopPropagation();
    this.deleteTarget.set(res);
    this.isDeleteModalOpen.set(true);
  }

  closeDeleteModal() {
    this.isDeleteModalOpen.set(false);
    this.deleteTarget.set(null);
  }

  confirmDelete() {
    const tgt = this.deleteTarget();
    if (!tgt) return;

    this.isDeleting.set(true);
    const targetId = tgt.realId || tgt.id.replace(/^(paas-|saas-)/, '');
    const endpoint = tgt.type === 'vm'
      ? `${this.base}/esxi/my-vms/${targetId}`
      : tgt.type === 'db'
      ? `${this.base}/paas/${targetId}`
      : `${this.base}/saas/${targetId}`;

    this.http.delete(endpoint).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.closeDeleteModal();
        this.showToast(`Ressource ${tgt.name} supprimée !`, 'success');
        this.resourceDeployed.emit();
      },
      error: (err) => {
        this.isDeleting.set(false);
        this.showToast(err?.error?.message || 'Erreur lors de la suppression', 'error');
      }
    });
  }

  /* ── ASSET HELPERS ── */
  hasSaasLogo(name?: string): boolean {
    const n = (name || '').toLowerCase();
    return n.includes('wordpress') || n.includes('wp') || n.includes('n8n') || n.includes('pgadmin') || n.includes('phpmyadmin') || n.includes('redis') || n.includes('mongo');
  }

  getSaasLogo(name?: string): string {
    const n = (name || '').toLowerCase();
    if (n.includes('wordpress') || n.includes('wp')) return 'assets/Wordpress logo.png';
    if (n.includes('n8n')) return 'assets/n8n_Logo.png';
    if (n.includes('pgadmin')) return 'assets/PostgreSQL Logo.png';
    if (n.includes('phpmyadmin')) return 'assets/MySQL Logo.png';
    if (n.includes('redis')) return 'assets/Redis logo.png';
    if (n.includes('mongo')) return 'assets/MongoDB Logo.png';
    return '';
  }

  getTemplateLogo(name?: string): string {
    const n = (name || '').toLowerCase();
    if (n.includes('debian')) return 'assets/Debian.png';
    if (n.includes('alpine')) return 'assets/alpine.png';
    if (n.includes('windows') || n.includes('win') || n.includes('2000') || n.includes('win7')) return 'assets/windows 7.png';
    if (n.includes('ubuntu')) return 'assets/ubuntu.png';
    return 'assets/ubuntu.png';
  }

  getCategoryLabel(type?: string): string {
    if (type === 'vm') return 'IaaS Cloud';
    if (type === 'db') return 'PaaS SGBD';
    if (type === 'saas') return 'SaaS App';
    return 'Cloud Service';
  }

  getInitials(name?: string): string {
    return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'AD';
  }
}
