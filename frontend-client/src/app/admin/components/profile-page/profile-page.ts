import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ChangePasswordModalComponent } from '../../../common/change-password';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ChangePasswordModalComponent],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss'
})
export class ProfilePageComponent implements OnInit {
  @Input() actualAdmin: any | null = null;
  role = 'Global_Admin';
  showPasswordModal = false;
  profileForm!: FormGroup;

  private http = inject(HttpClient);
  private fb = inject(FormBuilder);

  ngOnInit() {
    this.profileForm = this.fb.group({
      prenom: [this.actualAdmin?.prenom || '', [Validators.required]],
      nom: [this.actualAdmin?.nom || '', [Validators.required]],
      email: [this.actualAdmin?.email || '', [Validators.required, Validators.email]],
    });
  }

  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  showToast = false;

  onUpdateProfile() {
    if (this.profileForm.valid) {
      this.http.patch(`${environment.apiBaseUrl}/admin/update-profile`, this.profileForm.value)
        .subscribe({
          next: () => this.showToastMessage('Profil Super Admin mis à jour avec succès', 'success'),
          error: (err) => this.showToastMessage(err.error?.message || 'Erreur lors de la mise à jour', 'error')
        });
    }
  }

  showToastMessage(msg: string, type: 'success' | 'error') {
    this.toastMessage = msg;
    this.toastType = type;
    this.showToast = true;
    setTimeout(() => {
      this.showToast = false;
    }, 4000);
  }

  getInitials(): string {
    const p = this.actualAdmin?.prenom || 'S';
    const n = this.actualAdmin?.nom || 'A';
    return (p[0] + n[0]).toUpperCase();
  }
}