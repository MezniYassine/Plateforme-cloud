import { Component, OnInit, signal, inject, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface AdminTicket {
  id: number;
  sujet: string;
  message: string;
  categorie: 'TECHNIQUE' | 'INFORMATION' | 'FACTURATION' | 'AUTRE';
  status: 'OUVERT' | 'EN_COURS' | 'RESOLU' | 'FERME';
  reponseAdmin?: string | null;
  dateCreation: string;
  dateReponse?: string | null;
  auteurNom: string;
  auteurEmail: string;
  auteurRole: string;
  entrepriseNom?: string | null;
  clientId?: number | null;
}

@Component({
  selector: 'app-tickets-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tickets-page.html',
  styleUrls: ['./tickets-page.scss'],
})
export class TicketsPageComponent implements OnInit {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiBaseUrl.replace(/\/$/, '')}/tickets`;

  @Output() ticketUpdated = new EventEmitter<void>();

  tickets = signal<AdminTicket[]>([]);
  isLoading = signal<boolean>(false);
  selectedStatus = signal<string>('ALL');
  searchQuery = signal<string>('');

  stats = signal<{
    total: number;
    ouvert: number;
    enCours: number;
    resolu: number;
    ferme: number;
  }>({ total: 0, ouvert: 0, enCours: 0, resolu: 0, ferme: 0 });

  // Modal de réponse
  activeTicket = signal<AdminTicket | null>(null);
  replyText = signal<string>('');
  replyStatus = signal<'OUVERT' | 'EN_COURS' | 'RESOLU' | 'FERME'>('RESOLU');
  isSaving = signal<boolean>(false);
  toastMessage = signal<string | null>(null);

  ngOnInit() {
    this.loadStats();
    this.loadTickets();
  }

  loadStats() {
    this.http.get<any>(`${this.apiUrl}/admin/stats`).subscribe({
      next: (res) => {
        if (res) {
          this.stats.set(res);
        }
      },
      error: (err) => console.error('Erreur chargement stats tickets:', err),
    });
  }

  loadTickets() {
    this.isLoading.set(true);
    let params: string[] = [];
    if (this.selectedStatus() && this.selectedStatus() !== 'ALL') {
      params.push(`status=${this.selectedStatus()}`);
    }
    if (this.searchQuery().trim()) {
      params.push(`search=${encodeURIComponent(this.searchQuery().trim())}`);
    }

    const qs = params.length > 0 ? `?${params.join('&')}` : '';
    this.http.get<AdminTicket[]>(`${this.apiUrl}/admin/all${qs}`).subscribe({
      next: (data) => {
        this.tickets.set(data || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erreur chargement tickets admin:', err);
        this.isLoading.set(false);
      },
    });
  }

  setStatusFilter(status: string) {
    this.selectedStatus.set(status);
    this.loadTickets();
  }

  onSearchChange() {
    this.loadTickets();
  }

  openReplyModal(ticket: AdminTicket) {
    this.activeTicket.set(ticket);
    this.replyText.set(ticket.reponseAdmin || '');
    this.replyStatus.set(ticket.status === 'OUVERT' ? 'RESOLU' : ticket.status);
  }

  closeReplyModal() {
    this.activeTicket.set(null);
    this.replyText.set('');
  }

  saveReply() {
    const ticket = this.activeTicket();
    if (!ticket) return;

    const rawReply = (this.replyText() || '').trim();
    if (rawReply.length > 4000) {
      this.showToast('La réponse ne peut pas dépasser 4000 caractères.', true);
      return;
    }

    this.isSaving.set(true);
    const payload = {
      reponseAdmin: rawReply.replace(/\0/g, ''),
      status: this.replyStatus(),
    };

    this.http.patch<AdminTicket>(`${this.apiUrl}/admin/${ticket.id}/reply`, payload).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.showToast(`Le ticket #${ticket.id} a été mis à jour avec succès.`);
        this.closeReplyModal();
        this.loadStats();
        this.loadTickets();
        this.ticketUpdated.emit();
      },
      error: (err) => {
        console.error('Erreur mise à jour ticket:', err);
        this.isSaving.set(false);
        const serverError = err?.error?.message;
        const msg = Array.isArray(serverError) ? serverError.join(', ') : serverError || 'Erreur lors de la mise à jour du ticket.';
        this.showToast(msg, true);
      },
    });
  }

  quickChangeStatus(ticket: AdminTicket, newStatus: 'OUVERT' | 'EN_COURS' | 'RESOLU' | 'FERME', event: Event) {
    event.stopPropagation();
    this.http.patch<AdminTicket>(`${this.apiUrl}/admin/${ticket.id}/reply`, { status: newStatus }).subscribe({
      next: () => {
        this.showToast(`Statut du ticket #${ticket.id} changé en ${newStatus}.`);
        this.loadStats();
        this.loadTickets();
        this.ticketUpdated.emit();
      },
      error: (err) => console.error('Erreur changement statut:', err),
    });
  }

  showToast(msg: string, isError = false) {
    this.toastMessage.set(msg);
    setTimeout(() => {
      this.toastMessage.set(null);
    }, 3500);
  }

  getRoleBadge(role: string): { label: string; class: string } {
    switch (role) {
      case 'ENTREPRISE_ADMIN':
        return { label: 'Admin Entreprise', class: 'badge-ent-admin' };
      case 'ENTREPRISE_USER':
        return { label: 'Collaborateur', class: 'badge-ent-user' };
      case 'PERSONNEL':
        return { label: 'Client Personnel', class: 'badge-personal' };
      default:
        return { label: role || 'Utilisateur', class: 'badge-default' };
    }
  }
}
