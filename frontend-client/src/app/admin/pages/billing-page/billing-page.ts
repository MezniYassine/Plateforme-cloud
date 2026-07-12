import { Component, signal, OnInit, inject, Output, EventEmitter } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

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
export class BillingPageComponent implements OnInit {
  billingStats = signal<any[]>([]);
  billingInvoices = signal<BillingInvoice[]>([]);
  revenueChart = signal<any[]>([]);
  pricingRules = signal<any[]>([]);
  currentMonthTotal = signal<{label: string, val: string}>({label: '', val: ''});
  @Output() navigateTo = new EventEmitter<string>();

  private http = inject(HttpClient);
  constructor(public h: DashboardHelperService) { }

  ngOnInit() {
    this.loadBillingData();
  }

  loadBillingData() {
    this.http.get<any>(`${environment.apiBaseUrl}/admin/billing`).subscribe({
      next: (data) => {
        this.billingStats.set(data.billingStats || []);
        this.billingInvoices.set(data.billingInvoices || []);
        this.revenueChart.set(data.revenueChart || []);
        this.pricingRules.set(data.pricingRules || []);
        if (data.currentMonthTotal) {
           this.currentMonthTotal.set(data.currentMonthTotal);
        }
      },
      error: (err) => console.error('Failed to load global billing data', err)
    });
  }
}
