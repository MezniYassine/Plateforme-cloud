import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule, AbstractControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-change-password-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <form [formGroup]="pwForm" (ngSubmit)="submit()">
        <div class="profile-field field">
        <label class="field-label">Mot de passe actuel</label>
        <input formControlName="oldPassword" type="password" placeholder="Tapez votre mot de passe actuel">
      </div>

      <div class="profile-field field">
        <label class="field-label">Nouveau mot de passe</label>
        <input formControlName="newPassword" type="password" placeholder="8+ chars, Maj, Min, @...">
        
        @if (pwForm.get('newPassword')?.touched && pwForm.get('newPassword')?.errors?.['pattern']) {
          <small style="color: #ef4444; font-size: 11px; margin-top: 4px;">
            Le mot de passe doit contenir 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial (@$!%*?&).
          </small>
        }
      </div>
      <div class="profile-field field">
        <label class="field-label">Confirmer le nouveau mot de passe</label>
        <input formControlName="confirmPassword" type="password" placeholder="Confirmez votre nouveau mot de passe">
      </div>

      <div class="modal-actions">
        <button type="button" class="btn-sm  btn " (click)="closeDialog.emit()">Annuler</button>
        <button type="submit" class="btn-sm primary btn btn-primary" [disabled]="pwForm.invalid">Vérifier et modifier</button>
      </div>
    </form>

    <!-- ══ GLOBAL TOAST ══ -->
    <div class="global-toast" [class.show]="showToast" [class.success]="toastType === 'success'" [class.error]="toastType === 'error'">
      <div class="toast-icon">
        @if (toastType === 'success') {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        } @else {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        }
      </div>
      <span>{{ toastMessage }}</span>
    </div>
  `,
  styles: [`
    .input{
      margin-top: 10px;
      padding: 10px;
    }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal-card { background: white; padding: 24px; border-radius: 12px; width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
  `]
})
export class ChangePasswordModalComponent {
  @Output() closeDialog = new EventEmitter<void>();
  @Input() role: any;
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
    if (this.pwForm.valid) {
      const data = {
        oldPassword: this.pwForm.value.oldPassword,
        newPassword: this.pwForm.value.newPassword
      };

      this.updatePassword(data).subscribe({
        next: () => {
          this.showToastMessage('Mot de passe mis à jour avec succès !', 'success');
          setTimeout(() => this.closeDialog.emit(), 2000); // Close after 2 seconds
        },
        error: (err) => {
          this.showToastMessage(err.error.message || 'Erreur lors de la mise à jour', 'error');
        }
      });
    }
  }
  close() {
    this.closeDialog.emit();
  }
  updatePassword(data: any) {
    console.log(this.role);
    if (this.role === 'Global_Admin') {
      return this.http.patch(`${environment.apiBaseUrl}/admin/update-password`, data);
    }
    else {
      return this.http.patch(`${environment.apiBaseUrl}/users/update-password`, data);
    }
  }
}