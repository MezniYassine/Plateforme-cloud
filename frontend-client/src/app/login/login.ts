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
  activeTab = signal<'enterprise' | 'developer'>('enterprise');
  showMFA = false;
  isLoading = false;
  errorMsg = '';
  fb = inject(FormBuilder);
  auth = inject(AuthService);
  router = inject(Router);
  route = inject(ActivatedRoute);

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  ngOnInit() {
    this.route.queryParams.subscribe((p) => {
      this.activeTab.set(p['type'] === 'developer' ? 'developer' : 'enterprise');
    });
  }

  onLogin() {
    this.isLoading = true;
    this.auth.login({ ...this.loginForm.getRawValue(), role: this.activeTab() })
      .subscribe({
        next: (res) => {
          if (res.requiresMFA) {
            this.showMFA = true;   // affiche le modal OTP
          } else {
            this.saveTokenAndRedirect(res.token);
          }
        },
        error: () => {
          this.isLoading = false;
          this.errorMsg = 'Email ou mot de passe incorrect.';
        }
      });
  }

  onVerifyMFA(code: string) {
    this.auth.verifyMFA(code).subscribe({
      next: (res) => this.saveTokenAndRedirect(res.token),
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

  switchTab(tab: 'enterprise' | 'developer') {
    this.activeTab.set(tab);
  }

  private saveTokenAndRedirect(token: string) {
    this.isLoading = false;
    localStorage.setItem('access_token', token);
    this.router.navigate(['/console']);
  }
}
