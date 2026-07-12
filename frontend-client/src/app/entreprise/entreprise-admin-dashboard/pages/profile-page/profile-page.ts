import { Component, inject, input, computed, effect, output } from '@angular/core';
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
  adminNom = input.required<string>();
  adminPrenom = input.required<string>();
  adminEmail = input.required<string>();
  companyName = input.required<string>();
  taxId = input.required<string>();

  profileUpdated = output<void>();

  adminName = computed(() => `${this.adminPrenom()} ${this.adminNom()}`);

  showPasswordModal = false;
  private http = inject(HttpClient);
  fb = inject(FormBuilder);
  profileForm!: FormGroup;

  constructor() {
    this.profileForm = this.fb.group({
      adminNom: [''],
      adminPrenom: [''],
      adminEmail: ['', [Validators.required, Validators.email]],
      companyName: ['', Validators.required],
      taxId: ['', [Validators.required, Validators.pattern(PATTERNS.TAX_ID)]],
    });

    effect(() => {
      this.profileForm.patchValue({
        adminNom: this.adminNom(),
        adminPrenom: this.adminPrenom(),
        adminEmail: this.adminEmail(),
        companyName: this.companyName(),
        taxId: this.taxId()
      }, { emitEvent: false });
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
        next: () => {
          alert('Profil entreprise mis à jour avec succès !');
          this.profileUpdated.emit();
        },
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

