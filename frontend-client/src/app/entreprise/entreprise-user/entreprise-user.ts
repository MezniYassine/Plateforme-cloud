import { Component, OnInit, OnDestroy, ViewEncapsulation, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardHelperService } from './dashboard-helper.service';
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
export class EntrepriseUserDashboard implements OnInit, OnDestroy {
  isBrowserAndReady = false;
  private platformId = inject(PLATFORM_ID);
  private pollInterval: any;

  constructor(public state: DashboardHelperService) { }

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.isBrowserAndReady = true;
    this.state.setDate();
    this.state.loadUserData();
    this.state.loadMyDemandes();
    this.state.loadMyVms();
    this.state.loadVmTemplates();
    this.state.loadCatalog();

    this.pollInterval = setInterval(() => {
      this.state.loadMyDemandes();
      this.state.loadMyVms();
    }, 4000);
  }

  ngOnDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }
}
