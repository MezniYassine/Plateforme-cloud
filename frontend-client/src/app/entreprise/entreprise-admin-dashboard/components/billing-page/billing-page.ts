import { Component, input, output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeamMember, WalletTransaction } from '../../entreprise-helper.service';

@Component({
  selector: 'ent-billing-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './billing-page.html',
  styleUrl: './billing-page.scss',
})
export class BillingPageComponent {
  monthlySpend = input.required<number>();
  monthlyBudget = input.required<number>();
  budgetUsedPct = input.required<number>();
  transactions = input.required<WalletTransaction[]>();
  teamSpend = input.required<Array<Pick<TeamMember, 'name' | 'spend' | 'color'>>>();
  rechargeWallet = output<void>();

  // Date filter
  startDate = signal<string>('');
  endDate = signal<string>('');

  // Pagination
  readonly PAGE_SIZE = 5;
  currentPage = signal<number>(1);

  readonly memberStats = computed(() => {
    const members = this.teamSpend() || [];
    const totalSpend = members.reduce((sum, m) => sum + (Number(m.spend) || 0), 0);
    const circumference = 377; // 2 * PI * 60

    const fallbackPalette = [
      '#2563eb', // royal blue
      '#7c3aed', // purple
      '#059669', // emerald
      '#ea580c', // orange
      '#0891b2', // cyan
      '#db2777', // pink
      '#4f46e5', // indigo
      '#d97706', // amber
    ];

    let currentOffset = 0;
    const items = members.map((m, idx) => {
      const spend = Number(m.spend) || 0;
      const color = m.color || fallbackPalette[idx % fallbackPalette.length];
      const pctOfTotal = totalSpend > 0 ? (spend / totalSpend) * 100 : 0;
      const arcLen = totalSpend > 0 ? (spend / totalSpend) * circumference : 0;
      const dash = `${arcLen.toFixed(1)} ${circumference}`;
      const offset = -currentOffset;
      currentOffset += arcLen;

      return {
        name: m.name,
        spend,
        color,
        initials: this.getInitials(m.name),
        pctOfTotal: Math.round(pctOfTotal),
        precisePct: pctOfTotal,
        barWidth: Math.min(100, Math.max(0, pctOfTotal)),
        dash,
        offset
      };
    });

    // Sort items by spend descending so top consumers are on top
    const sortedItems = [...items].sort((a, b) => b.spend - a.spend);
    const topSpender = sortedItems.find(i => i.spend > 0) || null;
    const activeCount = items.filter(i => i.spend > 0).length;

    return {
      totalSpend,
      items: sortedItems,
      topSpender,
      activeCount,
      hasSpend: totalSpend > 0,
    };
  });

  // ── Date-filtered & paged transactions ─────────────────────
  filteredTransactions = computed(() => {
    const list = this.transactions() || [];
    const start = this.startDate();
    const end = this.endDate();
    if (!start && !end) return list;
    return list.filter(t => {
      if (!t.date) return true;
      const d = new Date(t.date);
      if (isNaN(d.getTime())) return true;
      if (start && d < new Date(start)) return false;
      if (end   && d > new Date(end + 'T23:59:59')) return false;
      return true;
    });
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredTransactions().length / this.PAGE_SIZE)));

  pagedTransactions = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * this.PAGE_SIZE;
    return this.filteredTransactions().slice(start, start + this.PAGE_SIZE);
  });

  pageNumbers = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1)
  );

  getInitials(name: string): string {
    return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  clearDateFilter() {
    this.startDate.set('');
    this.endDate.set('');
    this.currentPage.set(1);
  }

  onDateChange() {
    this.currentPage.set(1);
  }

  goToPage(p: number) {
    if (p >= 1 && p <= this.totalPages()) this.currentPage.set(p);
  }

  formatDate(d: any): string {
    if (!d) return '—';
    try {
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      }
    } catch (_) {}
    if (typeof d === 'string' && d.length > 3) {
      return d.slice(0, 10);
    }
    return '—';
  }

  exportToExcel() {
    const list = this.filteredTransactions();
    if (!list || list.length === 0) return;

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `facturation_entreprise_${dateStr}.xls`;

    const rowsHtml = list.map(t => {
      const isCredit = t.type === 'credit';
      const formattedAmount = (isCredit ? '+' : '-') + t.amount + ' DT';
      const resDesc = isCredit ? 'Rechargement Solde' : (t.desc || '');
      const offer = t.catalogName || t.typeService || (isCredit ? 'Recharge Wallet' : '—');
      return `
        <tr>
          <td style="mso-number-format:'\\@'; font-weight: bold; color: #1E293B;">${t.refFacture || 'FAC-2026-00000'}</td>
          <td style="mso-number-format:'\\@';">${this.formatDate(t.date)}</td>
          <td>${t.memberName || 'Entreprise'}</td>
          <td>${resDesc.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
          <td>${offer}</td>
          <td style="text-align: center;">${isCredit ? 'Recharge' : 'Débit / Usage'}</td>
          <td style="text-align: right; font-weight: bold; color: ${isCredit ? '#059669' : '#DC2626'};">${formattedAmount}</td>
        </tr>
      `;
    }).join('');

    const excelTemplate = [
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">',
      '<head><meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"/></head>',
      '<body style="font-family: Calibri, Arial, sans-serif; font-size: 11pt;">',
      '<h2 style="color: #0F172A; margin-bottom: 4px;">DYNAMIX CLOUD — Facturation & Transactions Entreprise</h2>',
      '<p style="color: #64748B; font-size: 10pt; margin-top: 0;">Export g\u00e9n\u00e9r\u00e9 le ' + new Date().toLocaleDateString('fr-FR') + ' \u00e0 ' + new Date().toLocaleTimeString('fr-FR') + '</p><br/>',
      '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; border: 1px solid #E2E8F0;">',
      '<thead>',
      '<tr style="background-color: #0F172A; color: #FFFFFF; font-weight: bold;">',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF;">R\u00e9f. Facture</th>',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF;">Date</th>',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF;">Initiateur</th>',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF;">Ressource / Intitul\u00e9</th>',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF;">Offre</th>',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF; text-align: center;">Type</th>',
      '<th style="padding: 8px 12px; border: 1px solid #334155; background-color: #0F172A; color: #FFFFFF; text-align: right;">Montant</th>',
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
