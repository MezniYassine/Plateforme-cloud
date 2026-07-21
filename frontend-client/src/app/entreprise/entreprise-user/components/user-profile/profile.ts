import { Component, inject, OnInit } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ChangePasswordModalComponent } from '../../../../common/change-password';
import { AuthService } from '../../../../services/auth-service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ChangePasswordModalComponent],
  templateUrl: './profile.html',
})
export class Profile implements OnInit {
  constructor(public state: DashboardHelperService) { }
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);

  showPasswordModal = false;
  profileForm!: FormGroup;

  // --- MFA OTP ---
  mfaStatus: 'ACTIVE' | 'DESACTIVE' = 'DESACTIVE';
  mfaStep: 'idle' | 'otp-sent' | 'success' = 'idle';
  otpCode = '';
  mfaLoading = false;
  mfaError = '';

  ngOnInit() {
    const user = this.state.actualUser();

    this.profileForm = this.fb.group({
      nom: [user?.nom, Validators.required],
      prenom: [user?.prenom, Validators.required],
      email: [user?.email, [Validators.required, Validators.email]],
      password: [''],
    });

    // Lire le statut MFA depuis l'utilisateur actuel
    this.mfaStatus = (user as any)?.mfaStatus === 'ACTIVE' ? 'ACTIVE' : 'DESACTIVE';
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

  /** Étape 2 : vérifier le code OTP et activer le MFA */
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

  onUpdate() {
    if (this.profileForm.valid) {
      const updatedData = this.profileForm.value;

      if (!updatedData.password) {
        delete updatedData.password;
      }

      this.state.updateProfile(updatedData).subscribe({
        next: (res) => {
          this.showToastMessage('Profil mis à jour avec succès !', 'success');
          this.state.loadUserData();
        },
        error: (err) => {
          this.showToastMessage(err?.error?.message || 'Erreur lors de la mise à jour', 'error');
          console.error(err);
        }
      });
    }
  }
}
