import { Component, input, output } from '@angular/core';
import { WalletTransaction } from '../../entreprise-helper.service';

interface WalletSummaryItem {
  label: string;
  val: string;
  color?: string;
}

@Component({
  selector: 'ent-wallet-page',
  standalone: true,
  imports: [],
  templateUrl: './wallet-page.html',
})
export class WalletPageComponent {
  walletBalance = input.required<number>();
  companyName = input.required<string>();
  walletTransactions = input.required<WalletTransaction[]>();
  walletSummary = input.required<WalletSummaryItem[]>();

  rechargeWallet = output<void>();
}
