import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth-service';

@Component({
  selector: 'app-personal-invitation',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './personal-invitation.html',
  styleUrl: './personal-invitation.scss',
})
export class PersonalInvitation {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  token = '';
  password = '';
  confirmPassword = '';
  showPassword = false;
  showConfirmPassword = false;
  loading = false;
  success = false;
  errorMessage = '';
  tokenType = '';

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';

    if (!this.token) {
      this.errorMessage = "Lien d'invitation invalide ou incomplet.";
      return;
    }

    this.tokenType = this.getTokenType(this.token);
  }

  get isForgotPassword() {
    return this.tokenType === 'FORGOT_PASSWORD';
  }

  get pageTitle() {
    return this.isForgotPassword ? 'Reinitialisez votre mot de passe' : "Vous avez ete invite a rejoindre l'equipe !";
  }

  get pageSubtitle() {
    return this.isForgotPassword
      ? 'Choisissez un nouveau mot de passe pour recuperer votre acces.'
      : 'Creez votre mot de passe pour activer votre acces a la plateforme.';
  }

  get sectionTitle() {
    return this.isForgotPassword ? 'Nouveau mot de passe' : 'Creez votre mot de passe';
  }

  get submitLabel() {
    return this.isForgotPassword ? 'Reinitialiser mon mot de passe' : 'Activer mon compte';
  }

  get expiryText() {
    return this.isForgotPassword
      ? 'Ce lien de reinitialisation expire apres 30 minutes.'
      : "Ce lien d'invitation expire apres 48h.";
  }

  get rules() {
    return {
      len: this.password.length >= 8,
      upper: /[A-Z]/.test(this.password),
      num: /[0-9]/.test(this.password),
      special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(this.password),
    };
  }

  get passwordScore() {
    return Object.values(this.rules).filter(Boolean).length;
  }

  get passwordValid() {
    return this.passwordScore >= 3;
  }

  get confirmValid() {
    return !!this.confirmPassword && this.password === this.confirmPassword;
  }

  get canSubmit() {
    return !!this.token && this.passwordValid && this.confirmValid && !this.loading;
  }

  get strengthLabel() {
    return ['', 'Faible', 'Moyen', 'Fort', 'Tres fort'][this.passwordScore] || '';
  }

  submit() {
    if (!this.canSubmit) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.authService.setupPassword({ token: this.token, password: this.password }).subscribe({
      next: () => {
        this.loading = false;
        this.success = true;
        setTimeout(() => this.router.navigate(['/login']), 2500);
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err?.error?.message ?? "Impossible d'activer le compte.";
      },
    });
  }

  private getTokenType(token: string) {
    try {
      const payload = token.split('.')[1];
      if (!payload || typeof atob === 'undefined') {
        return '';
      }

      const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(atob(normalizedPayload));
      return decoded?.type ?? '';
    } catch {
      return '';
    }
  }

}
