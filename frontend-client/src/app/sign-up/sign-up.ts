import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth-service';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './sign-up.html',
  styleUrl: './sign-up.scss',
})
export class SignupComponent implements OnInit {
  /** Signal keeps tab UI in sync (avoids issues with hydration / invalid nested document templates). */
  readonly activeTab = signal<'enterprise' | 'developer'>('enterprise');

  /** User-visible feedback (the old static toast never toggled `.show` after removing inline scripts). */
  readonly toast = signal<string | null>(null);
  readonly submitting = signal(false);

  private toastHide = 0;

  enterpriseForm: FormGroup;
  developerForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService
  ) {
    this.enterpriseForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      companyName: ['', Validators.required],
      taxId: ['', Validators.required],
      createdAt: ['', Validators.required],
    });

    this.developerForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPass: ['', Validators.required],
      techStack: [''],
    });
  }

  ngOnInit() {
    this.route.queryParams.subscribe((p) => {
      this.activeTab.set(p['type'] === 'developer' ? 'developer' : 'enterprise');
    });
  }

  switchTab(tab: 'enterprise' | 'developer') {
    this.activeTab.set(tab);
    this.toast.set(null);
    void this.router.navigate(['/signup'], {
      queryParams: { type: tab },
      replaceUrl: true,
    });
  }

  private flashToast(message: string, ms = 5000) {
    clearTimeout(this.toastHide);
    this.toast.set(message);
    this.toastHide = window.setTimeout(() => {
      if (this.toast() === message) this.toast.set(null);
    }, ms);
  }

  onSubmitEnterprise() {
    if (this.enterpriseForm.invalid) {
      this.enterpriseForm.markAllAsTouched();
      this.flashToast(
        'Please complete all fields: password at least 8 characters, and pick a company creation date.',
        6000,
      );
      return;
    }
    if (this.submitting()) return;

    this.submitting.set(true);
    this.toast.set('Sending registration…');
    const body = this.enterpriseForm.value as Record<string, unknown>;
    this.auth
      .registerEnterprise(body)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          this.toast.set(null);
          void this.router.navigate(['/pending-approval']);
        },
        error: (err: unknown) => {
          console.error(err);
          this.flashToast(
            'Request failed. Start the API (backend-main on port 3000) and use `ng serve` so /api is proxied.',
            8000,
          );
        },
      });
  }

  onSubmitDeveloper() {
    if (this.developerForm.invalid) {
      this.developerForm.markAllAsTouched();
      this.flashToast(
        'Please complete all fields: password at least 8 characters, and confirm password.',
        6000,
      );
      return;
    }
    if (this.submitting()) return;

    this.submitting.set(true);
    this.toast.set('Sending registration…');
    const body = this.developerForm.value as Record<string, unknown>;
    this.auth
      .registerDeveloper(body)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          this.toast.set(null);
          void this.router.navigate(['/console']);
        },
        error: (err: unknown) => {
          console.error(err);
          this.flashToast(
            'Request failed. Start the API (backend-main on port 3000) and use `ng serve` so /api is proxied.',
            8000,
          );
        },
      });
  }
}