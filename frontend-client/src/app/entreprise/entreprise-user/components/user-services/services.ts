import { Component } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';

import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './services.html',
})
export class Services {
  constructor(public state: DashboardHelperService) { }
}
