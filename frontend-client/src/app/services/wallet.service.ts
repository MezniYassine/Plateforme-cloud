import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

export interface WalletData {
  solde: number;
  devise: string;
  transactions: WalletTransaction[];
}

export interface WalletTransaction {
  id: number;
  montant: number;
  type: 'DEBIT' | 'CREDIT';
  description: string;
  dateTransaction: string;
  vmId?: number;
}

@Injectable({ providedIn: 'root' })
export class WalletService {
  private readonly base = environment.apiBaseUrl.replace(/\/$/, '');
  private http = inject(HttpClient);

  getWallet(): Observable<WalletData> {
    return this.http.get<WalletData>(`${this.base}/wallet/me`);
  }

  recharger(): Observable<{ message: string; nouveauSolde: number; devise: string }> {
    return this.http.post<any>(`${this.base}/wallet/recharger`, {});
  }
}
