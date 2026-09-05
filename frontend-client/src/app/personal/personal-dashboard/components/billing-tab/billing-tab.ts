import { Component, output, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Invoice, PersonalDashboardHelperService } from '../../personal-dashboard-helper.service';
import { environment } from '../../../../../environments/environment';
import { CostPredictionCardComponent } from '../../../../common/cost-prediction-card/cost-prediction-card.component';

@Component({
  selector: 'app-billing-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, CostPredictionCardComponent],
  templateUrl: './billing-tab.html',
  styleUrls: ['./billing-tab.scss']
})
export class BillingTabComponent implements OnInit {
  readonly predictionApiUrl = `${environment.apiBaseUrl}/personal/billing/prediction`;

  h = inject(PersonalDashboardHelperService);
  openRecharge = output<void>();

  searchTerm = signal<string>('');
  filterType = signal<'ALL' | 'DEBIT' | 'CREDIT'>('ALL');

  // Date filter
  startDate = signal<string>('');
  endDate = signal<string>('');

  // Pagination
  readonly PAGE_SIZE = 5;
  currentPage = signal<number>(1);

  get invoices() {
    return this.h.invoices;
  }

  // ── Stats Summary ──────────────────────────────────────────
  totalDebits = computed(() => {
    return (this.invoices() || [])
      .filter(i => (i as any).type === 'DEBIT' || i.amount.startsWith('-'))
      .reduce((sum, i) => {
        const num = parseFloat(i.amount.replace(/[^0-9.-]+/g, '')) || 0;
        return sum + Math.abs(num);
      }, 0);
  });

  totalCredits = computed(() => {
    return (this.invoices() || [])
      .filter(i => (i as any).type === 'CREDIT' || i.amount.startsWith('+'))
      .reduce((sum, i) => {
        const num = parseFloat(i.amount.replace(/[^0-9.-]+/g, '')) || 0;
        return sum + Math.abs(num);
      }, 0);
  });

  // ── Filtered Invoices ──────────────────────────────────────────────────────
  filteredInvoices = computed(() => {
    const list = this.invoices() || [];
    const search = this.searchTerm().trim().toLowerCase();
    const filter = this.filterType();
    const start = this.startDate();
    const end = this.endDate();

    return list.filter(i => {
      const isDebit = (i as any).type === 'DEBIT' || i.amount.startsWith('-');
      const isCredit = (i as any).type === 'CREDIT' || i.amount.startsWith('+');

      let matchFilter = true;
      if (filter === 'DEBIT') matchFilter = isDebit;
      if (filter === 'CREDIT') matchFilter = isCredit;

      const matchSearch = !search ||
        (i.ref && i.ref.toLowerCase().includes(search)) ||
        (i.resources && i.resources.toLowerCase().includes(search)) ||
        (i.period && i.period.toLowerCase().includes(search));

      let matchDate = true;
      if (start || end) {
        const d = i.period ? new Date(i.period) : null;
        if (d && !isNaN(d.getTime())) {
          if (start) matchDate = matchDate && d >= new Date(start);
          if (end) matchDate = matchDate && d <= new Date(end + 'T23:59:59');
        }
      }

      return matchFilter && matchSearch && matchDate;
    });
  });

  // ── Pagination ────────────────────────────────────────────────────────────
  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredInvoices().length / this.PAGE_SIZE)));

  pagedInvoices = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * this.PAGE_SIZE;
    return this.filteredInvoices().slice(start, start + this.PAGE_SIZE);
  });

  pageNumbers = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1)
  );

  // ── Helpers ───────────────────────────────────────────────────────────────
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

  exportToExcel() {
    const list = this.filteredInvoices();
    if (!list || list.length === 0) return;

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `facturation_dynamix_${dateStr}.xls`;

    const rowsHtml = list.map(i => `
      <tr>
        <td style="mso-number-format:'\\@';">${i.period || ''}</td>
        <td style="mso-number-format:'\\@'; font-weight: bold; color: #1E293B;">${i.ref || ''}</td>
        <td>${(i.resources || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
        <td style="text-align: right; font-weight: bold; color: ${i.amount.startsWith('+') ? '#059669' : '#DC2626'};">${i.amount || ''}</td>
        <td style="text-align: center; color: #059669; font-weight: bold;">${i.status || 'Payée'}</td>
      </tr>
    `).join('');

    const excelTemplate = [
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">',
      '<head><meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"/></head>',
      '<body style="font-family: Calibri, Arial, sans-serif; font-size: 11pt;">',
      '<h2 style="color: #0F172A; margin-bottom: 4px;">DYNAMIX CLOUD — Relevé de Facturation</h2>',
      '<p style="color: #64748B; font-size: 10pt; margin-top: 0;">Export généré le ' + new Date().toLocaleDateString('fr-FR') + ' à ' + new Date().toLocaleTimeString('fr-FR') + '</p><br/>',
      '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; border: 1px solid #E2E8F0;">',
      '<thead>',
      '<tr style="background-color: #0F172A; color: #FFFFFF; font-weight: bold;">',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF;">Date / Période</th>',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF;">Réf. Facture</th>',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF;">Ressources / Description</th>',
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

  ngOnInit() {
    this.h.loadInvoices();
  }
}
