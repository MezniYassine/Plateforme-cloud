import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardHelperService } from '../../dashboard-helper.service';

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './user-dashboard.html',
})
export class UserDashboardComponent {
  constructor(public state: DashboardHelperService) { }
}
