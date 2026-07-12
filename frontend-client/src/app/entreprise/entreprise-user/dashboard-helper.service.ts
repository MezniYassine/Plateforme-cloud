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
  entreprise?: { nomEntreprise: string; taxId: string; };
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

  pageTitle = computed(() => this.PAGE_TITLES[this.activePage()] ?? 'Dashboard');
  setPage(p: string) { this.activePage.set(p); }

  userName = signal<string>('');
  actualUser = signal<EntrepriseUser | null>(null);
  companyName = signal<string>('');
  
  mySpend = computed(() => {
    const vmsCost = this.myVMs().reduce((acc, vm) => acc + (vm.cost || 0), 0);
    const servicesCost = this.myServices().reduce((acc, s) => acc + (s.cost || 0), 0);
    return vmsCost + servicesCost;
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
  instanceName = '';
  justification = '';
  vmTemplates = signal<VmTemplate[]>([]);
  selectedTemplateName = signal<string>('');

  selectService(s: CatalogItem) { this.selectedService.set(s); }
  updateTemplateName(val: string) { this.selectedTemplateName.set(val); }

  toastMsg = signal<string>('');
  toastColor = signal<string>('var(--green)');
  isToastVisible = signal<boolean>(false);

  showToast(msg: string, color = 'var(--green)') {
    this.toastMsg.set(msg);
    this.toastColor.set(color);
    this.isToastVisible.set(true);
    setTimeout(() => this.isToastVisible.set(false), 3500);
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

  submitRequest() {
    const svc = this.selectedService();
    if (!svc) return;

    if (!this.instanceName.trim()) {
      this.showToast("Veuillez saisir un nom pour l'instance", 'var(--amber)');
      return;
    }
    if (!this.justification.trim()) {
      this.showToast('Veuillez saisir une justification', 'var(--amber)');
      return;
    }

    const payload = {
      nomInstanceSouhaite: this.instanceName.trim(),
      justification: this.justification.trim(),
      catalogueId: Number(svc.id),
      templateName: svc.type === 'vm' ? (this.selectedTemplateName() || undefined) : undefined,
    };

    this.demandeService.create(payload).subscribe({
      next: (demande) => {
        const newReq: MyRequest = this.mapApiDemande(demande);
        this.myRequests.update(list => [newReq, ...list]);
        this.selectedService.set(null);
        this.instanceName = '';
        this.justification = '';
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
    const specs = cat ? cat.vcpu + ' vCPU - ' + cat.ramMB + ' GB RAM - ' + cat.stockageGB + ' GB SSD' : '';
    return {
      id: String(d.id),
      name: d.nomInstanceSouhaite,
      type: 'vm',
      specs,
      cost: cat ? Number(cat.prix) : 0,
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
      this.instanceName = r.name;
      this.justification = r.justification;
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
    this.http.get<any>(`${this.base}/esxi/vms`).subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        const templates = (list || [])
          .filter((vm: any) => String(vm?.name || '').toLowerCase().includes('template'))
          .map((vm: any) => ({
            id: String(vm.id),
            name: vm.name,
            label: String(vm.name).replace(/template\s*/i, '').trim() || vm.name
          }));
        this.vmTemplates.set(templates);
        if (templates.length > 0 && !this.selectedTemplateName()) {
          this.selectedTemplateName.set(templates[0].name);
        }
      },
      error: (err) => {
        console.error('Failed to load ESXi templates', err);
        this.showToast('Impossible de charger les templates ESXi', 'var(--red)');
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
          if (vm.catalogue && vm.catalogue.prix !== undefined) {
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
            ip: vm.ipAddress || vm.ip || '',
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

  deleteVm(id: string) {
    if (!confirm('Confirmer la suppression de la VM ?')) return;
    this.http.delete<any>(`${this.base}/esxi/my-vms/${id}`).subscribe({
      next: (res) => {
        this.myVMs.update(list => list.filter(v => v.id !== String(id)));
        this.showToast(res?.message ?? 'VM supprimée', 'var(--red)');
      },
      error: (err) => {
        this.showToast(err?.error?.message ?? 'Impossible de supprimer la VM', 'var(--red)');
      }
    });
  }

  loadCatalog() {
    this.http.get<any[]>(`${this.base}/catalogue`).subscribe({
      next: (data) => {
        const items: CatalogItem[] = (data || []).map((cat: any) => {
          const isVm = cat.type === 'vm' || cat.vcpu !== undefined || cat.ramMB !== undefined;
          const type = isVm ? 'vm' : (cat.type || 'saas');
          const specs = cat.specs
            ? (typeof cat.specs === 'string' ? cat.specs.split('.').map((s: string) => s.trim()) : cat.specs)
            : [
              (cat.vcpu || 0) + ' vCPU',
              (cat.ramMB || 0) + ' GB RAM',
              (cat.stockageGB || 0) + ' GB SSD'
            ];
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
        });
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
