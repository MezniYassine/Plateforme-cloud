import { Component, OnInit, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-login-success',
  standalone: true,
  template: `<div class="loading-state">Authenticating...</div>`,
  styles: [`
    .loading-state {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      font-size: 1.2rem;
      color: #60a5fa;
      background: #0f172a;
    }
  `]
})
export class LoginSuccessComponent implements OnInit {
  route = inject(ActivatedRoute);
  router = inject(Router);
  platformId = inject(PLATFORM_ID);

  ngOnInit() {
    // Only run in the browser — localStorage does not exist in SSR (Node.js)
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.route.queryParams.subscribe(params => {
      const token = params['token'];
      if (token) {
        localStorage.setItem('access_token', token);

        // Decode the JWT payload to determine where to redirect
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const role = payload.role;
          const status = payload.status || 'APPROVED';

          if (role === 'GLOBAL_ADMIN') {
            this.router.navigate(['/admin-dashboard']);
          } else if (role === 'PERSONNEL' && status === 'APPROVED') {
            this.router.navigate(['/personal-dashboard']);
          } else if (role === 'ENTREPRISE_ADMIN' && status === 'APPROVED') {
            this.router.navigate(['/entreprise-admin-dashboard']);
          } else if (status === 'PENDING_VALIDATION') {
            this.router.navigate(['/pending-approval']);
          } else {
            this.router.navigate(['/console']);
          }
        } catch (e) {
          console.error('Error decoding token', e);
          this.router.navigate(['/login']);
        }
      } else {
        this.router.navigate(['/login']);
      }
    });
  }
}
