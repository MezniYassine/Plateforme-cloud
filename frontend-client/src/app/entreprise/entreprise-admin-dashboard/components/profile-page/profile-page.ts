import { Component, inject, input, computed, effect, output } from '@angular/core';
import { ChangePasswordModalComponent } from '../../../../common/change-password';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { environment } from '../../../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../../services/auth-service';

const PATTERNS = {
  TAX_ID: /^\d{7,8}[a-z]\/?[mpe]\/?[anpb]\/?\d{3}$/i
};

@Component({
  selector: 'ent-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ChangePasswordModalComponent],
  templateUrl: './profile-page.html',
})

export class ProfilePageComponent {
  adminNom = input.required<string>();
  adminPrenom = input.required<string>();
  adminEmail = input.required<string>();
  companyName = input.required<string>();
  taxId = input.required<string>();
  mfaStatusInput = input<string>('DESACTIVE');

  profileUpdated = output<void>();

  adminName = computed(() => `${this.adminPrenom()} ${this.adminNom()}`);

  showPasswordModal = false;

  // --- MFA OTP ---
  mfaStatus: 'ACTIVE' | 'DESACTIVE' = 'DESACTIVE';
  mfaStep: 'idle' | 'otp-sent' | 'success' = 'idle';
  otpCode = '';
  mfaLoading = false;
  mfaError = '';

  private http = inject(HttpClient);
  fb = inject(FormBuilder);
  profileForm!: FormGroup;
  private authService = inject(AuthService);

  constructor() {
    this.profileForm = this.fb.group({
      adminNom: [''],
      adminPrenom: [''],
      adminEmail: ['', [Validators.required, Validators.email]],
      companyName: ['', Validators.required],
      taxId: ['', [Validators.required, Validators.pattern(PATTERNS.TAX_ID)]],
    });

    effect(() => {
      this.profileForm.patchValue({
        adminNom: this.adminNom(),
        adminPrenom: this.adminPrenom(),
        adminEmail: this.adminEmail(),
        companyName: this.companyName(),
        taxId: this.taxId()
      }, { emitEvent: false });

      this.mfaStatus = this.mfaStatusInput() === 'ACTIVE' ? 'ACTIVE' : 'DESACTIVE';
    });
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
      const payload = {
        nom: this.profileForm.value.adminNom,
        prenom: this.profileForm.value.adminPrenom,
        email: this.profileForm.value.adminEmail,
        nomEntreprise: this.profileForm.value.companyName,
        identifiantFiscal: this.profileForm.value.taxId
      };

      this.updateProfile(payload).subscribe({
        next: () => {
          this.showToastMessage('Profil entreprise mis à jour avec succès !', 'success');
          this.profileUpdated.emit();
        },
        error: (err) => {
          this.showToastMessage(err?.error?.message || 'Erreur lors de la mise à jour', 'error');
          console.error('Erreur update:', err);
        }
      });
    }
  }

  getInitials(name: string): string {
    return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  private updateProfile(data: any) {
    return this.http.patch(`${environment.apiBaseUrl}/users/update-profile`, data);
  }
}
