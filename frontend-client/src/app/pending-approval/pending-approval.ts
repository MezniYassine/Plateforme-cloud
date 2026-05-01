import { isPlatformBrowser } from '@angular/common';
import { Component, inject, PLATFORM_ID } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-pending-approval',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './pending-approval.component.html',
  styleUrl: './pending-approval.component.scss'
})
export class PendingApprovalComponent {

  private platformId = inject(PLATFORM_ID);
  isBrowserAndReady = false;
  constructor(private router: Router) {

  }
  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {

      this.isBrowserAndReady = true;

    }
  }

}