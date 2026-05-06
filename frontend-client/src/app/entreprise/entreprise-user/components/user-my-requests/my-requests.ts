import { Component } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';

@Component({
  selector: 'app-my-requests',
  standalone: true,
  imports: [],
  templateUrl: './my-requests.html',
})
export class MyRequests {
  constructor(public state: DashboardHelperService) { }
}
