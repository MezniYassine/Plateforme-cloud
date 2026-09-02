import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface SupportTicket {
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
}

@Component({
  selector: 'app-support-contact-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './support-contact-modal.component.html',
  styleUrls: ['./support-contact-modal.component.scss'],
})
export class SupportContactModalComponent implements OnInit {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiBaseUrl.replace(/\/$/, '')}/tickets`;

  isOpen = signal<boolean>(false);
  activeTab = signal<'new' | 'list'>('new');
  isLoading = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  myTickets = signal<SupportTicket[]>([]);
  expandedTicketId = signal<number | null>(null);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  // Form Fields
  formSujet = '';
  formMessage = '';
  formCategorie: 'TECHNIQUE' | 'INFORMATION' | 'FACTURATION' | 'AUTRE' = 'TECHNIQUE';

  ngOnInit() {
    // Optionally prefetch ticket count
  }

  openModal(tab: 'new' | 'list' = 'new') {
    this.activeTab.set(tab);
    this.isOpen.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);
    this.loadMyTickets();
  }

  closeModal() {
    this.isOpen.set(false);
    this.successMessage.set(null);
    this.errorMessage.set(null);
  }

  setTab(tab: 'new' | 'list') {
    this.activeTab.set(tab);
    this.successMessage.set(null);
    this.errorMessage.set(null);
    if (tab === 'list') {
      this.loadMyTickets();
    }
  }

  loadMyTickets() {
    this.isLoading.set(true);
    this.http.get<SupportTicket[]>(`${this.apiUrl}/my`).subscribe({
      next: (tickets) => {
        this.myTickets.set(tickets || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Erreur chargement tickets:', err);
        this.isLoading.set(false);
      },
    });
  }

  submitTicket() {
    const rawSujet = (this.formSujet || '').trim();
    const rawMessage = (this.formMessage || '').trim();

    // Contrôles de validation sur les inputs
    if (!rawSujet) {
      this.errorMessage.set('Veuillez renseigner le sujet de votre demande.');
      return;
    }

    if (rawSujet.length < 3) {
      this.errorMessage.set('Le sujet doit comporter au moins 3 caractères.');
      return;
    }

    if (rawSujet.length > 150) {
      this.errorMessage.set('Le sujet ne peut pas dépasser 150 caractères.');
      return;
    }

    if (!rawMessage) {
      this.errorMessage.set('Veuillez rédiger un message détaillant votre demande.');
      return;
    }

    if (rawMessage.length < 10) {
      this.errorMessage.set('Le message doit comporter au moins 10 caractères explicatifs.');
      return;
    }

    if (rawMessage.length > 3000) {
      this.errorMessage.set('Le message ne peut pas dépasser 3000 caractères.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    // Sanitisation préventive
    const payload = {
      sujet: rawSujet.replace(/\0/g, ''),
      message: rawMessage.replace(/\0/g, ''),
      categorie: this.formCategorie,
    };

    this.http.post<SupportTicket>(this.apiUrl, payload).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.formSujet = '';
        this.formMessage = '';
        this.formCategorie = 'TECHNIQUE';
        this.successMessage.set('Votre demande a été transmise avec succès à l\'administrateur.');
        this.loadMyTickets();
        setTimeout(() => {
          this.activeTab.set('list');
        }, 1200);
      },
      error: (err) => {
        console.error('Erreur soumission ticket:', err);
        this.isSubmitting.set(false);
        const serverError = err?.error?.message;
        if (Array.isArray(serverError)) {
          this.errorMessage.set(serverError.join(', '));
        } else if (typeof serverError === 'string') {
          this.errorMessage.set(serverError);
        } else {
          this.errorMessage.set('Une erreur est survenue lors de l\'envoi de votre demande.');
        }
      },
    });
  }

  toggleExpand(ticketId: number) {
    if (this.expandedTicketId() === ticketId) {
      this.expandedTicketId.set(null);
    } else {
      this.expandedTicketId.set(ticketId);
    }
  }

  getResolvedCount(): number {
    return this.myTickets().filter((t) => t.status === 'RESOLU' && !!t.reponseAdmin).length;
  }

  getOpenCount(): number {
    return this.myTickets().filter((t) => t.status === 'OUVERT' || t.status === 'EN_COURS').length;
  }
}
