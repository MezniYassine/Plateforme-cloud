import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DashboardHelperService } from '../../dashboard-helper.service';

@Component({
  selector: 'app-new-request',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './new-request.html',
})
export class NewRequest {
  constructor(public state: DashboardHelperService) { }
}
