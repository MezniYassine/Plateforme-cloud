import { Component } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';

@Component({
  selector: 'app-vms',
  standalone: true,
  imports: [],
  templateUrl: './vms.html',
})
export class Vms {
  constructor(public state: DashboardHelperService) { }
}
