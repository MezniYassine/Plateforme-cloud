import { Component, signal } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';

interface BillingInvoice {
  id: string; client: string; email: string; period: string;
  resources: string; amount: string; paid: boolean;
}

@Component({
  selector: 'app-billing-page',
  standalone: true,
  imports: [],
  templateUrl: './billing-page.html',
})
export class BillingPageComponent {
  billingStats = signal([
    { label: 'Revenus juin', val: '1 842 DT', sub: '+18% vs mai', bg: 'var(--green-light)', color: 'var(--green)' },
    { label: 'Factures émises', val: '12', sub: '10 payées', bg: 'var(--blue-light)', color: 'var(--blue)' },
    { label: 'Factures en attente', val: '2', sub: 'À relancer', bg: 'var(--amber-light)', color: 'var(--amber)' },
    { label: 'Revenu annuel', val: '18 420 DT', sub: 'Estimé 2025', bg: 'var(--purple-light)', color: 'var(--purple)' },
  ]);

  billingInvoices = signal<BillingInvoice[]>([
    { id: 'i1', client: 'CloudNet SA', email: 'admin@cloudnet.tn', period: 'Juin 2025', resources: '14 VMs + 3 DBs', amount: '487.50 DT', paid: true },
    { id: 'i2', client: 'AlphaSys', email: 'contact@alphasys.tn', period: 'Juin 2025', resources: '22 VMs + 5 DBs', amount: '741.00 DT', paid: true },
    { id: 'i3', client: 'BisTech Group', email: 'info@bistech.tn', period: 'Juin 2025', resources: '7 VMs + 2 DBs', amount: '218.40 DT', paid: true },
    { id: 'i4', client: 'DataPrime SARL', email: 'contact@dataprime.tn', period: 'Juin 2025', resources: '2 VMs', amount: '72.00 DT', paid: false },
    { id: 'i5', client: 'CloudNet SA', email: 'admin@cloudnet.tn', period: 'Mai 2025', resources: '12 VMs + 3 DBs', amount: '398.50 DT', paid: true },
    { id: 'i6', client: 'AlphaSys', email: 'contact@alphasys.tn', period: 'Mai 2025', resources: '20 VMs + 4 DBs', amount: '620.00 DT', paid: false },
  ]);

  revenueChart = signal([
    { label: 'Jan', pct: 40 }, { label: 'Fév', pct: 48 }, { label: 'Mar', pct: 55 },
    { label: 'Avr', pct: 50 }, { label: 'Mai', pct: 68 }, { label: 'Juin', pct: 82 },
  ]);

  pricingRules = signal([
    { label: '1 vCPU / heure', price: '0.008 DT' },
    { label: '1 GB RAM / heure', price: '0.004 DT' },
    { label: '1 GB SSD / mois', price: '0.050 DT' },
    { label: 'DB PostgreSQL managée', price: '8.00 DT/mois' },
    { label: 'K8s namespace isolé', price: '5.00 DT/mois' },
  ]);

  constructor(public h: DashboardHelperService) {}
}
