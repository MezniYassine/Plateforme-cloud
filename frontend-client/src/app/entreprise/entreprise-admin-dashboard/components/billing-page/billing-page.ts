import { Component, input, output } from '@angular/core';
import { TeamMember, WalletTransaction } from '../../entreprise-helper.service';

@Component({
  selector: 'ent-billing-page',
  standalone: true,
  imports: [],
  templateUrl: './billing-page.html',
})
export class BillingPageComponent {
  monthlySpend = input.required<number>();
  monthlyBudget = input.required<number>();
  budgetUsedPct = input.required<number>();
  transactions = input.required<WalletTransaction[]>();
  teamSpend = input.required<Array<Pick<TeamMember, 'name' | 'spend' | 'color'>>>();
  rechargeWallet = output<void>();

  getInitials(name: string): string {
    return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }
}

