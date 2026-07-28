import { Component, output, signal, inject, OnInit } from '@angular/core';
import { Invoice, PersonalDashboardHelperService } from '../../personal-dashboard-helper.service';

@Component({
  selector: 'app-billing-tab',
  standalone: true,
  imports: [],
  templateUrl: './billing-tab.html',
})
export class BillingTabComponent implements OnInit {
  h = inject(PersonalDashboardHelperService);
  openRecharge = output<void>();

  get invoices() {
    return this.h.invoices;
  }

  ngOnInit() {
    this.h.loadInvoices();
  }
}
