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
  @Input() actualAdmin: Admin | null = null;

  @Output() pageChange = new EventEmitter<string>();
  constructor(private router: Router) { }

  setPage(p: string) {
    this.pageChange.emit(p);
  }
  logout() {
    localStorage.removeItem('access_token');
    this.router.navigate(['/login']);
  }
}
