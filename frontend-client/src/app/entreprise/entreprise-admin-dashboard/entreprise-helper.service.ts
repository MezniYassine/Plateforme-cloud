import { Injectable } from "@angular/core";

export interface ResourceRequest {
    id: string; name: string; type: 'vm' | 'db' | 'saas';
    user: string; specs: string; cost: number; date: string;
    justification: string;
    commentaireAdmin?: string;
    status: 'pending' | 'approved' | 'rejected';
}
export interface Admin {
    id: string; email: string; nom: string; prenom: string;
    entreprise?: {
        nomEntreprise: string;
        identifiantFiscal: string;
    };
}

export interface TeamMember {
    id: string; name: string; email: string; color: string;
    active: boolean; vms: number; services: number; spend: number;
}

export interface DeployedResource {
    id: string; name: string; type: 'vm' | 'db' | 'saas';
    owner: string; specs: string; cost: number;
    ip?: string; url?: string; cpu?: number; ram?: number;
    status?: string;
    statusLabel?: string;
    ownerColor?: string;
}

export interface WalletTransaction {
    id: string; desc: string; date: string; type: 'credit' | 'debit'; amount: number; memberName?: string;
}

export interface Activity { type: string; msg: string; time: string; color: string; bg: string; }
@Injectable({ providedIn: 'root' })
export class EntrepriseDashboardHelperService {
    readonly COLORS = ['#1a56e8', '#7c3aed', '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#9333ea'];

    getInitials(name: string): string {
        return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    }

    colorFor(id: string): string {
        return this.COLORS[parseInt(id.replace(/\D/g, '')) % this.COLORS.length];
    }

    formatDate(d: string): string {
        return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    getBadgeLabel(s: string): string {
        return ({ pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté', suspended: 'Suspendu' } as Record<string, string>)[s] || s;
    }
}


