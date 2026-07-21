import { Component, computed, signal, OnInit, OnDestroy, ViewEncapsulation, PLATFORM_ID, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { DashboardOverview } from './dashboard-overview/dashboard-overview';
import { Activity, Admin, DeployedResource, ResourceRequest, TeamMember, WalletTransaction } from './entreprise-helper.service';
import { RequestsPageComponent } from './components/requests-page/requests-page';
import { TeamPageComponent } from './components/team-page/team-page';
import { ResourcesPageComponent } from './components/resources-page/resources-page';
import { BillingPageComponent } from './components/billing-page/billing-page';

import { ProfilePageComponent } from './components/profile-page/profile-page';
import { isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DemandeService } from '../../services/demande.service';




/* ── COMPONENT ──────────────────────────────────────────────────────────── */
@Component({
  selector: 'app-enterprise-admin-dashboard',
  standalone: true,
  imports: [
    DashboardOverview,
    RequestsPageComponent,
    TeamPageComponent,
    ResourcesPageComponent,
    BillingPageComponent,

    ProfilePageComponent,
    ReactiveFormsModule
  ],
  templateUrl: './entreprise-admin-dashboard.html',
  styleUrl: './entreprise-admin-dashboard.scss',
  encapsulation: ViewEncapsulation.None
})
export class EntrepriseAdminDashboard implements OnInit, OnDestroy {
  /* NAVIGATION */
  activePage = signal<string>('dashboard');
  currentDate = signal<string>('');
  isBrowserAndReady = false;
  private platformId = inject(PLATFORM_ID);
  private pollInterval: any;

  readonly PAGE_TITLES: Record<string, string> = {
    dashboard: 'Vue d\'ensemble',
    requests: 'Demandes a valider',
    team: 'Mon equipe',
    resources: 'Ressources deployees',
    billing: 'Budget & Facturation',

    profile: 'Mon profil',
  };
  pageTitle = computed(() => this.PAGE_TITLES[this.activePage()] ?? 'Dashboard');
  setPage(p: string) { this.activePage.set(p); }

  /* COMPANY INFO */
  actualAdmin = signal<Admin | null>(null);
  teamMembers = signal<TeamMember[]>([]);

  adminName = computed(() => {
    const admin = this.actualAdmin();
    return admin ? `${admin.nom} ${admin.prenom}` : '';
  });
  adminNom = computed(() => this.actualAdmin()?.nom ?? '');
  adminPrenom = computed(() => this.actualAdmin()?.prenom ?? '');
  inviteForm!: FormGroup;
  adminEmail = computed(() => this.actualAdmin()?.email ?? '');
  companyName = computed(() => this.actualAdmin()?.entreprise?.nomEntreprise ?? '');
  companyTaxId = computed(() => this.actualAdmin()?.entreprise?.identifiantFiscal ?? '');

  /* WALLET & BUDGET */
  walletBalance = signal<number>(0);
  walletDevise = signal<string>('DT');
  monthlyBudget = signal<number>(0);
  monthlySpend = signal<number>(0);
  forecast = computed(() => Math.round(this.monthlySpend() * (30 / Math.max(new Date().getDate(), 1))));
  budgetUsedPct = computed(() => this.monthlyBudget() > 0 ? Math.round((this.monthlySpend() / this.monthlyBudget()) * 100) : 0);

  /* RESOURCE REQUESTS */
  resourceRequests = signal<ResourceRequest[]>([]);
  reqFilter = signal<string>('all');

  filteredRequests = computed(() => {
    const f = this.reqFilter();
    return f === 'all' ? this.resourceRequests() : this.resourceRequests().filter(r => r.status === f);
  });

  pendingRequestsCount = computed(() => this.resourceRequests().filter(r => r.status === 'pending').length);

  activeResourcesCount = computed(() => this.deployedResources().length);
  teamSpend = computed(() => this.teamMembers().map(m => ({ name: m.name, spend: m.spend, color: m.color })));
  billingTeamSpend = signal<Array<Pick<TeamMember, 'name' | 'spend' | 'color'>>>([]);

  /* DEPLOYED RESOURCES */
  deployedResources = signal<DeployedResource[]>([]);
  resFilter = signal<string>('all');

  filteredResources = computed(() => {
    const f = this.resFilter();
    return f === 'all' ? this.deployedResources() : this.deployedResources().filter(r => r.type === f);
  });



  /* WALLET */
  walletTransactions = signal<WalletTransaction[]>([]);
  totalRecharge = signal<number>(0);

  walletSummary = computed(() => [
    { label: 'Solde actuel', val: `${this.formatMoney(this.walletBalance())} ${this.walletDevise()}`, color: 'var(--blue)' },
    { label: 'Depenses ce mois', val: `${this.formatMoney(this.monthlySpend())} ${this.walletDevise()}`, color: 'var(--red)' },
    { label: 'Budget disponible', val: `${this.formatMoney(this.monthlyBudget() - this.monthlySpend())} ${this.walletDevise()}`, color: 'var(--green)' },
    { label: 'Prevision fin mois', val: `${this.formatMoney(this.forecast())} ${this.walletDevise()}`, color: 'var(--amber)' },
    { label: 'Total recharge', val: `${this.formatMoney(this.totalRecharge())} ${this.walletDevise()}`, color: undefined },
  ]);

  /* ── ACTIVITIES ───────────────────────────────────────────────────────── */
  activities = signal<Activity[]>([]);

  /* ── MODAL ──────────────────────────────────────────────────────────────── */
  showInviteModal = signal<boolean>(false);
  reviewAction = signal<'approve' | 'reject' | null>(null);
  reviewRequestId = signal<string | number | null>(null);
  reviewJustification = signal<string>('');
  reviewSubmitting = signal<boolean>(false);
  reviewRequest = computed(() => {
    const id = this.reviewRequestId();
    return id == null ? null : this.resourceRequests().find(r => r.id === id) ?? null;
  });

  /* ── TOAST ──────────────────────────────────────────────────────────────── */
  toastMsg = signal<string>('');
  toastColor = signal<string>('var(--green)');
  isToastVisible = signal<boolean>(false);
  /** true = toast persistant, ne disparaît pas automatiquement */
  toastPersistent = signal<boolean>(false);

  /* ── CONSTRUCTOR ─────────────────────────────────────────────────────────── */
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
    this.loadOrgVms();
    this.loadBilling();

    // Auto-refresh requests and data every 4 seconds
    this.pollInterval = setInterval(() => {
      this.loadAdminDemandes();
      this.loadData();
      this.loadOrgVms();
      this.loadBilling();
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

  /* ── API ─────────────────────────────────────────────────────────────────── */
  loadData() {
    const url = `${environment.apiBaseUrl}/entreprise-admin/users`;
    this.http.get(url).subscribe({
      next: (data: any) => {
        this.teamMembers.set(data);
      }
    });
  }

  loadOrgVms() {
    const url = `${environment.apiBaseUrl}/entreprise-admin/org-vms`;
    this.http.get<DeployedResource[]>(url).subscribe({
      next: (vms) => {
        this.deployedResources.set(vms);
      },
      error: (err) => console.error('Erreur chargement VMs org', err)
    });
  }

  loadBilling() {
    const url = `${environment.apiBaseUrl}/entreprise-admin/billing`;
    this.http.get<{
      solde: number;
      devise: string;
      depenseMois: number;
      totalRecharge: number;
      teamSpend: Array<Pick<TeamMember, 'name' | 'spend' | 'color'>>;
      transactions: WalletTransaction[];
    }>(url).subscribe({
      next: (data) => {
        const solde = Number(data.solde ?? 0);
        this.walletBalance.set(solde);
        this.walletDevise.set(data.devise ?? 'DT');
        this.monthlyBudget.set(solde);
        this.monthlySpend.set(Number(data.depenseMois ?? 0));
        this.totalRecharge.set(Number(data.totalRecharge ?? 0));
        this.billingTeamSpend.set(data.teamSpend ?? []);
        this.walletTransactions.set((data.transactions ?? []).map(t => ({
          ...t,
          amount: Number(t.amount ?? 0),
          date: this.formatDateTime(t.date),
        })));
      },
      error: (err) => console.error('Erreur chargement billing entreprise', err),
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
    if (this.inviteForm.invalid) return;

    this.http.post(`${environment.apiBaseUrl}/entreprise-admin/inviter-collaborateur`, this.inviteForm.value).subscribe({
      next: (res: any) => {
        this.showToast(res.message, 'var(--green)');
        this.showInviteModal.set(false);
        this.inviteForm.reset();
      },
      error: (err) => {
        this.showToast(err.error.message, 'var(--red)');
      }
    });
  }

  approveRequest(id: string | number) {
    // Ouvre uniquement le modal de confirmation.
    // L'appel API est déclenché par le bouton "Confirmer" dans le modal (confirmReview -> performApproveRequest).
    this.openReviewModal('approve', id);
  }

  rejectRequest(id: string | number) {
    // Ouvre uniquement le modal de confirmation.
    // L'appel API est déclenché par le bouton "Confirmer" dans le modal (confirmReview -> performRejectRequest).
    this.openReviewModal('reject', id);
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

    // 1. Fermeture IMMÉDIATE du modal — l'utilisateur peut continuer à naviguer
    this.reviewAction.set(null);
    this.reviewRequestId.set(null);
    this.reviewJustification.set('');

    // 2. Toast persistant « Provisionnement en cours » — ne disparaît pas automatiquement
    this.showToast(`⏳ Provisionnement de « ${req.name} » en cours...`, 'var(--blue)', 0);

    // 3. Appel API en arrière-plan — le provisionnement VMware peut durer 30-60 s
    this.http.patch(`${environment.apiBaseUrl}/demande/${id}/approuver`, body).subscribe({
      next: (response: any) => {
        this.loadBilling();
        this.resourceRequests.update(list =>
          list.map(r => r.id === id ? { ...r, status: 'approved', commentaireAdmin } : r)
        );
        this.pushActivity('approve', req.name);
        // Remplace le toast persistant par un toast de succès (4 s)
        this.showToast(`✅ ${req.name} déployé avec succès sur VMware`, 'var(--green)', 4000);
      },
      error: (err) => {
        console.error('Erreur de déploiement :', err);
        this.resourceRequests.update(list =>
          list.map(r => r.id === id ? { ...r, status: 'rejected', commentaireAdmin } : r)
        );
        // Remplace le toast persistant par un toast d'erreur (5 s)
        this.showToast(`❌ Échec : ${err.error?.message || 'Erreur ESXi'}`, 'var(--red)', 5000);
      }
    });
  }

  private performRejectRequest(req: ResourceRequest, commentaireAdmin: string) {
    const id = req.id;
    const body = { commentaireAdmin };

    // Fermeture immédiate du modal
    this.reviewAction.set(null);
    this.reviewRequestId.set(null);
    this.reviewJustification.set('');

    this.http.patch(`${environment.apiBaseUrl}/demande/${id}/rejeter`, body).subscribe({
      next: () => {
        this.resourceRequests.update(list =>
          list.map(r => r.id === id ? { ...r, status: 'rejected', commentaireAdmin } : r)
        );

        this.pushActivity('reject', req.name);
        this.showToast(`${req.name} — demande rejetée`, 'var(--red)');
      },
      error: (err) => {
        console.error('Erreur lors du rejet :', err);
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
        this.showToast(`${m.name} — ${newState ? 'compte réactivé' : 'compte suspendu'}`, newState ? 'var(--green)' : '#64748b');
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
    this.http.post(environment.apiBaseUrl + '/wallet/recharger', {}).subscribe({
      next: () => {
        this.loadBilling();
        this.showToast('Portefeuille recharge', 'var(--green)');
      },
      error: (err) => {
        console.error('Erreur recharge wallet', err);
        this.showToast(err?.error?.message ?? 'Impossible de recharger le wallet', 'var(--red)');
      },
    });
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

  /* ── HELPERS ─────────────────────────────────────────────────────────────── */
  setDate() {
    this.currentDate.set(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  }

  formatMoney(value: number): string {
    return Number(value ?? 0).toFixed(3);
  }

  formatDateTime(value: string): string {
    if (!value) return '';
    return new Date(value).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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

  private _toastTimer: any = null;

  /**
   * Affiche un toast.
   * @param msg      Message à afficher
   * @param color    Couleur CSS (variable ou valeur directe)
   * @param duration Durée en ms avant disparition automatique.
   *                 Passer 0 pour un toast persistant (restera jusqu'au prochain showToast()).
   */
  showToast(msg: string, color = 'var(--green)', duration = 3500) {
    // Annule le timer précédent si un toast est déjà affiché
    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    this.toastMsg.set(msg);
    this.toastColor.set(color);
    this.toastPersistent.set(duration === 0);
    this.isToastVisible.set(true);

    if (duration > 0) {
      this._toastTimer = setTimeout(() => {
        this.isToastVisible.set(false);
        this.toastPersistent.set(false);
        this._toastTimer = null;
      }, duration);
    }
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
