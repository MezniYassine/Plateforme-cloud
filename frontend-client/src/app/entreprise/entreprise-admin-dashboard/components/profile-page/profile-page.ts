import { Component, inject, input, computed, effect, output } from '@angular/core';
import { ChangePasswordModalComponent } from '../../../../common/change-password';
import { AbstractControl, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { environment } from '../../../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../../services/auth-service';

// --- Regex Patterns & Custom Validators ---
const PATTERNS = {
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  PHONE: /^(?:\+216\s?)?[2459]\d{7}$|^[0-9\s+.\-()]{8,15}$/,
  NAME: /^[a-zA-ZÀ-ÿ\s\-']+$/,
  TAX_ID: /^\d{7,8}[a-z]\/?[mpe]\/?[anpb]\/?\d{3}$/i
};

function noWhitespaceValidator(control: AbstractControl): ValidationErrors | null {
  const isWhitespace = (control.value || '').toString().trim().length === 0;
  return !isWhitespace ? null : { whitespace: true };
}

@Component({
  selector: 'ent-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ChangePasswordModalComponent],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePageComponent {
  adminNom = input.required<string>();
  adminPrenom = input.required<string>();
  adminEmail = input.required<string>();
  adminTelephone = input<string>('');
  companyName = input.required<string>();
  companySize = input<string>('');
  taxId = input.required<string>();
  mfaStatusInput = input<string>('DESACTIVE');

  profileUpdated = output<void>();

  adminName = computed(() => `${this.adminPrenom()} ${this.adminNom()}`);

  readonly companySizes = [
    { value: '1-10', label: '1 - 10 employés (Startup / TPE)' },
    { value: '11-50', label: '11 - 50 employés (PME)' },
    { value: '51-250', label: '51 - 250 employés (Moyenne entreprise)' },
    { value: '250+', label: '250+ employés (Grande entreprise / Corporation)' }
  ];

  showPasswordModal = false;
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

  private http = inject(HttpClient);
  fb = inject(FormBuilder);
  profileForm!: FormGroup;
  private authService = inject(AuthService);

  constructor() {
    this.profileForm = this.fb.group({
      adminPrenom: ['', [Validators.required, noWhitespaceValidator, Validators.minLength(2), Validators.maxLength(50), Validators.pattern(PATTERNS.NAME)]],
      adminNom: ['', [Validators.required, noWhitespaceValidator, Validators.minLength(2), Validators.maxLength(50), Validators.pattern(PATTERNS.NAME)]],
      adminEmail: ['', [Validators.required, noWhitespaceValidator, Validators.pattern(PATTERNS.EMAIL), Validators.maxLength(100)]],
      adminTelephone: ['', [Validators.required, noWhitespaceValidator, Validators.pattern(PATTERNS.PHONE)]],
      companyName: ['', [Validators.required, noWhitespaceValidator, Validators.minLength(2), Validators.maxLength(100)]],
      companySize: ['', [Validators.required]],
      taxId: ['', [Validators.required, noWhitespaceValidator, Validators.pattern(PATTERNS.TAX_ID)]],
    });

    effect(() => {
      this.profileForm.patchValue({
        adminNom: this.adminNom(),
        adminPrenom: this.adminPrenom(),
        adminEmail: this.adminEmail(),
        adminTelephone: this.adminTelephone(),
        companyName: this.companyName(),
        companySize: this.companySize() || '1-10',
        taxId: this.taxId()
      }, { emitEvent: false });

      this.mfaStatus = this.mfaStatusInput() === 'ACTIVE' ? 'ACTIVE' : 'DESACTIVE';
    });
  }

  isFieldInvalid(field: string): boolean {
    const control = this.profileForm.get(field);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  getFieldError(field: string): string {
    const control = this.profileForm.get(field);
    if (!control || !control.errors) return '';

    if (control.errors['required'] || control.errors['whitespace']) {
      switch (field) {
        case 'adminPrenom': return 'Le prénom est obligatoire.';
        case 'adminNom': return 'Le nom est obligatoire.';
        case 'adminEmail': return 'L\'adresse email est obligatoire.';
        case 'adminTelephone': return 'Le numéro de téléphone est obligatoire.';
        case 'companyName': return 'La raison sociale est obligatoire.';
        case 'companySize': return 'Veuillez sélectionner la taille de l\'entreprise.';
        case 'taxId': return 'Le matricule fiscal est obligatoire.';
        default: return 'Ce champ est obligatoire.';
      }
    }

    if (control.errors['minlength']) {
      return `Minimum ${control.errors['minlength'].requiredLength} caractères requis.`;
    }

    if (control.errors['maxlength']) {
      return `Maximum ${control.errors['maxlength'].requiredLength} caractères autorisés.`;
    }

    if (control.errors['pattern']) {
      switch (field) {
        case 'adminPrenom':
        case 'adminNom':
          return 'Caractères alphabétiques uniquement (lettres, espaces, tirets).';
        case 'adminEmail':
          return 'Format d\'email invalide (ex: admin@entreprise.tn).';
        case 'adminTelephone':
          return 'Format invalide (ex: +216 20 123 456 ou 8 chiffres).';
        case 'taxId':
          return 'Format matricule fiscal invalide (ex: 1234567M/A/M/000).';
        default:
          return 'Format non valide.';
      }
    }

    return 'Valeur invalide.';
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
        this.showToastMessage('Double authentification (MFA) activée avec succès !', 'success');
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
    setTimeout(() => {
      this.showToast = false;
    }, 4000);
  }

  onUpdate() {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      this.showToastMessage('Veuillez corriger les erreurs dans le formulaire.', 'error');
      return;
    }

    this.isSaving = true;
    const formVal = this.profileForm.getRawValue();

    const payload = {
      nom: formVal.adminNom?.trim(),
      prenom: formVal.adminPrenom?.trim(),
      email: formVal.adminEmail?.trim(),
      telephone: formVal.adminTelephone?.trim(),
      nomEntreprise: formVal.companyName?.trim(),
      tailleEntreprise: formVal.companySize,
      identifiantFiscal: formVal.taxId?.trim()
    };

    this.http.patch(`${environment.apiBaseUrl}/users/update-profile`, payload).subscribe({
      next: () => {
        this.isSaving = false;
        this.showToastMessage('Profil entreprise mis à jour avec succès !', 'success');
        this.profileUpdated.emit();
      },
      error: (err) => {
        this.isSaving = false;
        this.showToastMessage(err?.error?.message || 'Erreur lors de la mise à jour', 'error');
      }
    });
  }

  onPasswordChanged() {
    this.showPasswordModal = false;
    this.showToastMessage('Mot de passe modifié avec succès !', 'success');
  }

  getInitials(name: string): string {
    return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }
}

