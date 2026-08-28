import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChangePasswordModalComponent } from '../../../../common/change-password';
import { environment } from '../../../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Personal } from '../../personal-dashboard-helper.service';
import { AuthService } from '../../../../services/auth-service';

@Component({
  selector: 'app-profile-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ChangePasswordModalComponent],
  templateUrl: './profile-tab.html',
  styleUrls: ['./profile-tab.scss']
})
export class ProfileTabComponent implements OnInit {
  showPasswordModal = false;
  profileForm!: FormGroup;
  isSaving = signal<boolean>(false);

  // --- MFA OTP ---
  mfaStatus: 'ACTIVE' | 'DESACTIVE' = 'DESACTIVE';
  mfaStep: 'idle' | 'otp-sent' | 'success' = 'idle';
  otpCode = '';
  mfaLoading = false;
  mfaError = '';

  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);

  @Input() actualPers: Personal | null = null;

  ngOnInit() {
    this.profileForm = this.fb.group({
      prenom: [
        this.actualPers?.client?.prenom || '',
        [Validators.required, Validators.minLength(2), Validators.maxLength(50), Validators.pattern(/^[a-zA-ZÀ-ÿ\s\-']+$/)]
      ],
      nom: [
        this.actualPers?.client?.nom || '',
        [Validators.required, Validators.minLength(2), Validators.maxLength(50), Validators.pattern(/^[a-zA-ZÀ-ÿ\s\-']+$/)]
      ],
      email: [
        this.actualPers?.client?.email || '',
        [Validators.required, Validators.email, Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)]
      ],
      telephone: [
        this.actualPers?.client?.telephone || '',
        [Validators.pattern(/^[0-9\s\-]{8,15}$/)]
      ],
      profession: [
        this.actualPers?.profession || '',
        [Validators.maxLength(100)]
      ]
    });
    // Récupérer le statut MFA actuel
    this.mfaStatus = (this.actualPers?.client as any)?.mfaStatus === 'ACTIVE' ? 'ACTIVE' : 'DESACTIVE';
  }

  isFieldInvalid(field: string): boolean {
    const control = this.profileForm.get(field);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  getFieldError(field: string): string {
    const control = this.profileForm.get(field);
    if (!control || !control.errors || !(control.dirty || control.touched)) return '';
    if (control.hasError('required')) return 'Ce champ est obligatoire.';
    if (control.hasError('minlength')) return `Minimum ${control.errors['minlength'].requiredLength} caractères requis.`;
    if (control.hasError('maxlength')) return `Maximum ${control.errors['maxlength'].requiredLength} caractères autorisés.`;
    if (control.hasError('email') || (field === 'email' && control.hasError('pattern'))) return 'Format d\'adresse email invalide.';
    if (field === 'telephone' && control.hasError('pattern')) return 'Numéro de téléphone invalide (ex: 20 000 000).';
    if ((field === 'prenom' || field === 'nom') && control.hasError('pattern')) return 'Seules les lettres, espaces et tirets sont autorisés.';
    return 'Valeur invalide.';
  }

  getInitials(): string {
    const p = (this.profileForm?.get('prenom')?.value || this.actualPers?.client?.prenom || '').trim();
    const n = (this.profileForm?.get('nom')?.value || this.actualPers?.client?.nom || '').trim();
    if (!p && !n) return 'U';
    return `${p.charAt(0)}${n.charAt(0)}`.toUpperCase();
  }

  /** Étape 1 : demander l'envoi du code OTP */
  activateMfa() {
    this.mfaLoading = true;
    this.mfaError = '';
    this.authService.sendMfaOtp().subscribe({
      next: () => {
        this.mfaStep = 'otp-sent';
        this.mfaLoading = false;
      },
      error: (err) => {
        this.mfaError = err?.error?.message || 'Erreur lors de l\'envoi du code.';
        this.mfaLoading = false;
      }
    });
  }

  /** Étape 2 : vérifier le code et activer le MFA */
  verifyOtp() {
    if (!this.otpCode || this.otpCode.length !== 6) {
      this.mfaError = 'Veuillez entrer le code à 6 chiffres.';
      return;
    }
    this.mfaLoading = true;
    this.mfaError = '';
    this.authService.verifyAndActivateMfa(this.otpCode).subscribe({
      next: () => {
        this.mfaStatus = 'ACTIVE';
        this.mfaStep = 'success';
        this.mfaLoading = false;
        this.otpCode = '';
        this.showToastMessage('Double authentification (MFA) activée avec succès !', 'success');
      },
      error: (err) => {
        this.mfaError = err?.error?.message || 'Code incorrect ou expiré.';
        this.mfaLoading = false;
      }
    });
  }

  /** Renvoyer le code OTP */
  resendOtp() {
    this.otpCode = '';
    this.mfaError = '';
    this.activateMfa();
  }

  cancelMfa() {
    this.mfaStep = 'idle';
    this.otpCode = '';
    this.mfaError = '';
  }

  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  showToast = false;

  showToastMessage(msg: string, type: 'success' | 'error') {
    this.toastMessage = msg;
    this.toastType = type;
    this.showToast = true;
    setTimeout(() => {
      this.showToast = false;
    }, 4000);
  }

  onUpdateProfile() {
    if (this.profileForm.valid && !this.isSaving()) {
      this.isSaving.set(true);
      this.updateProfile(this.profileForm.value).subscribe({
        next: () => {
          this.isSaving.set(false);
          this.showToastMessage('Profil mis à jour avec succès !', 'success');
        },
        error: (err) => {
          this.isSaving.set(false);
          this.showToastMessage(err?.error?.message || 'Erreur lors de la mise à jour', 'error');
        }
      });
    }
  }

  private updateProfile(data: any) {
    return this.http.patch(`${environment.apiBaseUrl}/users/update-profile`, data);
  }
}