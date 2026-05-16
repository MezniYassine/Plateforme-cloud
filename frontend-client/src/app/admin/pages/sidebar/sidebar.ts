import { Component, computed, EventEmitter, Input, Output, signal } from '@angular/core';
import { Admin } from '../../dashboard-helper.service';

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

  setPage(p: string) {
    this.pageChange.emit(p);
  }
}
