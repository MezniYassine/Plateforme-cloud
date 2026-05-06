import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { FormBuilder, FormGroup } from '@angular/forms';

export interface MyRequest {
  id: string; name: string; type: 'vm' | 'db' | 'saas';
  specs: string; cost: number; date: string;
  justification: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectReason?: string;
}

export interface MyVM {
  id: string; name: string; os: string; ip: string;
  vcpu: number; ram_gb: number; disk: number; cost: number;
  cpu: number; ram: number;
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
export interface EntrepriseUser {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  role: string;
  entreprise?: {
    nomEntreprise: string;
    taxId: string;
  };
}

@Injectable({ providedIn: 'root' })
export class DashboardHelperService {
  /* ── NAVIGATION ─────────────────────────────────── */
  activePage = signal<string>('dashboard');
  currentDate = signal<string>('');
  private fb = inject(FormBuilder);
  profileForm!: FormGroup;


  readonly PAGE_TITLES: Record<string, string> = {
    dashboard: 'Vue d\'ensemble',
    'new-request': 'Demander une ressource',
    'my-requests': 'Mes demandes',
    vms: 'Mes VMs (IaaS)',
    services: 'Mes services',
    monitoring: 'Monitoring',
    profile: 'Mon profil',
  };

  private http = inject(HttpClient);


  pageTitle = computed(() => this.PAGE_TITLES[this.activePage()] ?? 'Dashboard');
  setPage(p: string) { this.activePage.set(p); }

  /* ── USER / COMPANY ─────────────────────────────── */
  userName = signal<string>('Anis Mrad');
  actualUser = signal<EntrepriseUser | null>(null);
  companyName = signal<string>('Acme Corporation');
  mySpend = signal<number>(82);

  /* ── MY VMs ─────────────────────────────────────── */
  myVMs = signal<MyVM[]>([
    { id: 'v1', name: 'vm-prod-backend-01', os: 'Ubuntu 22.04', ip: '10.0.1.10', vcpu: 4, ram_gb: 8, disk: 100, cost: 18.50, cpu: 62, ram: 74, status: 'running' },
    { id: 'v2', name: 'vm-dev-staging-02', os: 'Debian 12', ip: '10.0.1.11', vcpu: 2, ram_gb: 4, disk: 50, cost: 9.20, cpu: 28, ram: 41, status: 'running' },
    { id: 'v3', name: 'vm-test-03', os: 'CentOS 9', ip: '10.0.1.12', vcpu: 2, ram_gb: 4, disk: 50, cost: 9.20, cpu: 0, ram: 0, status: 'stopped' },
  ]);

  /* ── MY SERVICES ────────────────────────────────── */
  myServices = signal<MyService[]>([
    { id: 's1', name: 'PostgreSQL 16', type: 'db', url: 'db.prod-01:5432', specs: '4 GB RAM · 50 GB SSD', cost: 8.00, bg: 'var(--teal-light)', color: 'var(--teal)' },
    { id: 's2', name: 'Redis 7', type: 'db', url: 'cache-01:6379', specs: '1 GB RAM · SSD', cost: 4.50, bg: 'var(--red-light)', color: 'var(--red)' },
    { id: 's3', name: 'Nextcloud', type: 'saas', url: 'cloud.acme.com', specs: '2 vCPU · 4 GB · 200 GB', cost: 12.00, bg: 'var(--blue-light)', color: 'var(--blue)' },
  ]);

  /* ── MY REQUESTS ────────────────────────────────── */
  myRequests = signal<MyRequest[]>([
    { id: 'r1', name: 'vm-prod-backend-01', type: 'vm', specs: '4 vCPU · 8 GB RAM · 100 GB', cost: 18.50, date: 'Aujourd\'hui, 09h14', justification: 'Backend API v2 production', status: 'pending' },
    { id: 'r2', name: 'PostgreSQL 16 db-prod', type: 'db', specs: '4 GB RAM · 50 GB SSD', cost: 8.00, date: 'Hier, 16h30', justification: 'DB pour module CRM', status: 'pending' },
    { id: 'r3', name: 'vm-dev-staging-02', type: 'vm', specs: '2 vCPU · 4 GB RAM · 50 GB', cost: 9.20, date: 'Il y a 3 jours', justification: 'Environnement de staging', status: 'approved' },
    { id: 'r4', name: 'Redis 7', type: 'db', specs: '1 GB RAM · SSD', cost: 4.50, date: 'Il y a 5 jours', justification: 'Cache sessions utilisateurs', status: 'approved' },
    { id: 'r5', name: 'Elasticsearch 8', type: 'db', specs: '2 vCPU · 8 GB · 100 GB', cost: 14.00, date: 'Il y a 8 jours', justification: 'Moteur de recherche produits', status: 'rejected', rejectReason: 'Budget insuffisant ce mois — réessayer en juillet.' },
  ]);

  myReqFilter = signal<string>('all');

  filteredMyRequests = computed(() => {
    const f = this.myReqFilter();
    return f === 'all' ? this.myRequests() : this.myRequests().filter(r => r.status === f);
  });

  pendingOwnCount = computed(() => this.myRequests().filter(r => r.status === 'pending').length);
  runningVmCount = computed(() => this.myVMs().filter(v => v.status === 'running').length);

  /* ── CATALOG ────────────────────────────────────── */
  catalogFilter = signal<string>('all');

  catalogTabs = signal([
    { key: 'all', label: 'Tout' },
    { key: 'vm', label: 'IaaS â€” VMs' },
    { key: 'db', label: 'PaaS â€” Bases de donnÃ©es' },
    { key: 'saas', label: 'SaaS â€” Applications' },
  ]);

  catalogItems = signal<CatalogItem[]>([
    { id: 'c1', name: 'VM Standard', desc: '2 vCPU · 4 GB RAM · 50 GB SSD. Idéale pour les environnements de développement et staging.', type: 'vm', price: 9.20, specs: ['2 vCPU', '4 GB RAM', '50 GB SSD'], bg: 'var(--blue-light)', color: 'var(--blue)' },
    { id: 'c2', name: 'VM Performance', desc: '4 vCPU · 8 GB RAM · 100 GB SSD. Conçue pour les charges de production backend.', type: 'vm', price: 18.50, specs: ['4 vCPU', '8 GB RAM', '100 GB SSD'], bg: 'var(--blue-light)', color: 'var(--blue)' },
    { id: 'c3', name: 'VM Pro', desc: '8 vCPU · 16 GB RAM · 200 GB SSD. Pour les applications critiques haute disponibilité.', type: 'vm', price: 36.00, specs: ['8 vCPU', '16 GB RAM', '200 GB'], bg: 'var(--blue-light)', color: 'var(--blue)' },
    { id: 'c4', name: 'PostgreSQL 16', desc: 'Base de données relationnelle managée avec sauvegardes automatiques et haute disponibilité.', type: 'db', price: 8.00, specs: ['1 vCPU', '4 GB RAM', '50 GB SSD'], bg: 'var(--teal-light)', color: 'var(--teal)' },
    { id: 'c5', name: 'MySQL 8.4', desc: 'Base de données open source managée, optimisée pour les applications web et e-commerce.', type: 'db', price: 7.50, specs: ['1 vCPU', '2 GB RAM', '30 GB SSD'], bg: 'var(--teal-light)', color: 'var(--teal)' },
    { id: 'c6', name: 'Redis 7', desc: 'Cache en mémoire ultra-rapide pour sessions, files de messages et rate limiting.', type: 'db', price: 4.50, specs: ['0.5 vCPU', '1 GB RAM', 'SSD'], bg: 'var(--red-light)', color: 'var(--red)' },
    { id: 'c7', name: 'MongoDB 7', desc: 'Base NoSQL orientée document, idéale pour les données flexibles et non structurées.', type: 'db', price: 9.00, specs: ['1 vCPU', '4 GB RAM', '60 GB'], bg: 'var(--green-light)', color: 'var(--green)' },
    { id: 'c8', name: 'Odoo ERP 17', desc: 'Suite ERP complète : CRM, comptabilité, RH, inventaire. Déploiement en un clic, souverain.', type: 'saas', price: 35.00, specs: ['4 vCPU', '8 GB', '500 GB'], bg: 'var(--purple-light)', color: 'var(--purple)' },
    { id: 'c9', name: 'Nextcloud', desc: 'Espace collaboratif souverain : fichiers partagés, agenda d\'équipe, visioconférence intégrée.', type: 'saas', price: 12.00, specs: ['2 vCPU', '4 GB', '200 GB'], bg: 'var(--blue-light)', color: 'var(--blue)' },
    { id: 'c10', name: 'GitLab CE', desc: 'Plateforme DevOps complète : CI/CD, dépôts Git, registre Docker et gestion de projets agiles.', type: 'saas', price: 18.00, specs: ['4 vCPU', '8 GB', '100 GB'], bg: 'var(--amber-light)', color: 'var(--amber)' },
    { id: 'c11', name: 'Mattermost', desc: 'Messagerie d\'équipe sécurisée et souveraine, alternative à Slack avec intégrations DevOps.', type: 'saas', price: 8.00, specs: ['2 vCPU', '4 GB', '50 GB'], bg: 'var(--teal-light)', color: 'var(--teal)' },
    { id: 'c12', name: 'Grafana Stack', desc: 'Monitoring et visualisation : Grafana + Prometheus + Loki pour surveiller vos applications.', type: 'saas', price: 14.00, specs: ['2 vCPU', '4 GB', '100 GB'], bg: 'var(--amber-light)', color: 'var(--amber)' },
  ]);

  /* ── PREFILL (resubmit flow) ────────────────────── */
  filteredCatalog = computed(() => {
    const f = this.catalogFilter();
    return f === 'all' ? this.catalogItems() : this.catalogItems().filter(i => i.type === f);
  });

  selectedService = signal<CatalogItem | null>(null);
  instanceName = '';
  justification = '';

  selectService(s: CatalogItem) { this.selectedService.set(s); }



  /* ── TOAST ───────────────────────────────────────── */
  toastMsg = signal<string>('');
  toastColor = signal<string>('var(--green)');
  isToastVisible = signal<boolean>(false);

  showToast(msg: string, color = 'var(--green)') {
    this.toastMsg.set(msg);
    this.toastColor.set(color);
    this.isToastVisible.set(true);
    setTimeout(() => this.isToastVisible.set(false), 3500);
  }

  /* ── HELPERS ─────────────────────────────────────── */
  getInitials(name: string): string {
    return (name || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  sparkData(base: number): number[] {
    return Array.from({ length: 14 }, () => {
      const jitter = Math.floor(Math.random() * 24) - 12;
      return Math.max(8, Math.min(95, base + jitter));
    });
  }

  /* ── VM ACTIONS ─────────────────────────────────── */
  setDate() {
    this.currentDate.set(new Date().toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }));
  }

  submitRequest() {
    const svc = this.selectedService();
    if (!svc) return;

    const name = this.instanceName.trim() || `${svc.type}-${Math.floor(Math.random() * 99 + 1).toString().padStart(2, '0')}`;

    const newReq: MyRequest = {
      id: 'r-' + Date.now(),
      name,
      type: svc.type,
      specs: svc.specs.join(' Â· '),
      cost: svc.price,
      date: 'Ã€ l\'instant',
      justification: this.justification.trim() || '(Aucune justification fournie)',
      status: 'pending',
    };

    this.myRequests.update(list => [newReq, ...list]);
    this.selectedService.set(null);
    this.instanceName = '';
    this.justification = '';
    this.setPage('my-requests');
    this.showToast(`Demande "${name}" soumise â€” en attente de validation`, 'var(--blue)');
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
    this.myVMs.update(list => list.map(vm => {
      if (vm.id !== id) return vm;
      return action === 'stop'
        ? { ...vm, status: 'stopped' as const, cpu: 0, ram: 0 }
        : { ...vm, status: 'running' as const, cpu: 20, ram: 30 };
    }));
    const vm = this.myVMs().find(v => v.id === id);
    const msg = action === 'stop' ? `${vm?.name} arrêtée` : `${vm?.name} démarrée`;
    this.showToast(msg, action === 'stop' ? 'var(--amber)' : 'var(--green)');
  }
  statusText(s: string) {
    return ({ pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté', suspended: 'Suspendu' } as any)[s] || s;
  }

  loadUserData() {
    this.http.get(`${environment.apiBaseUrl}/users/me`).subscribe({
      next: (data: any) => {
        this.actualUser.set(data);
      }
    });
  }
  updateProfile(data: any) {
    return this.http.patch(`${environment.apiBaseUrl}/users/update-profile`, data);
  }
  updatePassword(data: any) {
    return this.http.patch(`${environment.apiBaseUrl}/users/update-password`, data);
  }
}
