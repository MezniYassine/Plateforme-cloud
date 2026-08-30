import { Component, signal } from '@angular/core';
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
  isCollapsed = signal<boolean>(typeof localStorage !== 'undefined' ? localStorage.getItem('sidebar_collapsed_user') === 'true' : false);

  constructor(public state: DashboardHelperService, private router: Router,) { }

  toggleCollapse() {
    this.isCollapsed.update(v => !v);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('sidebar_collapsed_user', String(this.isCollapsed()));
    }
  }

  logout() {
    localStorage.removeItem('access_token');
    this.router.navigate(['/login']);
  }
}
