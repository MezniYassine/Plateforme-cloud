import { Injectable } from '@angular/core';

export interface Tenant {
  id: string; company: string; email: string;
  firstName: string; lastName: string; taxId: string;
  createdAt: string; registered: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  vms: number; tenantId: string;
}

export interface Admin {
  id: string; email: string; nom: string; prenom: string;
}

export interface Activity {
  type: string; msg: string; time: string; color: string; bg: string;
}

@Injectable({ providedIn: 'root' })
export class DashboardHelperService {
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
