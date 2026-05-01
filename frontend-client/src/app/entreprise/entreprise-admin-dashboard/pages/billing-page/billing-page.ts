import { Component, input } from '@angular/core';
import { Invoice, TeamMember } from '../../entreprise-helper.service';

interface BudgetAlert {
  label: string;
  desc: string;
  enabled: boolean;
}

@Component({
  selector: 'ent-billing-page',
  standalone: true,
  imports: [],
  templateUrl: './billing-page.html',
})
export class BillingPageComponent {
  monthlySpend = input.required<number>();
  monthlyBudget = input.required<number>();
  forecast = input.required<number>();
  budgetUsedPct = input.required<number>();
  invoices = input.required<Invoice[]>();
  teamSpend = input.required<Array<Pick<TeamMember, 'name' | 'spend' | 'color'>>>();
  budgetAlerts = input.required<BudgetAlert[]>();

  getInitials(name: string): string {
    return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }
}
