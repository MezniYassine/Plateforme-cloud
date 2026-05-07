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
  submit() {
    if (this.pwForm.valid) {
      const data = {
        oldPassword: this.pwForm.value.oldPassword,
        newPassword: this.pwForm.value.newPassword
      };

      this.updatePassword(data).subscribe({
        next: () => {
          alert('Mot de passe mis à jour avec succès !');
          this.closeDialog.emit();
        },
        error: (err) => {
          alert(err.error.message || 'Erreur lors de la mise à jour');
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