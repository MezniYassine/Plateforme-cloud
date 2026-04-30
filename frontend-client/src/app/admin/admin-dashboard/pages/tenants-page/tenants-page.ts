import { Component, input, output, signal, computed } from '@angular/core';
import { DashboardHelperService, Tenant } from '../../dashboard-helper.service';

@Component({
  selector: 'app-tenants-page',
  standalone: true,
  imports: [],
  templateUrl: './tenants-page.html',
})
export class TenantsPageComponent {
  tenants    = input.required<Tenant[]>();
  activePage = input.required<string>();

  openModal   = output<string>();
  quickAction = output<{ id: string; status: Tenant['status'] }>();

  currentFilter = signal<string>('all');
  currentSearch = signal<string>('');

  filteredTenants = computed(() => {
    const filter = this.currentFilter();
    const search = this.currentSearch().toLowerCase();
    return this.tenants().filter(t => {
      const matchStatus = filter === 'all' || t.status === filter;
      const matchSearch = !search || t.company.toLowerCase().includes(search) || t.email.toLowerCase().includes(search);
      return matchStatus && matchSearch;
    });
  });

  constructor(public h: DashboardHelperService) {}

  filterStatus(status: string) { this.currentFilter.set(status); }
  filterTable(event: Event) { this.currentSearch.set((event.target as HTMLInputElement).value); }
  showAllTenants() { this.filterStatus('all'); }

  onQuickAction(id: string, status: Tenant['status']) {
    this.quickAction.emit({ id, status });
  }
}
