import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChangePasswordModalComponent } from '../../../../common/change-password';
import { environment } from '../../../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Personal } from '../../personal-dashboard-helper.service';

@Component({
  selector: 'app-profile-tab',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ChangePasswordModalComponent],
  templateUrl: './profile-tab.html',
})
export class ProfileTabComponent implements OnInit {
  showPasswordModal = false;
  profileForm!: FormGroup;

  private http = inject(HttpClient);
  private fb = inject(FormBuilder);

  @Input() actualPers: Personal | null = null;
  ngOnInit() {
    this.profileForm = this.fb.group({
      prenom: [this.actualPers?.client?.prenom || '', [Validators.required]],
      nom: [this.actualPers?.client?.nom || '', [Validators.required]],
      email: [this.actualPers?.client?.email || '', [Validators.required, Validators.email]],
      profession: [this.actualPers?.profession || '']
    });
  }

  onUpdateProfile() {
    if (this.profileForm.valid) {
      this.updateProfile(this.profileForm.value).subscribe({
        next: () => alert('Profil mis à jour avec succès !'),
        error: (err) => alert(err.error.message || 'Erreur lors de la mise à jour')
      });
    }
  }

  private updateProfile(data: any) {
    return this.http.patch(`${environment.apiBaseUrl}/users/update-profile`, data);
  }
}