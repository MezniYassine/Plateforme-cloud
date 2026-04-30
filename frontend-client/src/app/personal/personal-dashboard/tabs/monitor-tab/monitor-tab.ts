import { Component, input } from '@angular/core';
import { VM } from '../../personal-dashboard-helper.service';
import { PersonalDashboardHelperService } from '../../personal-dashboard-helper.service';

@Component({
  selector: 'app-monitor-tab',
  standalone: true,
  imports: [],
  templateUrl: './monitor-tab.html',
})
export class MonitorTabComponent {
  vms         = input.required<VM[]>();
  monitorBars = input.required<Record<string, number[]>>();

  constructor(public h: PersonalDashboardHelperService) {}
}
