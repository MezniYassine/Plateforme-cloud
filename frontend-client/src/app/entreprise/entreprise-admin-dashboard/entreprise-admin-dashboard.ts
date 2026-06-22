import { Component, computed, signal, OnInit, OnDestroy, ViewEncapsulation, PLATFORM_ID, inject } from '@angular/core';
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
import { DemandeService } from '../../services/demande.service';




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
export class EntrepriseAdminDashboard implements OnInit, OnDestroy {



  /* ── NAVIGATION ─────────────────────────────────── */
  activePage = signal<string>('dashboard');
  currentDate = signal<string>('');
  isBrowserAndReady = false;
  private platformId = inject(PLATFORM_ID);
  private pollInterval: any;


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
  monthlySpend = computed(() => {
    return this.resourceRequests()
      .filter(r => r.status === 'approved')
      .reduce((sum, r) => sum + r.cost, 0);
  });
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
  deployedResources = computed<DeployedResource[]>(() => {
    return this.resourceRequests()
      .filter(r => r.status === 'approved')
      .map(r => ({
        id: 'dep-' + r.id,
        name: r.name,
        type: r.type,
        owner: r.user,
        specs: r.specs,
        cost: r.cost,
      }));
  });

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
  reviewAction = signal<'approve' | 'reject' | null>(null);
  reviewRequestId = signal<string | number | null>(null);
  reviewJustification = signal<string>('');
  reviewSubmitting = signal<boolean>(false);
  reviewRequest = computed(() => {
    const id = this.reviewRequestId();
    return id == null ? null : this.resourceRequests().find(r => r.id === id) ?? null;
  });

  /* ── TOAST ───────────────────────────────────────── */
  toastMsg = signal<string>('');
  toastColor = signal<string>('var(--green)');
  isToastVisible = signal<boolean>(false);

  /* ── CONSTRUCTOR ─────────────────────────────────── */
  private demandeService = inject(DemandeService);

  constructor(private router: Router, private http: HttpClient, private fb: FormBuilder) { }

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.isBrowserAndReady = true;
    this.loadCurrentAdmin();
    this.setDate();
    this.loadData();
    this.loadAdminDemandes();

    // Auto-refresh requests and data every 4 seconds
    this.pollInterval = setInterval(() => {
      this.loadAdminDemandes();
      this.loadData();
    }, 4000);

    this.inviteForm = this.fb.group({
      prenom: ['', Validators.required],
      nom: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]]
    });
  }

  ngOnDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
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

  /** Charger toutes les demandes de l'entreprise depuis l'API */
  loadAdminDemandes() {
    this.demandeService.getAdminDemandes().subscribe({
      next: (demandes) => {
        const statusMap: Record<string, 'pending' | 'approved' | 'rejected'> = {
          EN_ATTENTE: 'pending', APPROUVEE: 'approved', REJETEE: 'rejected',
        };
        const mapped: ResourceRequest[] = demandes.map(d => {
          const cat = d.catalogue;
          const specs = cat ? `${cat.vcpu} vCPU - ${cat.ramMB} GB RAM - ${cat.stockageGB} GB SSD` : '';
          const user = d.client ? `${d.client.prenom} ${d.client.nom}` : 'Inconnu';
          return {
            id: String(d.id),
            name: d.nomInstanceSouhaite,
            type: 'vm' as 'vm' | 'db' | 'saas',
            user,
            specs,
            cost: cat ? Number(cat.prix) : 0,
            date: new Date(d.dateDemande).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
            justification: d.justification,
            commentaireAdmin: d.commentaireAdmin,
            status: statusMap[d.status] ?? 'pending',
          };
        });
        this.resourceRequests.set(mapped);
      },
      error: (err) => console.error('Erreur chargement demandes admin', err)
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

  approveRequest(id: string | number) {
    this.openReviewModal('approve', id);
    const req = this.resourceRequests().find(r => r.id === id)!;
    if (!req) return;

    // 1. NOTIFICATION IMMÉDIATE : On prévient que VMware travaille
    this.showToast(`⏳ Déploiement de ${req.name} en cours... Veuillez patienter.`, 'var(--blue)'); // Remplace par ta couleur d'info

    // (Optionnel mais recommandé) 2. On met à jour l'UI locale pour griser la ligne en attendant la réponse
    this.resourceRequests.update(list =>
      list.map(r => r.id === id ? { ...r, status: 'EN_COURS' as any } : r)
    );

    const body = { commentaireAdmin: "Validé et déployé depuis le dashboard." };

    this.http.patch(`${environment.apiBaseUrl}/demande/${id}/approuver`, body).subscribe({
      next: (response: any) => {
        this.walletBalance.update(b => +(b - req.cost).toFixed(2));
        this.resourceRequests.update(list =>
          list.map(r => r.id === id ? { ...r, status: 'approved' as any } : r)
        );
        this.pushActivity('approve', req.name);

        // On écrase l'ancien toast avec le message de succès
        this.showToast(`✓ ${req.name} déployé avec succès sur VMware !`, 'var(--green)');
      },
      error: (err) => {
        // ÉCHEC : On remet la demande en attente (ou rejetée) dans l'UI et on lance le Toast rouge.
        console.error("Erreur de déploiement :", err);

        this.resourceRequests.update(list =>
          list.map(r => r.id === id ? { ...r, status: 'REJETEE' as any } : r)
        );

        this.showToast(`❌ Échec : ${err.error?.message || 'Erreur ESXi'}`, 'var(--red)');
      }
    });
  }

  rejectRequest(id: string | number) {
    this.openReviewModal('reject', id);
    return;

    const req = this.resourceRequests().find(r => r.id === id)!;
    if (!req) return;

    // 1. Pour rejeter, le backend EXIGE une justification. 
    // On utilise un simple prompt() pour le test, tu pourras remplacer par un modal Angular plus tard.
    const motifRefus = window.prompt("Veuillez saisir le motif du refus :");

    // Si l'admin annule le prompt, on annule l'action
    if (!motifRefus) return;

    const body = { commentaireAdmin: motifRefus };

    // 2. Appel HTTP vers ton endpoint de rejet
    this.http.patch(`${environment.apiBaseUrl}/demande/${id}/rejeter`, body).subscribe({
      next: () => {
        // 3. EN CAS DE SUCCÈS : On met à jour l'UI
        this.resourceRequests.update(list =>
          list.map(r => r.id === id ? { ...r, status: 'REJETEE' as any } : r)
        );

        this.pushActivity('reject', req.name);
        this.showToast(`${req.name} — demande rejetée`, 'var(--red)');
      },
      error: (err) => {
        console.error("Erreur lors du rejet :", err);
        this.showToast(`❌ Erreur : ${err.error?.message || 'Erreur serveur'}`, 'var(--red)');
      }
    });
  }

  openReviewModal(action: 'approve' | 'reject', id: string | number) {
    const req = this.resourceRequests().find(r => r.id === id);
    if (!req) return;

    this.reviewAction.set(action);
    this.reviewRequestId.set(id);
    this.reviewJustification.set('');
  }

  closeReviewModal() {
    if (this.reviewSubmitting()) return;
    this.reviewAction.set(null);
    this.reviewRequestId.set(null);
    this.reviewJustification.set('');
  }

  onReviewOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
      this.closeReviewModal();
    }
  }

  confirmReview() {
    const req = this.reviewRequest();
    const action = this.reviewAction();
    const commentaireAdmin = this.reviewJustification().trim();

    if (!req || !action) return;

    if (!commentaireAdmin) {
      this.showToast('Veuillez saisir une justification admin', 'var(--amber)');
      return;
    }

    if (action === 'approve') {
      this.performApproveRequest(req, commentaireAdmin);
      return;
    }

    this.performRejectRequest(req, commentaireAdmin);
  }

  private performApproveRequest(req: ResourceRequest, commentaireAdmin: string) {
    const id = req.id;
    const body = { commentaireAdmin };

    this.reviewSubmitting.set(true);
    this.showToast(`Déploiement de ${req.name} en cours... Veuillez patienter.`, 'var(--blue)');

    this.http.patch(`${environment.apiBaseUrl}/demande/${id}/approuver`, body).subscribe({
      next: (response: any) => {
        this.walletBalance.update(b => +(b - req.cost).toFixed(2));

        this.resourceRequests.update(list =>
          list.map(r => r.id === id ? { ...r, status: 'approved', commentaireAdmin } : r)
        );
        this.pushActivity('approve', req.name);
        this.reviewSubmitting.set(false);
        this.closeReviewModal();
        this.showToast(`${req.name} déployé avec succès sur VMware`, 'var(--green)');
      },
      error: (err) => {
        console.error('Erreur de déploiement :', err);

        this.resourceRequests.update(list =>
          list.map(r => r.id === id ? { ...r, status: 'rejected', commentaireAdmin } : r)
        );

        this.reviewSubmitting.set(false);
        this.closeReviewModal();
        this.showToast(`Échec : ${err.error?.message || 'Erreur ESXi'}`, 'var(--red)');
      }
    });
  }

  private performRejectRequest(req: ResourceRequest, commentaireAdmin: string) {
    const id = req.id;
    const body = { commentaireAdmin };

    this.reviewSubmitting.set(true);

    this.http.patch(`${environment.apiBaseUrl}/demande/${id}/rejeter`, body).subscribe({
      next: () => {
        this.resourceRequests.update(list =>
          list.map(r => r.id === id ? { ...r, status: 'rejected', commentaireAdmin } : r)
        );

        this.pushActivity('reject', req.name);
        this.reviewSubmitting.set(false);
        this.closeReviewModal();
        this.showToast(`${req.name} — demande rejetée`, 'var(--red)');
      },
      error: (err) => {
        console.error('Erreur lors du rejet :', err);
        this.reviewSubmitting.set(false);
        this.showToast(`Erreur : ${err.error?.message || 'Erreur serveur'}`, 'var(--red)');
      }
    });
  }

  toggleMember(id: string) {
    const m = this.teamMembers().find(m => m.id === id);
    if (!m) return;
    const newState = !m.active;
    const statusStr = newState ? 'APPROVED' : 'SUSPENDED';

    this.http.patch(`${environment.apiBaseUrl}/users/${id}/status`, { status: statusStr }).subscribe({
      next: () => {
        this.teamMembers.update(list => list.map(item => item.id === id ? { ...item, active: newState } : item));
        this.showToast(`${m.name} � ${newState ? 'compte r�activ�' : 'compte suspendu'}`, newState ? 'var(--green)' : '#64748b');
      },
      error: (err) => {
        this.showToast('Erreur lors du changement de statut', 'var(--red)');
        console.error(err);
      }
    });
  }

  logout() {
    localStorage.removeItem('access_token');
    this.router.navigate(['/login']);
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


