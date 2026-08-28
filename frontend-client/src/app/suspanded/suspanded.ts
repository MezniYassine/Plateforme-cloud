import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';

export interface User {
  nom: string;
  prenom: string;
  email?: string;
  entreprise?: {
    nomEntreprise: string;
  };
}

@Component({
  selector: 'app-suspended',
  imports: [CommonModule, RouterLink],
  standalone: true,
  templateUrl: './suspanded.html',
  styleUrl: './suspanded.scss',
})
export class Suspended implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);
  actualUser = signal<User | null>(null);

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadCurrentUser();
    }
  }

  logout() {
    localStorage.removeItem('access_token');
    this.router.navigate(['/']);
  }
  loadCurrentUser() {
    const url = `${environment.apiBaseUrl.replace(/\/$/, '')}/users/me`;
    this.http.get<any>(url).subscribe({
      next: (user) => {
        this.actualUser.set(user);
      },
      error: (err) => console.error('Failed to load current admin', err)
    });

  }
  getDisplayName(): string {
    const user = this.actualUser();

    if (!user) return '';
    if (user.entreprise?.nomEntreprise) {
      return `${user.entreprise.nomEntreprise} - ${user.prenom} ${user.nom}`;
    }

    return `${user.prenom} ${user.nom}`;
  }
}
