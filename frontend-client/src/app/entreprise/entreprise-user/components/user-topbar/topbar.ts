import { Component } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [],
  templateUrl: './topbar.html',
})
export class Topbar {
  constructor(public state: DashboardHelperService) { }
}
