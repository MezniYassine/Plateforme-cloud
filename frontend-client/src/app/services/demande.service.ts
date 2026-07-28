import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export type DemandeStatus = 'EN_ATTENTE' | 'APPROUVEE' | 'REJETEE';

export interface DemandeApiItem {
  id: number;
  nomInstanceSouhaite: string;
  status: DemandeStatus;
  justification: string;
  commentaireAdmin?: string;
  dateDemande: string;
  templateName?: string;
  versionPaas?: string;
  catalogue: {
    id: number;
    nomService: string;
    vcpu: number;
    ramMB: number;
    stockageGB: number;
    prix: number;
    typeService?: string;
    typeSgbd?: string;
  };
  client?: {
    id: number;
    nom: string;
    prenom: string;
    email: string;
  };
}

export interface CreateDemandePayload {
  nomInstanceSouhaite: string;
  justification: string;
  catalogueId: number;
  templateName?: string;
  versionPaas?: string;
}

export interface ReviewDemandePayload {
  status: 'APPROUVEE' | 'REJETEE';
  commentaireAdmin?: string;
}

@Injectable({ providedIn: 'root' })
export class DemandeService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl.replace(/\/$/, '');

  /** Utilisateur: soumettre une nouvelle demande */
  create(payload: CreateDemandePayload) {
    return this.http.post<DemandeApiItem>(`${this.base}/demande`, payload);
  }

  /** Utilisateur: charger ses propres demandes */
  getMyDemandes() {
    return this.http.get<DemandeApiItem[]>(`${this.base}/demande/mes-demandes`);
  }

  /** Admin: charger toutes les demandes de l'entreprise */
  getAdminDemandes() {
    return this.http.get<DemandeApiItem[]>(`${this.base}/demande/admin`);
  }

  /** Admin: approuver ou refuser une demande */
  review(id: number, payload: ReviewDemandePayload) {
    return this.http.patch<DemandeApiItem>(`${this.base}/demande/${id}/review`, payload);
  }
}
