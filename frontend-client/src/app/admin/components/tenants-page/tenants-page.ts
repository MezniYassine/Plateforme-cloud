import { Component, input, output, signal, computed } from '@angular/core';
import { DashboardHelperService, Tenant } from '../../dashboard-helper.service';

@Component({
  selector: 'app-tenants-page',
  standalone: true,
  imports: [],
  templateUrl: './tenants-page.html',
})
export class TenantsPageComponent {
  tenants = input.required<Tenant[]>();
  activePage = input.required<string>();

  openModal = output<string>();
  quickAction = output<{ id: string; status: Tenant['status'] }>();

  expandedRows = signal<Set<string>>(new Set());

  toggleRow(id: string) {
    const current = new Set(this.expandedRows());
    if (current.has(id)) current.delete(id);
    else current.add(id);
    this.expandedRows.set(current);
  }

  currentTypeFilter = signal<Tenant['accountType'] | 'all'>('all');
  currentSearch = signal<string>('');

  filteredTenants = computed(() => {
    const typeFilter = this.currentTypeFilter();
    const search = this.currentSearch().toLowerCase();
    return this.tenants().filter(t => {
      const matchPage = this.activePage() === 'inscriptions'
        ? t.status === 'pending'
        : t.status === 'approved';
      const matchType = typeFilter === 'all' || t.accountType === typeFilter;
      const matchSearch = !search || t.company.toLowerCase().includes(search) || t.email.toLowerCase().includes(search) || `${t.firstName} ${t.lastName}`.toLowerCase().includes(search);
      return matchPage && matchType && matchSearch;
    });
  });

  constructor(public h: DashboardHelperService) { }

  filterType(type: Tenant['accountType'] | 'all') { this.currentTypeFilter.set(type); }
  filterTable(event: Event) { this.currentSearch.set((event.target as HTMLInputElement).value); }

  onQuickAction(id: string, status: Tenant['status']) {
    this.quickAction.emit({ id, status });
  }

  exportCsv() {
    const rows = this.filteredTenants();
    const header = 'Compte;Type;Email;ID Fiscal;Date Inscription;MFA;SSO;Statut';
    const lines = rows.map(r => {
      const type = r.accountType === 'personnel' ? 'Personnel' : 'Entreprise';
      const mfa = r.mfaStatus === 'ACTIVE' ? 'Actif' : 'Inactif';
      const sso = r.providers?.length ? r.providers.join(' | ') : 'Aucun';
      const status = this.h.getBadgeLabel(r.status);
      return `"${r.company}";"${type}";"${r.email}";"${r.taxId}";"${this.h.formatDate(r.registered)}";"${mfa}";"${sso}";"${status}"`;
    });
    
    const csv = '\uFEFF' + [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `locataires-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
