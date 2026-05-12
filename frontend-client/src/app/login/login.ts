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
  showMFA = false;
  isLoading = false;
  forgotMode = false;
  forgotLoading = false;
  forgotSent = false;
  errorMsg = '';
  fb = inject(FormBuilder);
  auth = inject(AuthService);
  router = inject(Router);
  route = inject(ActivatedRoute);
  readonly showPassword = signal(false);


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
    const val = this.loginForm.getRawValue();
    this.auth.login({ email: val.email || '', password: val.password || '' })
      .subscribe({
        next: (res) => {
          if (res.requiresMFA) {
            this.pendingRole = res.user.role;
            this.showMFA = true;
          } else {
            this.saveTokenAndRedirect(res.token, res.user.role, res.user.status);
          }
        },
        error: () => {
          this.isLoading = false;
          this.errorMsg = 'Incorrect Email or password .';
          setTimeout(() => {
            this.errorMsg = '';
          }, 4000);
        }
      });
    console.log(this.loginForm.value);
  }

  openForgotPassword() {
    const currentEmail = this.loginForm.get('email')?.value ?? '';
    this.forgotForm.patchValue({ email: currentEmail });
    this.forgotMode = true;
    this.forgotSent = false;
    this.errorMsg = '';
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
    this.errorMsg = '';

    const email = this.forgotForm.getRawValue().email ?? '';
    this.auth.forgotPassword(email).subscribe({
      next: () => {
        this.forgotLoading = false;
        this.forgotSent = true;
      },
      error: () => {
        this.forgotLoading = false;
        this.errorMsg = 'Unable to send reset email. Please try again.';
        setTimeout(() => {
          this.errorMsg = '';
        }, 4000);
      },
    });
  }

  onVerifyMFA(code: string) {
    this.auth.verifyMFA(code).subscribe({
      next: (res) => this.saveTokenAndRedirect(res.token, this.pendingRole),
    });
  }

  submitMFA() {
    const code = ['otp1', 'otp2', 'otp3', 'otp4', 'otp5', 'otp6']
      .map(id => (document.getElementById(id) as HTMLInputElement)?.value ?? '')
      .join('');
    if (code.length === 6) this.onVerifyMFA(code);
  }

  resetMFA() {
    ['otp1', 'otp2', 'otp3', 'otp4', 'otp5', 'otp6'].forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (el) el.value = '';
    });
    (document.getElementById('otp1') as HTMLInputElement)?.focus();
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
