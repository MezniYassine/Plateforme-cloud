import { Component, computed, EventEmitter, Input, Output, signal } from '@angular/core';
import { Admin } from '../../dashboard-helper.service';

@Component({
  selector: 'app-sidebar',
  imports: [],
  templateUrl: './sidebar.html',
})
export class Sidebar {
  @Input() activePage = 'dashboard';
  @Input() enterpriseCount = 0;
  @Input() pendingCount = 0;
  @Input() actualAdmin: Admin | null = null;

  @Output() pageChange = new EventEmitter<string>();

  setPage(p: string) {
    this.pageChange.emit(p);
  }
}
