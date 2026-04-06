import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-console',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="wrap">
      <h1>Developer console</h1>
      <p>Welcome — this area is a placeholder until the real console is built.</p>
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
export class ConsolePageComponent {}
