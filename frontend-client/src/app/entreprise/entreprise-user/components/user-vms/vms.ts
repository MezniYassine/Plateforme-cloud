import { Component } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-vms',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './vms.html',
})
export class Vms {
  constructor(public state: DashboardHelperService) { }
}
