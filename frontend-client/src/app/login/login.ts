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
            this.showMFA = true;   // affiche le modal OTP
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

    else {
      this.router.navigate(['/console']);
    }
  }
  togglePassword() {
    this.showPassword.update(v => !v);
  }

}
