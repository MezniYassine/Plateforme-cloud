import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [],
  templateUrl: './profile-page.html',
})
export class ProfilePageComponent {
  profileSecurity = signal([
    { label: 'Authentification MFA', desc: 'TOTP actif — Google Authenticator', action: 'Reconfigurer', primary: false },
    { label: 'Changer le mot de passe', desc: 'Dernière modification il y a 14 j', action: 'Modifier', primary: false },
    { label: 'Sessions actives', desc: '1 session active en ce moment', action: 'Gérer', primary: false },
    { label: "Journal d'audit", desc: 'Toutes vos actions sont tracées', action: 'Voir les logs', primary: true },
  ]);
}
