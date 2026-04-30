import { Component, input, output } from '@angular/core';
import { DashboardHelperService, Tenant, Activity } from '../../dashboard-helper.service';

interface InfraMetric { label: string; val: string; pct: number; color: string; }

@Component({
  selector: 'app-dashboard-overview',
  standalone: true,
  imports: [],
  templateUrl: './dashboard-overview.html',
})
export class DashboardOverviewComponent {
  tenants        = input.required<Tenant[]>();
  enterpriseCount = input.required<number>();
  pendingCount    = input.required<number>();
  activeDevCount  = input.required<number>();
  activities      = input.required<Activity[]>();
  infraMetrics    = input.required<InfraMetric[]>();

  navigateTo = output<string>();
  openModal  = output<string>();
  quickAction = output<{ id: string; status: Tenant['status'] }>();

  constructor(public h: DashboardHelperService) {}

  onQuickAction(id: string, status: Tenant['status']) {
    this.quickAction.emit({ id, status });
  }
}
