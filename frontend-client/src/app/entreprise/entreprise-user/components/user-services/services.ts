import { Component } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [],
  templateUrl: './services.html',
})
export class Services {
  constructor(public state: DashboardHelperService) { }
}
