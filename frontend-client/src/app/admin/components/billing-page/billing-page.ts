import { Component, signal, computed, OnInit, inject, Output, EventEmitter } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface BillingTransaction {
  name: string;
  catalogName: string | null;
  typeService: 'IAAS' | 'PAAS';
  price: number;
  status: string;
  date: string;
}

export interface BillingInvoice {
  id: string;
  clientType: 'entreprise' | 'personnel';
  client: string;
  email: string;
  period: string;
  vmCount: number;
  serviceCount: number;
  resources: string;
  amount: string;
  paid: boolean;
  transactions: BillingTransaction[];
}

@Component({
  selector: 'app-billing-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './billing-page.html',
})
export class BillingPageComponent implements OnInit {
  billingStats = signal<any[]>([]);
  billingInvoices = signal<BillingInvoice[]>([]);
  revenueChart = signal<any[]>([]);
  pricingRules = signal<any[]>([]);
  currentMonthTotal = signal<{ label: string; val: string }>({ label: '', val: '' });

  // Filter & search
  activeFilter = signal<'all' | 'entreprise' | 'personnel'>('all');
  searchQuery = signal<string>('');
  expandedRow = signal<string | null>(null);

  @Output() navigateTo = new EventEmitter<string>();

  private http = inject(HttpClient);
  constructor(public h: DashboardHelperService) { }

  ngOnInit() {
    this.loadBillingData();
  }

  loadBillingData() {
    this.http.get<any>(`${environment.apiBaseUrl}/admin/billing`).subscribe({
      next: (data) => {
        this.billingStats.set(data.billingStats || []);
        this.billingInvoices.set(data.billingInvoices || []);
        this.revenueChart.set(data.revenueChart || []);
        this.pricingRules.set(data.pricingRules || []);
        if (data.currentMonthTotal) {
          this.currentMonthTotal.set(data.currentMonthTotal);
        }
      },
      error: (err) => console.error('Failed to load global billing data', err),
    });
  }

  filteredInvoices = computed(() => {
    const filter = this.activeFilter();
    const q = this.searchQuery().toLowerCase().trim();
    return this.billingInvoices().filter(inv => {
      const matchType = filter === 'all' || inv.clientType === filter;
      const matchSearch = !q ||
        inv.client.toLowerCase().includes(q) ||
        inv.email.toLowerCase().includes(q) ||
        inv.period.toLowerCase().includes(q);
      return matchType && matchSearch;
    });
  });

  enterpriseCount = computed(() => this.billingInvoices().filter(i => i.clientType === 'entreprise').length);
  personnelCount  = computed(() => this.billingInvoices().filter(i => i.clientType === 'personnel').length);

  setFilter(f: 'all' | 'entreprise' | 'personnel') {
    this.activeFilter.set(f);
  }

  toggleRow(id: string) {
    this.expandedRow.set(this.expandedRow() === id ? null : id);
  }

  isExpanded(id: string): boolean {
    return this.expandedRow() === id;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  statusClass(s: string): string {
    const m: Record<string, string> = {
      RUNNING: 'tx-running',
      STOPPED: 'tx-stopped',
      PROVISIONING: 'tx-pending',
      FAILED: 'tx-failed',
      active: 'tx-running',
    };
    return m[s] ?? 'tx-pending';
  }

  statusLabel(s: string): string {
    const m: Record<string, string> = {
      RUNNING: 'Active',
      STOPPED: 'Stoppée',
      PROVISIONING: 'En cours',
      FAILED: 'Échouée',
      active: 'Active',
    };
    return m[s] ?? s;
  }

  exportCsv() {
    const rows = this.filteredInvoices();
    const header = 'Client;Type;Email;Période;VMs;Services;Montant;Statut';
    const lines = rows.map(r =>
      `"${r.client}";"${r.clientType}";"${r.email}";"${r.period}";"${r.vmCount}";"${r.serviceCount}";"${r.amount}";"${r.paid ? 'Payée' : 'En attente'}"`
    );
    const csv = '\uFEFF' + [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facturation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
