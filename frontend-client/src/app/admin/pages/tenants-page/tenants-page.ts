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
}
