import { Injectable } from "@angular/core";

export interface ResourceRequest {
    id: string; name: string; type: 'vm' | 'db' | 'saas';
    user: string; specs: string; cost: number; date: string;
    justification: string;
    commentaireAdmin?: string;
    status: 'pending' | 'approved' | 'rejected';
    isProvisioning?: boolean;
}
export interface Admin {
    id: string; email: string; nom: string; prenom: string;
    telephone?: string | null;
    mfaStatus?: string;
    entreprise?: {
        nomEntreprise: string;
        identifiantFiscal: string;
        tailleEntreprise?: string | null;
        telephone?: string | null;
    };
}

export interface TeamMember {
    id: string; name: string; email: string; color: string;
    active: boolean; vms: number; services: number; spend: number;
    telephone?: string | null;
    mfaStatus?: string;
    isEmailVerified?: boolean;
    dateInscrit?: string;
    prenom?: string;
    nom?: string;
    status?: string;
}

export interface DeployedResource {
    id: string;
    realId?: number;
    name: string;
    type: 'vm' | 'db' | 'saas';
    owner: string;
    ownerId?: number;
    specs: string;
    cost: number;
    ip?: string;
    url?: string;
    connectionString?: string;
    dbUser?: string;
    dbPassword?: string;
    typeSgbd?: string;
    appType?: string;
    adminEmail?: string;
    adminPassword?: string;
    os?: string;
    cpu?: number;
    ram?: number;
    storage?: number;
    status?: string;
    statusLabel?: string;
    ownerColor?: string;
    dateCreation?: string | Date;
}

export interface WalletTransaction {
    id: string;
    refFacture?: string;
    desc: string;
    date: string;
    rawDate?: string;
    type: 'credit' | 'debit';
    amount: number;
    memberName?: string;
    catalogName?: string;
    typeService?: string;
    catalogue?: {
        id?: number;
        nomService?: string;
        typeService?: string;
        vcpu?: number;
        ramMB?: number;
        stockageGB?: number;
        prix?: number;
    } | null;
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