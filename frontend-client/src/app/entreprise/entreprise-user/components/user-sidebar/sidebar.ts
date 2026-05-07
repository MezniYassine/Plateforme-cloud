import { Component } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  constructor(public state: DashboardHelperService) { }
}
