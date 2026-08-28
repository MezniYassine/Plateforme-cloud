import { Component, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule, AbstractControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-change-password-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="modal-backdrop" (click)="close()">
      <div class="modal-card" (click)="$event.stopPropagation()">
        
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="header-icon-box">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div class="header-texts">
            <h3 class="modal-title">Modifier le mot de passe</h3>
            <p class="modal-subtitle">Définissez un nouveau mot de passe robuste pour sécuriser votre compte.</p>
          </div>
          <button type="button" class="btn-close-modal" (click)="close()">✕</button>
        </div>

        <!-- Form Body -->
        <form [formGroup]="pwForm" (ngSubmit)="submit()" class="modal-form">
          
          <!-- Mot de passe actuel -->
          <div class="input-wrap">
            <label class="input-label">Mot de passe actuel <span class="req-star">*</span></label>
            <div class="input-control" [class.is-invalid]="isInvalid('oldPassword')">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#94a3b8" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                [type]="showOld() ? 'text' : 'password'"
                formControlName="oldPassword"
                placeholder="Votre mot de passe actuel"
              />
              <button type="button" class="btn-toggle-eye" (click)="showOld.set(!showOld())" [title]="showOld() ? 'Masquer' : 'Afficher'">
                @if (showOld()) {
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                } @else {
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
            @if (isInvalid('oldPassword')) {
              <span class="err-text">Le mot de passe actuel est requis.</span>
            }
          </div>

          <!-- Nouveau mot de passe -->
          <div class="input-wrap">
            <label class="input-label">Nouveau mot de passe <span class="req-star">*</span></label>
            <div class="input-control" [class.is-invalid]="isInvalid('newPassword')">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#94a3b8" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <input
                [type]="showNew() ? 'text' : 'password'"
                formControlName="newPassword"
                placeholder="8+ car., Maj, Min, Chiffre, Spécial"
              />
              <button type="button" class="btn-toggle-eye" (click)="showNew.set(!showNew())" [title]="showNew() ? 'Masquer' : 'Afficher'">
                @if (showNew()) {
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                } @else {
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
            @if (isInvalid('newPassword')) {
              <span class="err-text">
                8+ caractères, au moins une majuscule, une minuscule, un chiffre et un symbole.
              </span>
            }
          </div>

          <!-- Confirmer le mot de passe -->
          <div class="input-wrap">
            <label class="input-label">Confirmer le nouveau mot de passe <span class="req-star">*</span></label>
            <div class="input-control" [class.is-invalid]="isInvalid('confirmPassword') || (pwForm.hasError('mismatch') && pwForm.get('confirmPassword')?.touched)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#94a3b8" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <input
                [type]="showConfirm() ? 'text' : 'password'"
                formControlName="confirmPassword"
                placeholder="Retapez le nouveau mot de passe"
              />
              <button type="button" class="btn-toggle-eye" (click)="showConfirm.set(!showConfirm())" [title]="showConfirm() ? 'Masquer' : 'Afficher'">
                @if (showConfirm()) {
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                } @else {
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
            @if (pwForm.hasError('mismatch') && pwForm.get('confirmPassword')?.touched) {
              <span class="err-text">Les mots de passe ne correspondent pas.</span>
            }
          </div>

          <!-- Modal Actions -->
          <div class="modal-actions">
            <button type="button" class="btn-cancel" (click)="close()">
              Annuler
            </button>
            <button type="submit" class="btn-save" [disabled]="pwForm.invalid || isSubmitting">
              @if (isSubmitting) {
                <span class="spinner-mini"></span>
                <span>Enregistrement...</span>
              } @else {
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>Mettre à jour</span>
              }
            </button>
          </div>

        </form>

      </div>
    </div>

    <!-- ══ GLOBAL TOAST ══ -->
    <div class="modal-toast" [class.show]="showToast" [class.success]="toastType === 'success'" [class.error]="toastType === 'error'">
      <div class="toast-icon">
        @if (toastType === 'success') {
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        } @else {
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        }
      </div>
      <span>{{ toastMessage }}</span>
    </div>
  `,
  styles: [`
    /* ══════════════════ MODAL BACKDROP & CARD ══════════════════ */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      padding: 16px;
      animation: fadeInBackdrop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes fadeInBackdrop {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .modal-card {
      background: #ffffff;
      border: 1.5px solid #e2e8f0;
      border-radius: 24px;
      width: 100%;
      max-width: 490px;
      box-shadow: 0 24px 48px -12px rgba(15, 23, 42, 0.25);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif !important;
      animation: scaleUpCard 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes scaleUpCard {
      from { transform: scale(0.94) translateY(10px); opacity: 0; }
      to { transform: scale(1) translateY(0); opacity: 1; }
    }

    /* ══════════════════ HEADER ══════════════════ */
    .modal-header {
      padding: 22px 26px;
      background: #ffffff;
      border-bottom: 1px solid #f1f5f9;
      display: flex;
      align-items: flex-start;
      gap: 14px;
      position: relative;
    }

    .header-icon-box {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: #fff7ed;
      color: #ea580c;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border: 1.5px solid #fed7aa;
    }

    .header-texts {
      display: flex;
      flex-direction: column;
      gap: 3px;
      flex: 1;
    }

    .modal-title {
      font-size: 16.5px;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
      letter-spacing: -0.01em;
    }

    .modal-subtitle {
      font-size: 12.5px;
      color: #64748b;
      margin: 0;
      line-height: 1.4;
    }

    .btn-close-modal {
      border: none;
      background: #e2e8f0;
      color: #64748b;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;

      &:hover {
        background: #cbd5e1;
        color: #0f172a;
      }
    }

    /* ══════════════════ FORM & CONTROLS ══════════════════ */
    .modal-form {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .input-wrap {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .input-label {
      font-size: 12px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .input-control {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 44px;
      background: #f8fafc;
      border: 1.5px solid #e2e8f0;
      border-radius: 12px;
      padding: 0 12px;
      transition: all 0.2s ease;

      svg {
        flex-shrink: 0;
        transition: color 0.2s ease;
      }

      input {
        border: none;
        outline: none;
        background: transparent;
        font-size: 13px;
        font-weight: 600;
        color: #0f172a;
        width: 100%;
        height: 100%;
        font-family: inherit;

        &::placeholder {
          color: #94a3b8;
          font-weight: 400;
        }
      }

      &:focus-within {
        background: #ffffff;
        border-color: #F07A1F;
        box-shadow: 0 0 0 3px rgba(240, 122, 31, 0.14);

        svg {
          color: #F07A1F;
        }
      }

      &.is-invalid {
        border-color: #ef4444 !important;
        background: #fef2f2;

        svg {
          color: #ef4444 !important;
        }

        &:focus-within {
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15) !important;
        }
      }
    }

    .btn-toggle-eye {
      border: none;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s ease;

      &:hover {
        color: #0f172a;
      }
    }

    .err-text {
      font-size: 11.5px;
      color: #dc2626;
      font-weight: 600;
      margin-top: 2px;
    }

    /* ══════════════════ ACTIONS ══════════════════ */
    .modal-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 8px;
      padding-top: 16px;
      border-top: 1px solid #f1f5f9;
    }

    .btn-cancel {
      border: 1px solid #e2e8f0;
      background: #ffffff;
      color: #64748b;
      font-size: 13px;
      font-weight: 700;
      padding: 10px 18px;
      border-radius: 11px;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: #f8fafc;
        color: #0f172a;
        border-color: #cbd5e1;
      }
    }

    .btn-save {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, #F07A1F 0%, #EA580C 100%);
      color: #ffffff;
      border: none;
      font-size: 13px;
      font-weight: 700;
      padding: 10px 20px;
      border-radius: 11px;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(240, 122, 31, 0.35);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

      &:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(240, 122, 31, 0.45);
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        box-shadow: none;
      }
    }

    .spinner-mini {
      width: 14px;
      height: 14px;
      border: 2px solid #ffffff;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spinMini 0.8s linear infinite;
    }

    @keyframes spinMini {
      to { transform: rotate(360deg); }
    }

    /* ══════════════════ MODAL TOAST ══════════════════ */
    .modal-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 18px;
      border-radius: 12px;
      background: #0f172a;
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
      transform: translateY(100px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 100000;

      &.show {
        transform: translateY(0);
        opacity: 1;
      }

      &.success { background: #059669; }
      &.error { background: #dc2626; }
    }
  `]
})
export class ChangePasswordModalComponent {
  @Output('close') closeEvent = new EventEmitter<void>();
  @Output('closeDialog') closeDialogEvent = new EventEmitter<void>();
  @Output('passwordChanged') passwordChangedEvent = new EventEmitter<void>();
  @Input() role: any;

  showOld = signal<boolean>(false);
  showNew = signal<boolean>(false);
  showConfirm = signal<boolean>(false);
  isSubmitting = false;

  private fb = inject(FormBuilder);
  private http = inject(HttpClient);

  passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[~@#$%^&*!+=?._-])[A-Za-z\d~@#$%^&*!+=?._-]{8,}$/;

  pwForm = this.fb.group({
    oldPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.pattern(this.passwordPattern)]],
    confirmPassword: ['', Validators.required]
  }, { validators: this.confirmPasswordMatchValidator });

  confirmPasswordMatchValidator(group: AbstractControl) {
    const newPassword = group.get('newPassword')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    return newPassword === confirmPassword ? null : { mismatch: true };
  }

  isInvalid(field: string): boolean {
    const control = this.pwForm.get(field);
    return !!(control && control.invalid && (control.dirty || control.touched));
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

  submit() {
    if (this.pwForm.valid && !this.isSubmitting) {
      this.isSubmitting = true;
      const data = {
        oldPassword: this.pwForm.value.oldPassword,
        newPassword: this.pwForm.value.newPassword
      };

      this.updatePassword(data).subscribe({
        next: () => {
          this.isSubmitting = false;
          this.showToastMessage('Mot de passe mis à jour avec succès !', 'success');
          this.passwordChangedEvent.emit();
          setTimeout(() => {
            this.close();
          }, 1400);
        },
        error: (err) => {
          this.isSubmitting = false;
          this.showToastMessage(err?.error?.message || 'Erreur lors de la mise à jour', 'error');
        }
      });
    }
  }

  close() {
    this.closeEvent.emit();
    this.closeDialogEvent.emit();
  }

  updatePassword(data: any) {
    if (this.role === 'Global_Admin') {
      return this.http.patch(`${environment.apiBaseUrl}/admin/update-password`, data);
    } else {
      return this.http.patch(`${environment.apiBaseUrl}/users/update-password`, data);
    }
  }
}