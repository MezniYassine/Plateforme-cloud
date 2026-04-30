import { Component, input, output, signal } from '@angular/core';
import { Invoice } from '../../personal-dashboard-helper.service';

@Component({
  selector: 'app-billing-tab',
  standalone: true,
  imports: [],
  templateUrl: './billing-tab.html',
})
export class BillingTabComponent {
  wallet = input.required<number>();
  openRecharge = output<void>();

  invoices = signal<Invoice[]>([
    { period: 'Juin 2025', ref: 'INV-2025-006', resources: '3 VMs + 2 DBs', amount: '57.50 DT', status: 'En cours', statusClass: 'provisioning' },
    { period: 'Mai 2025',  ref: 'INV-2025-005', resources: '2 VMs + 2 DBs', amount: '44.20 DT', status: 'Payée',    statusClass: 'running' },
    { period: 'Avr 2025',  ref: 'INV-2025-004', resources: '2 VMs + 1 DB',  amount: '38.00 DT', status: 'Payée',    statusClass: 'running' },
    { period: 'Mar 2025',  ref: 'INV-2025-003', resources: '1 VM + 1 DB',   amount: '22.50 DT', status: 'Payée',    statusClass: 'running' },
  ]);
}
