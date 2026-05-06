import { Component, EventEmitter, inject, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DashboardHelperService } from './dashboard-helper.service';

@Component({
  selector: 'app-change-password-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <form [formGroup]="pwForm" (ngSubmit)="submit()">
        <div class="profile-field">
        <label>Mot de passe actuel</label>
        <input formControlName="oldPassword" type="password" placeholder="Tapez votre mot de passe actuel">
      </div>

      <div class="profile-field">
        <label>Nouveau mot de passe</label>
        <input formControlName="newPassword" type="password" placeholder="8+ chars, Maj, Min, @...">
        
        @if (pwForm.get('newPassword')?.touched && pwForm.get('newPassword')?.errors?.['pattern']) {
          <small style="color: #ef4444; font-size: 11px; margin-top: 4px;">
            Le mot de passe doit contenir 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial (@$!%*?&).
          </small>
        }
      </div>

      <div class="modal-actions">
        <button type="button" (click)="closeDialog.emit()">Annuler</button>
        <button type="submit" class="primary" [disabled]="pwForm.invalid">Vérifier et modifier</button>
      </div>
    </form>
  `,
  styles: [`
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal-card { background: white; padding: 24px; border-radius: 12px; width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
  `]
})
export class ChangePasswordModalComponent {
  @Output() closeDialog = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private state = inject(DashboardHelperService);

  passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

  pwForm = this.fb.group({
    oldPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.pattern(this.passwordPattern)]]
  });

  submit() {
    if (this.pwForm.valid) {
      // On envoie les DEUX au backend
      const data = {
        oldPassword: this.pwForm.value.oldPassword,
        newPassword: this.pwForm.value.newPassword
      };

      this.state.updatePassword(data).subscribe({
        next: () => {
          alert('Mot de passe mis à jour avec succès !');
          this.closeDialog.emit();
        },
        error: (err) => {
          // Si le backend dit que l'ancien mot de passe est faux
          alert(err.error.message || 'Erreur lors de la mise à jour');
        }
      });
    }
  }
  close() {
    this.closeDialog.emit(); // On prévient le parent qu'on veut fermer
  }



}