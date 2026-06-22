import { Component } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  constructor(public state: DashboardHelperService, private router: Router,) { }

  logout() {
    localStorage.removeItem('access_token');
    this.router.navigate(['/login']);
  }
}
