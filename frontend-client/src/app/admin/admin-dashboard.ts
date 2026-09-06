import { Component, computed, signal, OnInit, OnDestroy, ViewEncapsulation, inject, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Tenant, Activity, Admin } from './dashboard-helper.service';
import { DashboardOverviewComponent } from './components/dashboard-overview/dashboard-overview';
import { TenantsPageComponent } from './components/tenants-page/tenants-page';
import { EsxiPageComponent } from './components/esxi-page/esxi-page';
import { MonitoringPageComponent } from './components/monitoring-page/monitoring-page';
import { BillingPageComponent } from './components/billing-page/billing-page';
import { CataloguePageComponent } from './components/catalogue-page/catalogue-page';
import { ProfilePageComponent } from './components/profile-page/profile-page';
import { TicketsPageComponent } from './components/tickets-page/tickets-page';
import { isPlatformBrowser } from '@angular/common';
import { Sidebar } from './components/sidebar/sidebar';
import { Topbar } from './components/topbar/topbar';
import { AiChatViewComponent } from '../common/ai-chat-view/ai-chat-view.component';

/* · COMPONENT · */
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    DashboardOverviewComponent,
    TenantsPageComponent,
    EsxiPageComponent,
    MonitoringPageComponent,
    BillingPageComponent,
    CataloguePageComponent,
    ProfilePageComponent,
    TicketsPageComponent,
    AiChatViewComponent,
    Sidebar,
    Topbar
  ],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
  encapsulation: ViewEncapsulation.None
})
export class AdminDashboard implements OnInit, OnDestroy {

  /* · NAVIGATION · */
  activePage = signal<string>('dashboard');
  currentDate = signal<string>('');
  private platformId = inject(PLATFORM_ID);
  isBrowserAndReady = false;
  private pollInterval: any;

  readonly PAGE_TITLES: Record<string, string> = {
    dashboard: "Vue d'ensemble",
    tenants: 'Locataires',
    inscriptions: 'Inscriptions',
    esxi: 'Serveurs ESXi',
    monitoring: 'Monitoring Infrastructure',
    billing: 'Facturation',
    catalogue: 'Catalogue',
    tickets: 'Tickets & Support',
    profile: 'Mon profil',
    'ai-chat': 'Assistant IA',
  };

  pageTitle = computed(() => this.PAGE_TITLES[this.activePage()] ?? 'Dashboard');

  setPage(p: string) { this.activePage.set(p); }

  /* · TENANT DATA · */
  tenants = signal<Tenant[]>([]);
  actualAdmin = signal<Admin | null>(null);
  activities = signal<Activity[]>([]);
  selectedTenant = signal<Tenant | null>(null);
  enterpriseCount = signal<number>(0);
  activeDevCount = signal<number>(0);
  pendingCount = computed(() => this.tenants().filter(t => t.status === 'pending').length);
  tenantCount = computed(() => this.tenants().filter(t => t.status === 'approved').length);

  /* · INFRA METRICS · */
  infraMetrics = signal([
    { label: 'CPU global (ESXi)', val: '0%', pct: 0, color: 'blue' },
    { label: 'RAM globale', val: '0%', pct: 0, color: 'teal' },
    { label: 'Stockage (SAN)', val: '0%', pct: 0, color: 'amber' },
  ]);
  activeVmCount = signal<number>(0);
  openTicketsCount = signal<number>(0);

  /* · TOAST · */
  toastMsg = signal<string>('');
  toastColor = signal<string>('var(--green)');
  isToastVisible = signal<boolean>(false);

  /* · CONSTRUCTOR · */
  constructor(private router: Router, private http: HttpClient) {

  }

  ngOnInit() {
    this.setDate();

    if (isPlatformBrowser(this.platformId)) {
      this.isBrowserAndReady = true;
      this.loadTenants();
      this.loadCurrentAdmin();
      this.loadInfraMetrics();
      this.loadTicketStats();

      // Poll tenants list, infrastructure metrics and tickets every 4-6 seconds
      this.pollInterval = setInterval(() => {
        this.loadTenants();
        this.loadInfraMetrics();
        this.loadTicketStats();
      }, 5000);
    }
  }

  ngOnDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  loadTicketStats() {
    const url = `${environment.apiBaseUrl.replace(/\/$/, '')}/tickets/admin/stats`;
    this.http.get<any>(url).subscribe({
      next: (res) => {
        this.openTicketsCount.set(res?.ouvert || 0);
      },
      error: (err) => console.error('Erreur chargement ticket stats:', err),
    });
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
          if (m.label.includes('Stockage')) { m.val = `${data.storagePercent}%`; m.pct = Number(data.storagePercent) ?? m.pct; }
          return m;
        }));
      },
      error: (err) => console.warn('Failed to load infra metrics', err)
    });
  }

  /* · API · */
  loadTenants() {
    const url = `${environment.apiBaseUrl.replace(/\/$/, '')}/admin/clients`;
    this.http.get<any[]>(url).subscribe({
      next: (clients) => {
        this.enterpriseCount.set(clients.filter(c => c.role === 'ENTREPRISE_ADMIN' && c.status === 'APPROVED').length);
        this.activeDevCount.set(clients.filter(c => c.role === 'PERSONNEL' && c.status === 'APPROVED').length);

        const relevant = clients.filter(c => c.role === 'ENTREPRISE_ADMIN' || c.role === 'PERSONNEL');
        this.tenants.set(relevant.map(c => {
          const subUsers = c.role === 'ENTREPRISE_ADMIN' && c.entreprise
            ? clients.filter(sub => sub.role === 'ENTREPRISE_USER' && sub.entreprise?.id === c.entreprise.id)
            : [];

          const fullName = `${c.prenom || ''} ${c.nom || ''}`.trim();
          const displayName = c.entreprise?.nomEntreprise || (fullName ? fullName : (c.role === 'PERSONNEL' ? 'Particulier' : 'Inconnu'));

          return {
            id: `t${c.id}`,
            company: displayName,
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
            mfaStatus: c.mfaStatus || 'DESACTIVE',
            providers: c.providers || [],
            telephone: c.telephone || c.entreprise?.telephone || null,
            tailleEntreprise: c.entreprise?.tailleEntreprise || null,
            users: subUsers.map(sub => ({
              id: `t${sub.id}`,
              company: `${sub.prenom || ''} ${sub.nom || ''}`.trim() || 'Utilisateur',
              email: sub.email,
              firstName: sub.prenom,
              lastName: sub.nom,
              taxId: c.entreprise?.identifiantFiscal || '-',
              createdAt: sub.dateInscrit,
              registered: sub.dateInscrit,
              status: this.mapClientStatus(sub.status),
              accountType: 'entreprise',
              vms: 0,
              tenantId: `tenant-${sub.id}`,
              mfaStatus: sub.mfaStatus || 'DESACTIVE',
              providers: sub.providers || [],
              telephone: sub.telephone || null,
              tailleEntreprise: null,
            }))
          };
        }));

        const sorted = [...relevant].sort((a, b) => new Date(b.dateInscrit).getTime() - new Date(a.dateInscrit).getTime());
        this.activities.set(sorted.slice(0, 5).map(c => {
          const comp = c.entreprise?.nomEntreprise || 'Particulier';
          const typeStr = this.mapClientStatus(c.status) === 'pending' ? 'register' : c.status === 'APPROVED' ? 'approve' : 'reject';
          const msgs: Record<string, string> = { register: `<strong>${comp}</strong> - nouvelle inscription`, approve: `<strong>${comp}</strong> - compte approuvé`, reject: `<strong>${comp}</strong> - compte rejeté` };
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

  /* · TENANT ACTIONS · */
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

  /* · HELPERS · */
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
      msg: `<strong>${company}</strong> - compte ${labelMap[type] || type}`,
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