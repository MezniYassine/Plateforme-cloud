import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DashboardHelperService } from '../../dashboard-helper.service';
import { ChangePasswordModalComponent } from '../../../../common/change-password';
import { AuthService } from '../../../../services/auth-service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ChangePasswordModalComponent],
  templateUrl: './profile.html',
  styleUrls: ['./profile.scss']
})
export class Profile implements OnInit {
  state = inject(DashboardHelperService);
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private http = inject(HttpClient);

  showPasswordModal = false;
  profileForm!: FormGroup;
  isSaving = false;

  // --- MFA OTP ---
  mfaStatus: 'ACTIVE' | 'DESACTIVE' = 'DESACTIVE';
  mfaStep: 'idle' | 'otp-sent' | 'success' = 'idle';
  otpCode = '';
  mfaLoading = false;
  mfaError = '';

  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  showToast = false;

  ngOnInit() {
    const user = this.state.actualUser();

    this.profileForm = this.fb.group({
      nom: [user?.nom || '', [Validators.required, Validators.minLength(2)]],
      prenom: [user?.prenom || '', [Validators.required, Validators.minLength(2)]],
      email: [user?.email || '', [Validators.required, Validators.email]],
      telephone: [user?.telephone || '', [Validators.pattern('^[0-9]{8,15}$')]],
    });

    this.mfaStatus = user?.mfaStatus === 'ACTIVE' ? 'ACTIVE' : 'DESACTIVE';
  }

  isFieldInvalid(field: string): boolean {
    const control = this.profileForm.get(field);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  getFieldError(field: string): string {
    const control = this.profileForm.get(field);
    if (!control || !control.errors) return '';
    if (control.errors['required']) return 'Ce champ est obligatoire.';
    if (control.errors['minlength']) return `Minimum ${control.errors['minlength'].requiredLength} caractères.`;
    if (control.errors['email']) return 'Format d\'adresse email invalide.';
    if (control.errors['pattern']) return 'Numéro invalide (8 à 15 chiffres).';
    return 'Valeur invalide.';
  }

  onUpdate() {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    const formVal = this.profileForm.getRawValue();

    this.http.patch(`${environment.apiBaseUrl}/users/update-profile`, {
      nom: formVal.nom,
      prenom: formVal.prenom,
      telephone: formVal.telephone
    }).subscribe({
      next: (res: any) => {
        this.isSaving = false;
        this.showToastMessage('Profil mis à jour avec succès !', 'success');
        this.state.loadUserData();
      },
      error: (err) => {
        this.isSaving = false;
        this.showToastMessage(err?.error?.message || 'Erreur lors de la mise à jour.', 'error');
      }
    });
  }

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
        this.showToastMessage('Authentification MFA activée avec succès !', 'success');
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

  showToastMessage(msg: string, type: 'success' | 'error') {
    this.toastMessage = msg;
    this.toastType = type;
    this.showToast = true;
    setTimeout(() => this.showToast = false, 4000);
  }
}
