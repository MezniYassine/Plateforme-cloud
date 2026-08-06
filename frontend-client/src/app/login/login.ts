import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth-service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent implements OnInit {
  pendingRole = '';
  pendingEmail = '';
  pendingStatus = '';
  showMFA = false;
  isLoading = false;
  forgotMode = false;
  forgotLoading = false;
  forgotSent = false;
  errorMsg = '';
  toastMsg = signal<{text: string, color: string} | null>(null);
  fb = inject(FormBuilder);
  auth = inject(AuthService);
  router = inject(Router);
  route = inject(ActivatedRoute);
  readonly showPassword = signal(false);

  showToast(text: string, color: string = 'var(--blue)') {
    this.toastMsg.set({ text, color });
    setTimeout(() => this.toastMsg.set(null), 4000);
  }


  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  forgotForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  ngOnInit() {
  }

  onLogin() {
    this.isLoading = true;
    this.mfaError = '';
    const val = this.loginForm.getRawValue();
    this.auth.login({ email: val.email || '', password: val.password || '' })
      .subscribe({
        next: (res) => {
          this.isLoading = false;
          if (res.requiresMFA) {
            this.pendingRole = res.user.role;
            this.pendingEmail = res.user.email || val.email || '';
            this.pendingStatus = res.user.status;
            this.showMFA = true;
            setTimeout(() => {
              (document.getElementById('otp1') as HTMLInputElement)?.focus();
            }, 100);
          } else {
            this.saveTokenAndRedirect(res.token, res.user.role, res.user.status);
          }
        },
        error: (err) => {
          this.isLoading = false;
          this.showToast(err?.error?.message || 'Incorrect Email or password .', 'var(--red)');
        }
      });
  }

  openForgotPassword() {
    const currentEmail = this.loginForm.get('email')?.value ?? '';
    this.forgotForm.patchValue({ email: currentEmail });
    this.forgotMode = true;
    this.forgotSent = false;
    this.toastMsg.set(null);
  }

  closeForgotPassword() {
    this.forgotMode = false;
    this.forgotSent = false;
    this.forgotLoading = false;
  }

  requestPasswordReset() {
    this.forgotForm.markAllAsTouched();
    if (this.forgotForm.invalid || this.forgotLoading) {
      return;
    }

    this.forgotLoading = true;
    this.toastMsg.set(null);

    const email = this.forgotForm.getRawValue().email ?? '';
    this.auth.forgotPassword(email).subscribe({
      next: () => {
        this.forgotLoading = false;
        this.forgotSent = true;
      },
      error: () => {
        this.forgotLoading = false;
        this.showToast('Unable to send reset email. Please try again.', 'var(--red)');
      },
    });
  }

  mfaError = '';
  mfaLoading = false;

  onOtpInput(event: any, index: number) {
    const input = event.target as HTMLInputElement;
    if (input.value && index < 6) {
      const nextInput = document.getElementById(`otp${index + 1}`) as HTMLInputElement;
      if (nextInput) nextInput.focus();
    }
  }

  onOtpPaste(event: ClipboardEvent) {
    event.preventDefault();
    const pastedData = event.clipboardData?.getData('text')?.trim() || '';
    if (pastedData.length === 6 && /^\d+$/.test(pastedData)) {
      for (let i = 0; i < 6; i++) {
        const input = document.getElementById(`otp${i + 1}`) as HTMLInputElement;
        if (input) input.value = pastedData[i];
      }
      (document.getElementById('otp6') as HTMLInputElement)?.focus();
    }
  }

  onVerifyMFA(code: string) {
    this.mfaLoading = true;
    this.mfaError = '';
    this.auth.verifyMFA(code, this.pendingEmail).subscribe({
      next: (res) => {
        this.mfaLoading = false;
        this.saveTokenAndRedirect(res.token, this.pendingRole, this.pendingStatus);
      },
      error: (err) => {
        this.mfaLoading = false;
        this.mfaError = err?.error?.message || 'Code OTP incorrect ou expiré.';
      }
    });
  }

  submitMFA() {
    const code = ['otp1', 'otp2', 'otp3', 'otp4', 'otp5', 'otp6']
      .map(id => (document.getElementById(id) as HTMLInputElement)?.value ?? '')
      .join('');
    if (code.length === 6) {
      this.onVerifyMFA(code);
    } else {
      this.mfaError = 'Veuillez saisir les 6 chiffres du code.';
    }
  }

  resetMFA() {
    ['otp1', 'otp2', 'otp3', 'otp4', 'otp5', 'otp6'].forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (el) el.value = '';
    });
    this.mfaError = '';
    (document.getElementById('otp1') as HTMLInputElement)?.focus();
    if (this.pendingEmail) {
      this.auth.sendLoginMfaOtp(this.pendingEmail).subscribe({
        next: () => this.showToast('Un nouveau code OTP a été envoyé à votre adresse email.', 'var(--green)'),
        error: (err) => {
          this.mfaError = err?.error?.message || 'Erreur d\'envoi de l\'OTP.';
          this.showToast(this.mfaError, 'var(--red)');
        }
      });
    }
  }

  private saveTokenAndRedirect(token: string, role?: string, status?: string) {
    this.isLoading = false;
    localStorage.setItem('access_token', token);
    if (role === 'GLOBAL_ADMIN') {
      this.router.navigate(['/admin-dashboard']);
    }
    else if (role == 'PERSONNEL' && status == 'APPROVED') {
      this.router.navigate(['/personal-dashboard']);
    }
    else if (role == 'ENTREPRISE_ADMIN' && status == 'APPROVED') {
      this.router.navigate(['/entreprise-admin-dashboard']);
    }

    else if (status == 'PENDING_VALIDATION') {
      this.router.navigate(['/pending-approval']);
    }

    else if (role == 'ENTREPRISE_USER') {
      this.router.navigate(['/entreprise-user-dashboard']);
    }

    else if (status == 'SUSPENDED') {
      console.log("Vers Suspended");
      this.router.navigate(['/suspended']);
    }

    else {
      this.router.navigate(['/console']);
    }
  }
  togglePassword() {
    this.showPassword.update(v => !v);
  }

  loginWithGoogle() {
    window.location.href = 'http://localhost:3000/auth/google';
  }

  loginWithMicrosoft() {
    window.location.href = 'http://localhost:3000/auth/microsoft';
  }
}
