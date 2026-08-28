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
  focusedField = '';
  cardTransform = 'rotateX(0deg) rotateY(0deg)';
  tiles: { glow: boolean }[] = [];

  onMouseMove(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    this.cardTransform = `rotateX(${-dy * 8}deg) rotateY(${dx * 8}deg)`;
  }

  onMouseLeave() {
    this.cardTransform = 'rotateX(0deg) rotateY(0deg)';
  }

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
    if (typeof window !== 'undefined') {
      const cols = Math.ceil(window.innerWidth / 79) + 2;
      const rows = Math.ceil(window.innerHeight / 79) + 2;
      const total = cols * rows;
      this.tiles = Array.from({ length: total }, () => ({
        glow: Math.random() < 0.08
      }));
    }
  }

  onLogin() {
    this.isLoading = true;
    this.errorMsg = '';
    this.mfaError = '';
    const val = this.loginForm.getRawValue();
    this.auth.login({ email: val.email || '', password: val.password || '' })
      .subscribe({
        next: (res) => {
          this.isLoading = false;
          const userStatus = res.user?.status;
          const userRole = res.user?.role;

          // Si le compte est en attente de validation ou non activé
          if (userStatus === 'PENDING_VALIDATION') {
            this.saveTokenAndRedirect(res.token, userRole, 'PENDING_VALIDATION');
            return;
          }
          if (userStatus === 'SUSPENDED') {
            this.saveTokenAndRedirect(res.token, userRole, 'SUSPENDED');
            return;
          }

          if (res.requiresMFA) {
            this.pendingRole = userRole;
            this.pendingEmail = res.user?.email || val.email || '';
            this.pendingStatus = userStatus;
            this.showMFA = true;
            setTimeout(() => {
              (document.getElementById('otp1') as HTMLInputElement)?.focus();
            }, 100);
          } else {
            this.saveTokenAndRedirect(res.token, userRole, userStatus);
          }
        },
        error: (err) => {
          this.isLoading = false;
          const msg = err?.error?.message || 'E-mail ou mot de passe incorrect.';
          if (msg.includes('Activation du compte') || msg.includes('attente de validation')) {
            this.router.navigate(['/pending-approval']);
            return;
          }
          this.errorMsg = msg;
          this.showToast(msg, 'var(--red)');
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

    if (status === 'PENDING_VALIDATION') {
      this.router.navigate(['/pending-approval']);
      return;
    }

    if (status === 'SUSPENDED') {
      this.router.navigate(['/suspended']);
      return;
    }

    if (role === 'GLOBAL_ADMIN') {
      this.router.navigate(['/admin-dashboard']);
    }
    else if (role === 'PERSONNEL' && status === 'APPROVED') {
      this.router.navigate(['/personal-dashboard']);
    }
    else if (role === 'ENTREPRISE_ADMIN' && status === 'APPROVED') {
      this.router.navigate(['/entreprise-admin-dashboard']);
    }
    else if (role === 'ENTREPRISE_USER' && status === 'APPROVED') {
      this.router.navigate(['/entreprise-user-dashboard']);
    }
    else if (status !== 'APPROVED') {
      this.router.navigate(['/pending-approval']);
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
