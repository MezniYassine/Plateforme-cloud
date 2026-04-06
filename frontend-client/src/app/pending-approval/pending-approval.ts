import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-pending-approval',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="wrap">
      <h1>Pending approval</h1>
      <p>Your enterprise registration was received. An administrator will validate your account.</p>
      <a routerLink="/">Back to home</a>
    </div>
  `,
  styles: `
    .wrap {
      font-family: 'DM Sans', system-ui, sans-serif;
      padding: 3rem;
      max-width: 40rem;
    }
    a {
      color: #1a56e8;
    }
  `,
})
export class PendingApprovalComponent {}
