import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { finalize } from 'rxjs';
import { AuthService } from '../services/auth-service';

// --- Regex Patterns ---
const PATTERNS = {
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#+=_\-])[A-Za-z\d@$!%*?&#+=_\-]{8,}$/,
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  TAX_ID: /^\d{7,8}[a-z]\/?[mpe]\/?[anpb]\/?\d{3}$/i
};

// --- Custom Validators ---
function noWhitespaceValidator(control: AbstractControl): ValidationErrors | null {
  const isWhitespace = (control.value || '').trim().length === 0;
  return !isWhitespace ? null : { whitespace: true };
}

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './sign-up.html',
  styleUrl: './sign-up.scss',
})
export class SignupComponent implements OnInit {
  readonly activeTab = signal<'enterprise' | 'personal'>('enterprise');
  readonly toast = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly passwordFocused = signal(false);

  private toastHide = 0;

  enterpriseForm: FormGroup;
  personalForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService
  ) {
    this.enterpriseForm = this.fb.group({
      companyName: ['', [Validators.required, noWhitespaceValidator, Validators.maxLength(100)]],
      taxId: ['', [Validators.required, Validators.pattern(PATTERNS.TAX_ID)]],
      // Champ 'createdAt' supprimé : la base de données s'en charge !
      firstName: ['', [Validators.required, noWhitespaceValidator, Validators.maxLength(50)]],
      lastName: ['', [Validators.required, noWhitespaceValidator, Validators.maxLength(50)]],
      email: ['', [Validators.required, Validators.pattern(PATTERNS.EMAIL), Validators.maxLength(100)]],
      password: ['', [Validators.required, Validators.pattern(PATTERNS.PASSWORD), Validators.maxLength(128)]],
      confirmPass: ['', Validators.required],
    }, { validators: this.passwordMatchValidator });

    this.personalForm = this.fb.group({
      firstName: ['', [Validators.required, noWhitespaceValidator, Validators.maxLength(50)]],
      lastName: ['', [Validators.required, noWhitespaceValidator, Validators.maxLength(50)]],
      email: ['', [Validators.required, Validators.pattern(PATTERNS.EMAIL), Validators.maxLength(100)]],
      password: ['', [Validators.required, Validators.pattern(PATTERNS.PASSWORD), Validators.maxLength(128)]],
      confirmPass: ['', Validators.required],
      profession: ['', [Validators.required, noWhitespaceValidator, Validators.maxLength(255)]],
    }, { validators: this.passwordMatchValidator });
  }

  ngOnInit() {
    this.route.queryParams.subscribe((p) => {
      this.activeTab.set(p['type'] === 'personal' ? 'personal' : 'enterprise');
    });
  }

  private passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
    const pass = group.get('password')?.value;
    const confirmPass = group.get('confirmPass')?.value;
    if (!pass || !confirmPass) return null;
    return pass === confirmPass ? null : { passwordMismatch: true };
  }

  switchTab(tab: 'enterprise' | 'personal') {
    this.activeTab.set(tab);
    this.passwordFocused.set(false);
    this.toast.set(null);
    void this.router.navigate(['/signup'], {
      queryParams: { type: tab },
      replaceUrl: true,
    });
  }

  togglePassword() {
    this.showPassword.update(v => !v);
  }

  toggleConfirmPassword() {
    this.showConfirmPassword.update(v => !v);
  }

  get password() {
    return this.activeForm.get('password')?.value ?? '';
  }

  get rules() {
    const password = this.password;
    return {
      len: password.length >= 8,
      upper: /[A-Z]/.test(password),
      num: /[0-9]/.test(password),
      special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
    };
  }

  get passwordScore() {
    return Object.values(this.rules).filter(Boolean).length;
  }

  get strengthLabel() {
    return ['', 'Faible', 'Moyen', 'Fort', 'Tres fort'][this.passwordScore] || '';
  }

  private get activeForm() {
    return this.activeTab() === 'enterprise' ? this.enterpriseForm : this.personalForm;
  }

  private flashToast(message: string, ms = 6000) {
    clearTimeout(this.toastHide);
    this.toast.set(message);
    this.toastHide = window.setTimeout(() => {
      if (this.toast() === message) this.toast.set(null);
    }, ms);
  }

  // ==========================================
  // ENTERPRISE SUBMISSION
  // ==========================================
  onSubmitEnterprise() {
    const c = this.enterpriseForm.controls;
    this.enterpriseForm.markAllAsTouched();

    if (c['companyName'].invalid) return this.flashToast("Company name is required and must be valid.");
    if (c['taxId'].invalid) {
      return this.flashToast(c['taxId'].hasError('pattern') ? 'Invalid Tax ID. Expected format: 1234567A/M/A/000' : 'Tax ID is required.');
    }
    if (c['firstName'].invalid) return this.flashToast("Administrator's first name is required.");
    if (c['lastName'].invalid) return this.flashToast("Administrator's last name is required.");
    if (c['email'].invalid) return this.flashToast("Email address is invalid or missing.");
    if (c['password'].invalid) return this.flashToast('Password must contain 8+ characters, 1 uppercase, 1 lowercase, 1 number, and 1 special character.', 8000);
    if (c['confirmPass'].invalid || this.enterpriseForm.hasError('passwordMismatch')) return this.flashToast('Passwords do not match.');

    if (this.submitting()) return;
    this.submitting.set(true);
    this.toast.set('Sending registration...');

    const { confirmPass, ...body } = this.enterpriseForm.value;

    this.auth.registerEnterprise(body)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          this.toast.set(null);
          void this.router.navigate(['/pending-approval'], { state: { fromSignup: true } });
        },
        error: (err: any) => {
          console.error(err);
          if (err.status === 409) {
            const apiMsg = err.error?.message || '';
            if (apiMsg.toLowerCase().includes('tax id')) this.flashToast('This Tax ID is already in use.', 8000);
            else if (apiMsg.toLowerCase().includes('email')) this.flashToast('This email is already used by another account.', 8000);
            else this.flashToast(apiMsg || 'This information is already in use.', 8000);
          } else {
            this.flashToast('Registration failed. Please check the server connection.', 8000);
          }
        },
      });
  }

  // ==========================================
  // PERSONAL SUBMISSION
  // ==========================================
  onSubmitPersonal() {
    const c = this.personalForm.controls;
    this.personalForm.markAllAsTouched();

    if (c['firstName'].invalid) return this.flashToast('Your first name is required and must be valid.');
    if (c['lastName'].invalid) return this.flashToast('Your last name is required and must be valid.');
    if (c['email'].invalid) return this.flashToast("Email address is invalid or missing.");
    if (c['password'].invalid) return this.flashToast('Password must contain 8+ characters, 1 uppercase, 1 lowercase, 1 number, and 1 special character.', 8000);
    if (c['confirmPass'].invalid || this.personalForm.hasError('passwordMismatch')) return this.flashToast('Passwords do not match.');
    if (c['profession'].invalid) return this.flashToast('Please provide your profession.');

    if (this.submitting()) return;
    this.submitting.set(true);
    this.toast.set('Sending registration...');

    const { confirmPass, ...body } = this.personalForm.value;

    this.auth.registerPersonal(body)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          this.toast.set(null);
          void this.router.navigate(['/pending-approval'], { state: { fromSignup: true } });
        },
        error: (err: any) => {
          console.error(err);
          if (err.status === 409) {
            const apiMsg = err.error?.message || '';
            if (apiMsg.toLowerCase().includes('email')) this.flashToast('This email is already used by another account.', 8000);
            else this.flashToast(apiMsg || 'This information is already in use.', 8000);
          } else {
            this.flashToast('Registration failed. Please check the server connection.', 8000);
          }
        },
      });
  }
  loginWithGoogle() {
    window.location.href = 'http://localhost:3000/auth/google';
  }

  loginWithMicrosoft() {
    window.location.href = 'http://localhost:3000/auth/microsoft';
  }
}
