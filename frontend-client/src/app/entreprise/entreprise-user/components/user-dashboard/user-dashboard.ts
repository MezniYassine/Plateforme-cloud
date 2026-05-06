import { Component } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [],
  templateUrl: './user-dashboard.html',
})
export class UserDashboardComponent {
  constructor(public state: DashboardHelperService) { }
}
