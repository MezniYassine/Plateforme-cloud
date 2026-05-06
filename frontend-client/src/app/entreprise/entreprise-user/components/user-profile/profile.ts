import { Component, inject } from '@angular/core';
import { DashboardHelperService } from '../../dashboard-helper.service';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChangePasswordModalComponent } from '../../change-password';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ReactiveFormsModule, ChangePasswordModalComponent],
  templateUrl: './profile.html',
})
export class Profile {
  constructor(public state: DashboardHelperService) { }
  private fb = inject(FormBuilder);
  showPasswordModal = false;
  profileForm!: FormGroup;

  ngOnInit() {
    const user = this.state.actualUser();

    this.profileForm = this.fb.group({
      nom: [user?.nom, Validators.required],
      prenom: [user?.prenom, Validators.required],
      email: [user?.email, [Validators.required, Validators.email]],
      password: [''],
    });
  }

  onUpdate() {
    if (this.profileForm.valid) {
      const updatedData = this.profileForm.value;

      if (!updatedData.password) {
        delete updatedData.password;
      }

      this.state.updateProfile(updatedData).subscribe({
        next: (res) => {
          alert('Profil mis à jour !');
          this.state.loadUserData();
        },
        error: (err) => console.error(err)
      });
    }
  }
  onSecurityAction(label: string) {
    if (label === 'Mot de passe') {
      this.showPasswordModal = true;
    } else if (label === 'Double authentification (MFA)') {
      // Logique pour le MFA si tu l'as prévu
    }
  }
}
