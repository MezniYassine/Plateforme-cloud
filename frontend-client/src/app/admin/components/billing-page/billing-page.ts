import { Component, signal, computed, OnInit, inject, Output, EventEmitter } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CostPredictionCardComponent } from '../../../common/cost-prediction-card/cost-prediction-card.component';
import * as XLSX from 'xlsx';

export interface BillingInvoice {
  id: string;
  ref?: string;
  clientType: 'entreprise' | 'personnel';
  client: string;
  email: string;
  date: string;
  period: string;
  resourceName: string;
  catalogName?: string | null;
  typeService: 'IAAS' | 'PAAS' | 'SAAS';
  amount: string;
  price?: number;
  paid: boolean;
  status?: string;
}

@Component({
  selector: 'app-billing-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CostPredictionCardComponent],
  templateUrl: './billing-page.html',
  styleUrl: './billing-page.scss'
})
export class BillingPageComponent implements OnInit {
  readonly predictionApiUrl = `${environment.apiBaseUrl}/admin/billing/prediction`;

  billingStats = signal<any[]>([]);
  billingInvoices = signal<BillingInvoice[]>([]);
  revenueChart = signal<any[]>([]);
  pricingRules = signal<any[]>([]);
  currentMonthTotal = signal<{ label: string; val: string }>({ label: '', val: '' });

  // Filter & search
  activeFilter = signal<'all' | 'entreprise' | 'personnel'>('all');
  searchQuery = signal<string>('');

  // Date filter
  startDate = signal<string>('');
  endDate = signal<string>('');

  // Pagination
  readonly PAGE_SIZE = 5;
  currentPage = signal<number>(1);

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
    const start = this.startDate();
    const end = this.endDate();

    return this.billingInvoices().filter(inv => {
      const matchType = filter === 'all' || inv.clientType === filter;
      const matchSearch = !q ||
        inv.client.toLowerCase().includes(q) ||
        inv.email.toLowerCase().includes(q) ||
        (inv.ref && inv.ref.toLowerCase().includes(q)) ||
        (inv.resourceName && inv.resourceName.toLowerCase().includes(q)) ||
        (inv.catalogName && inv.catalogName.toLowerCase().includes(q)) ||
        inv.period.toLowerCase().includes(q);

      let matchDate = true;
      if (start || end) {
        const invDate = inv.date ? new Date(inv.date) : (inv.period ? new Date(inv.period) : null);
        if (invDate && !isNaN(invDate.getTime())) {
          if (start) matchDate = matchDate && invDate >= new Date(start);
          if (end)   matchDate = matchDate && invDate <= new Date(end + 'T23:59:59');
        }
      }

      return matchType && matchSearch && matchDate;
    });
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredInvoices().length / this.PAGE_SIZE)));

  pagedInvoices = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * this.PAGE_SIZE;
    return this.filteredInvoices().slice(start, start + this.PAGE_SIZE);
  });

  pageNumbers = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1)
  );

  enterpriseCount = computed(() => this.billingInvoices().filter(i => i.clientType === 'entreprise').length);
  personnelCount  = computed(() => this.billingInvoices().filter(i => i.clientType === 'personnel').length);

  setFilter(f: 'all' | 'entreprise' | 'personnel') {
    this.activeFilter.set(f);
    this.currentPage.set(1);
  }

  clearDateFilter() {
    this.startDate.set('');
    this.endDate.set('');
    this.currentPage.set(1);
  }

  onFilterChange() {
    this.currentPage.set(1);
  }

  goToPage(p: number) {
    if (p >= 1 && p <= this.totalPages()) this.currentPage.set(p);
  }

  formatDate(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  exportCsv() {
    const rows = this.filteredInvoices();
    if (!rows || rows.length === 0) return;

    const header = 'Client;Type Client;Email;Réf Facture;Date;Période;Ressource;Catalogue;Type Service;Montant;Statut';
    const lines = rows.map(r =>
      `"${r.client}";"${r.clientType === 'entreprise' ? 'Entreprise' : 'Particulier'}";"${r.email}";"${r.ref || ''}";"${this.formatDate(r.date)}";"${r.period}";"${r.resourceName || ''}";"${r.catalogName || ''}";"${r.typeService}";"${r.amount}";"${r.paid ? 'Payée' : 'En attente'}"`
    );

    const csv = '\uFEFF' + [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facturation_globale_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportExcel() {
    const rows = this.filteredInvoices();
    if (!rows || rows.length === 0) return;

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `facturation_globale_${dateStr}.xlsx`;

    const totalAmount = rows.reduce((sum, r) => {
      const num = r.price !== undefined ? r.price : (parseFloat((r.amount || '').replace(/[^0-9.-]+/g, '')) || 0);
      return sum + num;
    }, 0);

    // ── FEUILLE 1 : Factures Détaillées ────────────────────────────────────
    const sheet1Data: any[][] = [
      ['DYNA-CLOUD — Facturation Globale des Clients'],
      [`Export généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')} — ${rows.length} facture(s)`],
      [],
      [
        'Client / Compte',
        'Type Client',
        'Email',
        'Réf. Facture',
        'Date d\'émission',
        'Période',
        'Ressource / Service',
        'Catalogue',
        'Type Service',
        'Montant (DT)',
        'Statut'
      ]
    ];

    rows.forEach(r => {
      sheet1Data.push([
        r.client,
        r.clientType === 'entreprise' ? 'Entreprise' : 'Particulier',
        r.email,
        r.ref || '—',
        this.formatDate(r.date),
        r.period,
        r.resourceName || '—',
        r.catalogName || '—',
        r.typeService || '—',
        r.price !== undefined ? r.price : (parseFloat((r.amount || '').replace(/[^0-9.-]+/g, '')) || 0),
        r.paid ? 'Payée' : 'En attente'
      ]);
    });

    sheet1Data.push([]);
    sheet1Data.push([
      `TOTAL GÉNÉRAL (${rows.length} factures) :`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      totalAmount,
      ''
    ]);

    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
    ws1['!cols'] = [
      { wch: 26 }, // Client
      { wch: 15 }, // Type Client
      { wch: 28 }, // Email
      { wch: 18 }, // Réf Facture
      { wch: 15 }, // Date
      { wch: 16 }, // Période
      { wch: 24 }, // Ressource
      { wch: 20 }, // Catalogue
      { wch: 14 }, // Type Service
      { wch: 15 }, // Montant
      { wch: 14 }  // Statut
    ];

    // ── FEUILLE 2 : Synthèse par Client ──────────────────────────────────
    const clientSummaryMap = new Map<string, {
      client: string;
      clientType: string;
      email: string;
      facturesCount: number;
      totalAmount: number;
      allPaid: boolean;
    }>();

    rows.forEach(r => {
      const key = `${r.client}-${r.email}`;
      const priceVal = r.price !== undefined ? r.price : (parseFloat((r.amount || '').replace(/[^0-9.-]+/g, '')) || 0);
      if (!clientSummaryMap.has(key)) {
        clientSummaryMap.set(key, {
          client: r.client,
          clientType: r.clientType === 'entreprise' ? 'Entreprise' : 'Particulier',
          email: r.email,
          facturesCount: 0,
          totalAmount: 0,
          allPaid: true,
        });
      }
      const c = clientSummaryMap.get(key)!;
      c.facturesCount += 1;
      c.totalAmount += priceVal;
      if (!r.paid) c.allPaid = false;
    });

    const sheet2Data: any[][] = [
      ['DYNA-CLOUD — Synthèse de Facturation par Client'],
      [`Date de synthèse : ${new Date().toLocaleDateString('fr-FR')} — ${clientSummaryMap.size} client(s)`],
      [],
      [
        'Client / Compte',
        'Type Client',
        'Email',
        'Nombre de Factures',
        'Total Facturé (DT)',
        'Statut Global'
      ]
    ];

    clientSummaryMap.forEach(c => {
      sheet2Data.push([
        c.client,
        c.clientType,
        c.email,
        c.facturesCount,
        c.totalAmount,
        c.allPaid ? 'À jour (Payée)' : 'Paiement en attente'
      ]);
    });

    sheet2Data.push([]);
    sheet2Data.push(['TOTAL GÉNÉRAL', '', '', rows.length, totalAmount, '']);

    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
    ws2['!cols'] = [
      { wch: 26 },
      { wch: 15 },
      { wch: 28 },
      { wch: 20 },
      { wch: 18 },
      { wch: 22 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'Factures Détaillées');
    XLSX.utils.book_append_sheet(wb, ws2, 'Synthèse par Client');

    XLSX.writeFile(wb, fileName);
  }
}
