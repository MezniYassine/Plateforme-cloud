import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ChangePasswordModalComponent } from '../../../common/change-password';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-profile-page', // Assure-toi que le sélecteur correspond à ton routing
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ChangePasswordModalComponent],
  templateUrl: './profile-page.html',
})
export class ProfilePageComponent implements OnInit {
  // On reçoit l'admin global depuis le composant parent ou le helper
  @Input() actualAdmin: any | null = null;
  role = "Global_Admin";
  showPasswordModal = false;
  profileForm!: FormGroup;

  private http = inject(HttpClient);
  private fb = inject(FormBuilder);

  ngOnInit() {
    // Initialisation avec les données de actualAdmin
    this.profileForm = this.fb.group({
      prenom: [this.actualAdmin?.prenom || '', [Validators.required]],
      nom: [this.actualAdmin?.nom || '', [Validators.required]],
      email: [this.actualAdmin?.email || '', [Validators.required, Validators.email]],
    });
  }

  onUpdateProfile() {
    if (this.profileForm.valid) {
      this.http.patch(`${environment.apiBaseUrl}/admin/update-profile`, this.profileForm.value)
        .subscribe({
          next: () => alert('Profil Super Admin mis à jour !'),
          error: (err) => alert(err.error.message || 'Erreur lors de la mise à jour')
        });
    }
  }

  getInitials(): string {
    const p = this.actualAdmin?.prenom || 'S';
    const n = this.actualAdmin?.nom || 'A';
    return (p[0] + n[0]).toUpperCase();
  }
}