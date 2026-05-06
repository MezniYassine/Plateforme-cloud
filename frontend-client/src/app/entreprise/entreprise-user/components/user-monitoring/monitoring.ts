import { Component } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';

@Component({
  selector: 'app-monitoring',
  standalone: true,
  imports: [],
  templateUrl: './monitoring.html',
})
export class Monitoring {
  constructor(public state: DashboardHelperService) { }
}
