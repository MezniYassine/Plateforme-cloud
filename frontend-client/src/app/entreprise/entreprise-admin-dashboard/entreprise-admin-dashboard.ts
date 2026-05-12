import { Component, computed, signal, OnInit, ViewEncapsulation, PLATFORM_ID, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { DashboardOverview } from './dashboard-overview/dashboard-overview';
import { Activity, Admin, DeployedResource, Invoice, ResourceRequest, TeamMember, WalletTransaction } from './entreprise-helper.service';
import { RequestsPageComponent } from './pages/requests-page/requests-page';
import { TeamPageComponent } from './pages/team-page/team-page';
import { ResourcesPageComponent } from './pages/resources-page/resources-page';
import { BillingPageComponent } from './pages/billing-page/billing-page';
import { WalletPageComponent } from './pages/wallet-page/wallet-page';
import { ProfilePageComponent } from './pages/profile-page/profile-page';
import { isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';




/* ── COMPONENT ──────────────────────────────────── */
@Component({
  selector: 'app-enterprise-admin-dashboard',
  standalone: true,
  imports: [
    DashboardOverview,
    RequestsPageComponent,
    TeamPageComponent,
    ResourcesPageComponent,
    BillingPageComponent,
    WalletPageComponent,
    ProfilePageComponent,
    ReactiveFormsModule
  ],
  templateUrl: './entreprise-admin-dashboard.html',
  styleUrl: './entreprise-admin-dashboard.scss',
  encapsulation: ViewEncapsulation.None
})
export class EntrepriseAdminDashboard implements OnInit {



  /* ── NAVIGATION ─────────────────────────────────── */
  activePage = signal<string>('dashboard');
  currentDate = signal<string>('');
  isBrowserAndReady = false;
  private platformId = inject(PLATFORM_ID);


  readonly PAGE_TITLES: Record<string, string> = {
    dashboard: 'Vue d\'ensemble',
    requests: 'Demandes à valider',
    team: 'Mon équipe',
    resources: 'Ressources déployées',
    billing: 'Budget & Facturation',
    wallet: 'Portefeuille',
    profile: 'Mon profil',
  };
  pageTitle = computed(() => this.PAGE_TITLES[this.activePage()] ?? 'Dashboard');
  setPage(p: string) { this.activePage.set(p); }

  /* ── COMPANY INFO ───────────────────────────────── */
  actualAdmin = signal<Admin | null>(null);
  teamMembers = signal<TeamMember[]>([]);

  adminName = computed(() => {
    const admin = this.actualAdmin();
    return admin ? `${admin.nom} ${admin.prenom}` : '';
  });
  inviteForm!: FormGroup;
  adminEmail = computed(() => this.actualAdmin()?.email ?? '');
  companyName = computed(() => this.actualAdmin()?.entreprise?.nomEntreprise ?? '');
  companyTaxId = computed(() => this.actualAdmin()?.entreprise?.identifiantFiscal ?? '');


  /* ── WALLET & BUDGET ────────────────────────────── */
  walletBalance = signal<number>(1240.50);
  monthlyBudget = signal<number>(500);
  monthlySpend = signal<number>(247);
  forecast = computed(() => Math.round(this.monthlySpend() * (30 / new Date().getDate())));
  budgetUsedPct = computed(() => Math.round((this.monthlySpend() / this.monthlyBudget()) * 100));

  /* ── RESOURCE REQUESTS ──────────────────────────── */
  resourceRequests = signal<ResourceRequest[]>([
    { id: 'r1', name: 'vm-prod-backend-01', type: 'vm', user: 'Anis Mrad', specs: '4 vCPU · 8 GB RAM · 100 GB SSD', cost: 18.50, date: 'Aujourd\'hui, 09h14', justification: 'Déploiement backend API v2 production', status: 'pending' },
    { id: 'r2', name: 'PostgreSQL 16 — db-prod-01', type: 'db', user: 'Sarra Ben Salah', specs: '4 GB RAM · 50 GB SSD', cost: 8.00, date: 'Aujourd\'hui, 08h32', justification: 'Base de données pour nouveau module CRM', status: 'pending' },
    { id: 'r3', name: 'Odoo ERP 17 — odoo-main', type: 'saas', user: 'Anis Mrad', specs: '4 vCPU · 8 GB · 500 GB', cost: 35.00, date: 'Hier, 16h45', justification: 'Suite ERP pour la gestion des ventes', status: 'pending' },
    { id: 'r4', name: 'vm-dev-staging-02', type: 'vm', user: 'Khalil Azizi', specs: '2 vCPU · 4 GB RAM · 50 GB SSD', cost: 9.20, date: 'Hier, 11h20', justification: 'Environnement de staging pour les tests', status: 'approved' },
    { id: 'r5', name: 'Redis 7 — cache-01', type: 'db', user: 'Sarra Ben Salah', specs: '1 GB RAM · SSD', cost: 4.50, date: 'Il y a 3 jours', justification: 'Cache sessions utilisateurs', status: 'rejected' },
  ]);

  reqFilter = signal<string>('all');

  filteredRequests = computed(() => {
    const f = this.reqFilter();
    return f === 'all' ? this.resourceRequests() : this.resourceRequests().filter(r => r.status === f);
  });

  pendingRequestsCount = computed(() => this.resourceRequests().filter(r => r.status === 'pending').length);

  activeResourcesCount = computed(() => this.deployedResources().length);
  teamSpend = computed(() => this.teamMembers().map(m => ({ name: m.name, spend: m.spend, color: m.color })));

  /* ── DEPLOYED RESOURCES ─────────────────────────── */
  deployedResources = signal<DeployedResource[]>([
    { id: 'd1', name: 'vm-prod-backend-01', type: 'vm', owner: 'Anis Mrad', specs: '4 vCPU · 8 GB RAM', cost: 18.50, ip: '10.0.1.10', cpu: 62, ram: 74 },
    { id: 'd2', name: 'vm-dev-staging-02', type: 'vm', owner: 'Khalil Azizi', specs: '2 vCPU · 4 GB RAM', cost: 9.20, ip: '10.0.1.11', cpu: 28, ram: 41 },
    { id: 'd3', name: 'PostgreSQL 16', type: 'db', owner: 'Sarra Ben Salah', specs: '4 GB RAM · 50 GB', cost: 8.00, url: 'db.prod-01:5432' },
    { id: 'd4', name: 'Redis 7', type: 'db', owner: 'Sarra Ben Salah', specs: '1 GB RAM', cost: 4.50, url: 'cache-01:6379' },
    { id: 'd5', name: 'Nextcloud', type: 'saas', owner: 'Anis Mrad', specs: '2 vCPU · 4 GB', cost: 12.00, url: 'cloud.acme.com' },
  ]);

  resFilter = signal<string>('all');

  filteredResources = computed(() => {
    const f = this.resFilter();
    return f === 'all' ? this.deployedResources() : this.deployedResources().filter(r => r.type === f);
  });

  /* ── BILLING ────────────────────────────────────── */
  invoices = signal<Invoice[]>([
    { id: 'i1', period: 'Juin 2025', ref: 'INV-2025-006-ACM', amount: 247, paid: false },
    { id: 'i2', period: 'Mai 2025', ref: 'INV-2025-005-ACM', amount: 198, paid: true },
    { id: 'i3', period: 'Avr 2025', ref: 'INV-2025-004-ACM', amount: 175, paid: true },
    { id: 'i4', period: 'Mar 2025', ref: 'INV-2025-003-ACM', amount: 160, paid: true },
  ]);

  budgetAlerts = signal([
    { label: 'Alerte 80% budget', desc: 'Notification quand 80% est atteint', enabled: true },
    { label: 'Alerte 100% budget', desc: 'Notification quand le budget est épuisé', enabled: true },
    { label: 'Rapport hebdomadaire', desc: 'Résumé des dépenses chaque lundi matin', enabled: false },
    { label: 'Prévision dépassement', desc: 'Alerte si la prévision dépasse le budget', enabled: true },
  ]);

  /* ── WALLET ─────────────────────────────────────── */
  walletTransactions = signal<WalletTransaction[]>([
    { id: 'w1', desc: 'Paiement facture Mai 2025', date: '01 juin 2025', type: 'debit', amount: 198 },
    { id: 'w2', desc: 'Recharge portefeuille', date: '28 mai 2025', type: 'credit', amount: 500 },
    { id: 'w3', desc: 'Déploiement vm-prod-backend', date: '15 mai 2025', type: 'debit', amount: 18.50 },
    { id: 'w4', desc: 'Déploiement PostgreSQL 16', date: '12 mai 2025', type: 'debit', amount: 8.00 },
    { id: 'w5', desc: 'Recharge portefeuille', date: '01 mai 2025', type: 'credit', amount: 1000 },
  ]);

  walletSummary = computed(() => [
    { label: 'Solde actuel', val: `${this.walletBalance()} DT`, color: 'var(--blue)' },
    { label: 'Dépenses ce mois', val: `${this.monthlySpend()} DT`, color: 'var(--red)' },
    { label: 'Budget disponible', val: `${this.monthlyBudget() - this.monthlySpend()} DT`, color: 'var(--green)' },
    { label: 'Prévision fin mois', val: `${this.forecast()} DT`, color: 'var(--amber)' },
    { label: 'Total rechargé', val: '1 500 DT', color: undefined },
  ]);

  /* ── ACTIVITIES ─────────────────────────────────── */
  activities = signal<Activity[]>([
    { type: 'approve', msg: '<strong>vm-dev-staging-02</strong> — demande approuvée', time: 'Hier, 11h25', color: 'var(--green)', bg: 'var(--green-light)' },
    { type: 'reject', msg: '<strong>Redis 7</strong> — demande rejetée (budget)', time: 'Il y a 3j', color: 'var(--red)', bg: 'var(--red-light)' },
    { type: 'request', msg: '<strong>Anis Mrad</strong> — nouvelle demande VM', time: 'Aujourd\'hui', color: 'var(--blue)', bg: 'var(--blue-light)' },
    { type: 'member', msg: '<strong>Ines Gharbi</strong> — compte suspendu', time: 'Il y a 5j', color: 'var(--amber)', bg: 'var(--amber-light)' },
    { type: 'approve', msg: '<strong>Nextcloud</strong> — déploiement validé et actif', time: 'Il y a 7j', color: 'var(--green)', bg: 'var(--green-light)' },
  ]);



  /* ── MODAL ───────────────────────────────────────── */
  showInviteModal = signal<boolean>(false);

  /* ── TOAST ───────────────────────────────────────── */
  toastMsg = signal<string>('');
  toastColor = signal<string>('var(--green)');
  isToastVisible = signal<boolean>(false);

  /* ── CONSTRUCTOR ─────────────────────────────────── */
  constructor(private router: Router, private http: HttpClient, private fb: FormBuilder) { }

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.isBrowserAndReady = true;
    this.loadCurrentAdmin()
    this.setDate();
    this.loadData();
    this.inviteForm = this.fb.group({
      prenom: ['', Validators.required],
      nom: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]]
    });
  }

  /* ── API ─────────────────────────────────────────── */
  loadData() {
    const url = `${environment.apiBaseUrl}/entreprise-admin/users`;
    this.http.get(url).subscribe({
      next: (data: any) => {
        this.teamMembers.set(data);
      }
    });
  }

  inviterCollaborateur() {
    if (this.inviteForm.invalid) return; // Sécurité supplémentaire

    // call api invite
    this.http.post(`${environment.apiBaseUrl}/entreprise-admin/inviter-collaborateur`, this.inviteForm.value).subscribe({
      next: (res: any) => {
        this.showToast(res.message, 'var(--green)');
        this.showInviteModal.set(false);
        this.inviteForm.reset(); // Remet le formulaire à zéro pour la prochaine fois
      },
      error: (err) => {
        this.showToast(err.error.message, 'var(--red)');
      }
    });
  }

  /* ── ACTIONS ─────────────────────────────────────── */
  approveRequest(id: string) {
    const req = this.resourceRequests().find(r => r.id === id);
    if (!req) return;

    // Backend call: POST /enterprise/requests/:id/approve
    // This triggers payment deduction + provisioning
    this.walletBalance.update(b => +(b - req.cost).toFixed(2));
    this.monthlySpend.update(s => s + req.cost);

    this.resourceRequests.update(list =>
      list.map(r => r.id === id ? { ...r, status: 'approved' as const } : r)
    );

    // Add to deployed resources
    this.deployedResources.update(list => [...list, {
      id: 'dep-' + id, name: req.name, type: req.type,
      owner: req.user, specs: req.specs, cost: req.cost,
      ip: req.type === 'vm' ? '10.0.1.' + Math.floor(Math.random() * 99 + 10) : undefined,
    }]);

    this.pushActivity('approve', req.name);
    this.showToast(`✓ ${req.name} approuvé — déploiement lancé`, 'var(--green)');
  }

  rejectRequest(id: string) {
    const req = this.resourceRequests().find(r => r.id === id);
    if (!req) return;

    this.resourceRequests.update(list =>
      list.map(r => r.id === id ? { ...r, status: 'rejected' as const } : r)
    );

    this.pushActivity('reject', req.name);
    this.showToast(`${req.name} — demande rejetée`, 'var(--red)');
  }

  toggleMember(id: string) {
    const m = this.teamMembers().find(m => m.id === id);
    if (!m) return;
    const newState = !m.active;
    this.teamMembers.update(list => list.map(item => item.id === id ? { ...item, active: newState } : item));
    this.showToast(`${m.name} — ${newState ? 'compte réactivé' : 'compte suspendu'}`, newState ? 'var(--green)' : '#64748b');
  }

  rechargeWallet() {
    this.walletBalance.update(b => +(b + 500).toFixed(2));
    this.walletTransactions.update(list => [{
      id: 'w-' + Date.now(), desc: 'Recharge portefeuille', date: 'Aujourd\'hui', type: 'credit', amount: 500,
    }, ...list]);
    this.showToast('Portefeuille rechargé de 500 DT', 'var(--green)');
  }

  openInviteModal() { this.showInviteModal.set(true); }

  sendInvite() {
    this.showInviteModal.set(false);
    this.showToast('Invitation envoyée par email', 'var(--blue)');
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
      this.showInviteModal.set(false);
    }
  }

  /* ── HELPERS ─────────────────────────────────────── */
  setDate() {
    this.currentDate.set(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  }

  getInitials(name: string): string {
    return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  serviceColor(type: 'vm' | 'db' | 'saas'): { color: string; bg: string } {
    const map = {
      vm: { color: 'var(--blue)', bg: 'var(--blue-light)' },
      db: { color: 'var(--teal)', bg: 'var(--teal-light)' },
      saas: { color: 'var(--purple)', bg: 'var(--purple-light)' },
    };
    return map[type] ?? map.vm;
  }

  memberColor(name: string): string {
    const m = this.teamMembers().find(m => m.name === name);
    return m?.color ?? '#94a3b8';
  }

  pushActivity(type: string, name: string) {
    const map: Record<string, { msg: string; color: string; bg: string }> = {
      approve: { msg: `<strong>${name}</strong> — approuvé et déployé`, color: 'var(--green)', bg: 'var(--green-light)' },
      reject: { msg: `<strong>${name}</strong> — demande rejetée`, color: 'var(--red)', bg: 'var(--red-light)' },
      request: { msg: `Nouvelle demande : <strong>${name}</strong>`, color: 'var(--blue)', bg: 'var(--blue-light)' },
    };
    const entry = map[type];
    if (!entry) return;
    this.activities.update(list => [{ type, ...entry, time: "À l'instant" }, ...list]);
  }

  showToast(msg: string, color = 'var(--green)') {
    this.toastMsg.set(msg);
    this.toastColor.set(color);
    this.isToastVisible.set(true);
    setTimeout(() => this.isToastVisible.set(false), 3500);
  }
  loadCurrentAdmin() {
    const url = `${environment.apiBaseUrl.replace(/\/$/, '')}/entreprise-admin/me`;
    this.http.get<any>(url).subscribe({
      next: (admin) => {
        this.actualAdmin.set(admin);
      },
      error: (err) => console.error('Failed to load current admin', err)
    });

  }
}
