import { Component, computed, EventEmitter, Input, Output, signal } from '@angular/core';
import { Admin } from '../../dashboard-helper.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [],
  templateUrl: './sidebar.html',
})
export class Sidebar {
  @Input() activePage = 'dashboard';
  @Input() tenantCount = 0;
  @Input() pendingCount = 0;
  @Input() openTicketsCount = 0;
  @Input() actualAdmin: Admin | null = null;

  @Output() pageChange = new EventEmitter<string>();
  isCollapsed = signal<boolean>(typeof localStorage !== 'undefined' ? localStorage.getItem('sidebar_collapsed_admin') === 'true' : false);

  constructor(private router: Router) { }

  setPage(p: string) {
    this.pageChange.emit(p);
  }

  toggleCollapse() {
    this.isCollapsed.update(v => !v);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('sidebar_collapsed_admin', String(this.isCollapsed()));
    }
  }

  logout() {
    localStorage.removeItem('access_token');
    this.router.navigate(['/login']);
  }
}
