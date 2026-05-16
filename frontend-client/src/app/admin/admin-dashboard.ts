import { Component, computed, signal, OnInit, ViewEncapsulation, inject, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Tenant, Activity, Admin } from './dashboard-helper.service';
import { DashboardOverviewComponent } from './pages/dashboard-overview/dashboard-overview';
import { TenantsPageComponent } from './pages/tenants-page/tenants-page';
import { EsxiPageComponent } from './pages/esxi-page/esxi-page';
import { KubernetesPageComponent } from './pages/kubernetes-page/kubernetes-page';
import { MonitoringPageComponent } from './pages/monitoring-page/monitoring-page';
import { BillingPageComponent } from './pages/billing-page/billing-page';
import { IamPageComponent } from './pages/iam-page/iam-page';
import { CataloguePageComponent } from './pages/catalogue-page/catalogue-page';
import { ProfilePageComponent } from './pages/profile-page/profile-page';
import { isPlatformBrowser } from '@angular/common';
import { Sidebar } from './pages/sidebar/sidebar';
import { Topbar } from './pages/topbar/topbar';

/* ── COMPONENT ────────────────────────────────────── */
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    DashboardOverviewComponent,
    TenantsPageComponent,
    EsxiPageComponent,
    KubernetesPageComponent,
    MonitoringPageComponent,
    BillingPageComponent,
    IamPageComponent,
    CataloguePageComponent,
    ProfilePageComponent,
    Sidebar,
    Topbar,
  ],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
  encapsulation: ViewEncapsulation.None
})
export class AdminDashboard implements OnInit {

  /* ── NAVIGATION ──────────────────────────────────── */
  activePage = signal<string>('dashboard');
  currentDate = signal<string>('');
  private platformId = inject(PLATFORM_ID);
  isBrowserAndReady = false;

  readonly PAGE_TITLES: Record<string, string> = {
    dashboard: "Vue d'ensemble",
    tenants: 'Locataires',
    inscriptions: 'Inscriptions',
    esxi: 'Serveurs ESXi',
    kubernetes: 'Kubernetes',
    monitoring: 'Monitoring AIOps',
    billing: 'Facturation',
    iam: 'Sécurité & IAM',
    catalogue: 'Catalogue',
    profile: 'Mon profil',
  };

  pageTitle = computed(() => this.PAGE_TITLES[this.activePage()] ?? 'Dashboard');

  setPage(p: string) { this.activePage.set(p); }

  /* ── TENANT DATA ─────────────────────────────────── */
  tenants = signal<Tenant[]>([]);
  actualAdmin = signal<Admin | null>(null);
  activities = signal<Activity[]>([]);
  selectedTenant = signal<Tenant | null>(null);
  enterpriseCount = signal<number>(0);
  activeDevCount = signal<number>(0);
  pendingCount = computed(() => this.tenants().filter(t => t.status === 'pending').length);
  tenantCount = computed(() => this.tenants().filter(t => t.status === 'approved').length);

  /* ── INFRA METRICS ───────────────────────────────── */
  infraMetrics = signal([
    { label: 'CPU global (ESXi)', val: '72%', pct: 72, color: 'blue' },
    { label: 'RAM globale', val: '58%', pct: 58, color: 'teal' },
    { label: 'Stockage (SAN)', val: '41%', pct: 41, color: 'amber' },
    { label: 'Pods Kubernetes', val: '124 / 200', pct: 62, color: 'blue' },
  ]);
  activeVmCount = signal<number>(0);

  /* ── TOAST ───────────────────────────────────────── */
  toastMsg = signal<string>('');
  toastColor = signal<string>('var(--green)');
  isToastVisible = signal<boolean>(false);

  /* ── CONSTRUCTOR ─────────────────────────────────── */
  constructor(private router: Router, private http: HttpClient) {

  }

  ngOnInit() {
    this.setDate();

    if (isPlatformBrowser(this.platformId)) {
      this.isBrowserAndReady = true;
      this.loadTenants();
      this.loadCurrentAdmin();
      this.loadInfraMetrics();
    }
  }

  loadInfraMetrics() {
    const url = `${environment.apiBaseUrl.replace(/\/$/, '')}/esxi/host-stats`;
    this.http.get<any>(url).subscribe({
      next: (res) => {
        const data = res?.data ?? res;
        if (!data) return;
        this.activeVmCount.set(Number(data.vmsCount) || 0);
      this.infraMetrics.update(list => list.map(m => {
          if (m.label.includes('CPU')) { m.val = `${data.cpuPercent}%`; m.pct = Number(data.cpuPercent) ?? m.pct; }
          if (m.label.includes('RAM')) { m.val = `${data.ramPercent}%`; m.pct = Number(data.ramPercent) ?? m.pct; }
          return m;
        }));
      },
      error: (err) => console.warn('Failed to load infra metrics', err)
    });
  }

  /* ── API ─────────────────────────────────────────── */
  loadTenants() {
    const url = `${environment.apiBaseUrl.replace(/\/$/, '')}/admin/clients`;
    this.http.get<any[]>(url).subscribe({
      next: (clients) => {
        this.enterpriseCount.set(clients.filter(c => c.role === 'ENTREPRISE_ADMIN' && c.status === 'APPROVED').length);
        this.activeDevCount.set(clients.filter(c => c.role === 'ENTREPRISE_USER' || c.role === 'PERSONNEL').length);

        const relevant = clients.filter(c => c.role === 'ENTREPRISE_ADMIN' || c.role === 'PERSONNEL');
        this.tenants.set(relevant.map(c => ({
          id: `t${c.id}`,
          company: c.entreprise?.nomEntreprise || (c.role === 'PERSONNEL' ? 'Particulier' : 'Inconnu'),
          email: c.email,
          firstName: c.prenom,
          lastName: c.nom,
          taxId: c.entreprise?.identifiantFiscal || '-',
          createdAt: c.dateInscrit,
          registered: c.dateInscrit,
          status: this.mapClientStatus(c.status),
          accountType: c.role === 'PERSONNEL' ? 'personnel' : 'entreprise',
          vms: 0,
          tenantId: `tenant-${c.id}`,
        })));

        const sorted = [...relevant].sort((a, b) => new Date(b.dateInscrit).getTime() - new Date(a.dateInscrit).getTime());
        this.activities.set(sorted.slice(0, 5).map(c => {
          const comp = c.entreprise?.nomEntreprise || 'Particulier';
          const typeStr = this.mapClientStatus(c.status) === 'pending' ? 'register' : c.status === 'APPROVED' ? 'approve' : 'reject';
          const msgs: Record<string, string> = { register: `<strong>${comp}</strong> — nouvelle inscription`, approve: `<strong>${comp}</strong> — compte approuvé`, reject: `<strong>${comp}</strong> — compte rejeté` };
          const colors: Record<string, string> = { approve: 'var(--green)', register: 'var(--blue)', reject: 'var(--red)' };
          const bgs: Record<string, string> = { approve: 'var(--green-light)', register: 'var(--blue-light)', reject: 'var(--red-light)' };
          return { type: typeStr, msg: msgs[typeStr], time: new Date(c.dateInscrit).toLocaleDateString('fr-FR'), color: colors[typeStr] || 'var(--blue)', bg: bgs[typeStr] || 'var(--blue-light)' };
        }));
      },
      error: (err) => console.error('Failed to load tenants', err)
    });
  }
  loadCurrentAdmin() {
    const url = `${environment.apiBaseUrl.replace(/\/$/, '')}/admin/me`;
    this.http.get<any>(url).subscribe({
      next: (admin) => {
        this.actualAdmin.set(admin);
      },
      error: (err) => console.error('Failed to load current admin', err)
    });

  }

  /* ── TENANT ACTIONS ──────────────────────────────── */
  quickAction(id: string, newStatus: Tenant['status']) {
    const idx = this.tenants().findIndex(t => t.id === id);
    if (idx === -1) return;
    const t = this.tenants()[idx];
    const realId = id.replace('t', '');
    const map: Record<string, string> = { pending: 'PENDING_VALIDATION', approved: 'APPROVED', rejected: 'REJECTED', suspended: 'SUSPENDED' };
    const url = `${environment.apiBaseUrl.replace(/\/$/, '')}/admin/clients/${realId}/status`;

    this.http.patch(url, { status: map[newStatus] }).subscribe({
      next: () => {
        this.tenants.update(list => list.map((item, i) => i === idx ? { ...item, status: newStatus } : item));
        const msgs: Record<string, string> = { approved: `✓ ${t.company} approuvé`, rejected: `${t.company} rejeté`, suspended: `${t.company} suspendu` };
        const colors: Record<string, string> = { approved: 'var(--green)', rejected: 'var(--red)', suspended: '#64748b' };
        this.showToast(msgs[newStatus], colors[newStatus] || 'var(--green)');
        this.pushActivity(newStatus, t.company);
      },
      error: () => this.showToast('Erreur lors de la mise à jour.', 'var(--red)')
    });
  }

  handleQuickAction(event: { id: string; status: Tenant['status'] }) {
    this.quickAction(event.id, event.status);
  }

  openModal(id: string) { this.selectedTenant.set(this.tenants().find(t => t.id === id) ?? null); }
  closeModal() { this.selectedTenant.set(null); }
  onOverlayClick(e: MouseEvent) { if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.closeModal(); }
  modalAction(s: Tenant['status']) { const cur = this.selectedTenant(); if (cur) { this.quickAction(cur.id, s); this.closeModal(); } }

  /* ── HELPERS ─────────────────────────────────────── */
  setDate() {
    this.currentDate.set(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  }

  formatDate(d: string): string { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
  getBadgeLabel(s: string): string { return ({ pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté', suspended: 'Suspendu' } as Record<string, string>)[s] || s; }

  private mapClientStatus(status: string): Tenant['status'] {
    if (status === 'PENDING_VALIDATION' || status === 'PENDING_APPROVAL') return 'pending';
    if (status === 'APPROVED') return 'approved';
    if (status === 'SUSPENDED') return 'suspended';
    return 'rejected';
  }

  pushActivity(type: string, company: string) {
    const labelMap: Record<string, string> = { approved: 'approuvé', rejected: 'rejeté', suspended: 'suspendu' };
    this.activities.update(list => [{
      type: type === 'approved' ? 'approve' : 'reject',
      msg: `<strong>${company}</strong> — compte ${labelMap[type] || type}`,
      time: "À l'instant",
      color: type === 'approved' ? 'var(--green)' : 'var(--red)',
      bg: type === 'approved' ? 'var(--green-light)' : 'var(--red-light)',
    }, ...list]);
  }

  showToast(msg: string, color = 'var(--green)') {
    this.toastMsg.set(msg);
    this.toastColor.set(color);
    this.isToastVisible.set(true);
    setTimeout(() => this.isToastVisible.set(false), 3500);
  }
}
