import { Component, Input, OnInit, inject } from '@angular/core';
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
})
export class ProfileTabComponent implements OnInit {
  showPasswordModal = false;
  profileForm!: FormGroup;

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
      prenom: [this.actualPers?.client?.prenom || '', [Validators.required]],
      nom: [this.actualPers?.client?.nom || '', [Validators.required]],
      email: [this.actualPers?.client?.email || '', [Validators.required, Validators.email]],
      profession: [this.actualPers?.profession || '']
    });
    // Récupérer le statut MFA actuel
    this.mfaStatus = (this.actualPers?.client as any)?.mfaStatus === 'ACTIVE' ? 'ACTIVE' : 'DESACTIVE';
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
    if (this.profileForm.valid) {
      this.updateProfile(this.profileForm.value).subscribe({
        next: () => this.showToastMessage('Profil mis à jour avec succès !', 'success'),
        error: (err) => this.showToastMessage(err.error.message || 'Erreur lors de la mise à jour', 'error')
      });
    }
  }

  private updateProfile(data: any) {
    return this.http.patch(`${environment.apiBaseUrl}/users/update-profile`, data);
  }
}