import { Component, output, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Invoice, PersonalDashboardHelperService } from '../../personal-dashboard-helper.service';

@Component({
  selector: 'app-billing-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './billing-tab.html',
  styleUrls: ['./billing-tab.scss']
})
export class BillingTabComponent implements OnInit {
  h = inject(PersonalDashboardHelperService);
  openRecharge = output<void>();

  searchTerm = signal<string>('');
  filterType = signal<'ALL' | 'DEBIT' | 'CREDIT'>('ALL');

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

  // ── Filtered Invoices ──────────────────────────────────────
  filteredInvoices = computed(() => {
    const list = this.invoices() || [];
    const search = this.searchTerm().trim().toLowerCase();
    const filter = this.filterType();

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

      return matchFilter && matchSearch;
    });
  });

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
      '<h2 style="color: #0F172A; margin-bottom: 4px;">DYNAMIX CLOUD — Relev\u00e9 de Facturation</h2>',
      '<p style="color: #64748B; font-size: 10pt; margin-top: 0;">Export g\u00e9n\u00e9r\u00e9 le ' + new Date().toLocaleDateString('fr-FR') + ' \u00e0 ' + new Date().toLocaleTimeString('fr-FR') + '</p><br/>',
      '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; border: 1px solid #E2E8F0;">',
      '<thead>',
      '<tr style="background-color: #0F172A; color: #FFFFFF; font-weight: bold;">',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF;">Date / P\u00e9riode</th>',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF;">R\u00e9f. Facture</th>',
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
