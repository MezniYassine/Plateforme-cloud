import { Component, computed, signal, OnInit, ViewEncapsulation, PLATFORM_ID, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';
import { CatalogItem, DashboardHelperService, MyRequest, MyService, MyVM } from './dashboard-helper.service';
import { UserDashboardComponent } from './components/user-dashboard/user-dashboard';
import { Sidebar } from './components/user-sidebar/sidebar';
import { Topbar } from './components/user-topbar/topbar';
import { NewRequest } from './components/user-new-request/new-request';
import { MyRequests } from './components/user-my-requests/my-requests';
import { Vms } from './components/user-vms/vms';
import { Services } from './components/user-services/services';
import { Monitoring } from './components/user-monitoring/monitoring';
import { Profile } from './components/user-profile/profile';

@Component({
  selector: 'app-entreprise-user',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    Sidebar,
    Topbar,
    UserDashboardComponent,
    NewRequest,
    MyRequests,
    Vms,
    Services,
    Monitoring,
    Profile,
  ],
  templateUrl: './entreprise-user.html',
  styleUrl: './entreprise-user.scss',
  encapsulation: ViewEncapsulation.None,
})
export class EntrepriseUserDashboard implements OnInit {
  isBrowserAndReady = false;
  private platformId = inject(PLATFORM_ID);
  constructor(public state: DashboardHelperService) { }
  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.isBrowserAndReady = true;
    this.state.setDate();
    this.state.loadUserData();
  }


}
