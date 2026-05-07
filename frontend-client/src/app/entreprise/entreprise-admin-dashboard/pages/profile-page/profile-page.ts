import { Component, inject, input } from '@angular/core';
import { ChangePasswordModalComponent } from '../../../../common/change-password';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { environment } from '../../../../../environments/environment';
import { HttpClient } from '@angular/common/http';

const PATTERNS = {
  TAX_ID: /^\d{7,8}[a-z]\/?[mpe]\/?[anpb]\/?\d{3}$/i
};
@Component({
  selector: 'ent-profile-page',
  standalone: true,
  imports: [ReactiveFormsModule, ChangePasswordModalComponent],
  templateUrl: './profile-page.html',
})

export class ProfilePageComponent {
  adminName = input.required<string>();
  adminEmail = input.required<string>();
  companyName = input.required<string>();
  taxId = input.required<string>();

  showPasswordModal = false;
  private http = inject(HttpClient);
  fb = inject(FormBuilder);
  profileForm!: FormGroup;
  ngOnInit() {
    this.profileForm = this.fb.group({
      adminNom: [this.adminName().split(' ')[1] || ''],
      adminPrenom: [this.adminName().split(' ')[0] || ''],
      adminEmail: [this.adminEmail(), [Validators.required, Validators.email]],
      companyName: [this.companyName(), Validators.required],
      taxId: [this.taxId(), Validators.required, Validators.pattern(PATTERNS.TAX_ID)],
    });
  }
  onUpdate() {
    if (this.profileForm.valid) {
      const payload = {
        nom: this.profileForm.value.adminNom,
        prenom: this.profileForm.value.adminPrenom,
        email: this.profileForm.value.adminEmail,
        nomEntreprise: this.profileForm.value.companyName,
        identifiantFiscal: this.profileForm.value.taxId
      };

      this.updateProfile(payload).subscribe({
        next: () => alert('Profil entreprise mis à jour avec succès !'),
        error: (err) => console.error('Erreur update:', err)
      });
    }
  }

  getInitials(name: string): string {
    return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  private updateProfile(data: any) {
    return this.http.patch(`${environment.apiBaseUrl}/users/update-profile`, data);
  }
}
