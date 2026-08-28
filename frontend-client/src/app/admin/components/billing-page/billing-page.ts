import { Component, signal, computed, OnInit, inject, Output, EventEmitter } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface BillingTransaction {
  ref?: string;
  name: string;
  catalogName: string | null;
  typeService: 'IAAS' | 'PAAS' | 'SAAS';
  price: number;
  status: string;
  date: string;
}

export interface BillingInvoice {
  id: string;
  ref?: string;
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
  styleUrl: './billing-page.scss'
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
        const cardThemes = [
          { cardClass: 'card-anthracite-dark', icon: 'money' },
          { cardClass: 'card-orange-deep', icon: 'invoice' },
          { cardClass: 'card-anthracite-mid', icon: 'users' },
          { cardClass: 'card-orange-vibrant', icon: 'chart' }
        ];

        const rawStats = data.billingStats || [];
        const enhancedStats = rawStats.map((s: any, idx: number) => ({
          ...s,
          cardClass: cardThemes[idx % cardThemes.length].cardClass,
          icon: cardThemes[idx % cardThemes.length].icon
        }));

        this.billingStats.set(enhancedStats);
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
    if (!iso) return '—';
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

  exportExcel() {
    const rows = this.filteredInvoices();
    if (!rows || rows.length === 0) return;

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `facturation_globale_${dateStr}.xls`;

    const rowsHtml = rows.map(r => `
      <tr>
        <td style="mso-number-format:'\\@'; font-weight: bold; color: #1E293B;">${r.client}</td>
        <td>${r.clientType === 'entreprise' ? 'Entreprise' : 'Particulier'}</td>
        <td style="mso-number-format:'\\@';">${r.email}</td>
        <td style="mso-number-format:'\\@';">${r.period}</td>
        <td style="text-align: center;">${r.vmCount}</td>
        <td style="text-align: center;">${r.serviceCount}</td>
        <td style="text-align: right; font-weight: bold; color: #0F172A;">${r.amount}</td>
        <td style="text-align: center; font-weight: bold; color: ${r.paid ? '#059669' : '#D97706'};">${r.paid ? 'Payée' : 'En attente'}</td>
      </tr>
    `).join('');

    const excelTemplate = [
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">',
      '<head><meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"/></head>',
      '<body style="font-family: Calibri, Arial, sans-serif; font-size: 11pt;">',
      '<h2 style="color: #0F172A; margin-bottom: 4px;">DYNAMIX CLOUD — Facturation Globale Clients</h2>',
      '<p style="color: #64748B; font-size: 10pt; margin-top: 0;">Export g\u00e9n\u00e9r\u00e9 le ' + new Date().toLocaleDateString('fr-FR') + ' \u00e0 ' + new Date().toLocaleTimeString('fr-FR') + '</p><br/>',
      '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; border: 1px solid #E2E8F0;">',
      '<thead>',
      '<tr style="background-color: #0F172A; color: #FFFFFF; font-weight: bold;">',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF;">Client</th>',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF;">Type</th>',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF;">Email</th>',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF;">P\u00e9riode</th>',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF; text-align: center;">VMs</th>',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF; text-align: center;">Services</th>',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF; text-align: right;">Montant</th>',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF; text-align: center;">Statut</th>',
      '</tr>',
      '</thead>',
      '<tbody>',
      rowsHtml,
      '</tbody>',
      '</table>',
      '</body>',
      '</html>'
    ].join('\n');

    const blob = new Blob(['\uFEFF' + excelTemplate], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
