import { Component, input } from '@angular/core';

interface ProfileSecurityItem {
  label: string;
  desc: string;
  action: string;
  primary: boolean;
}

@Component({
  selector: 'ent-profile-page',
  standalone: true,
  imports: [],
  templateUrl: './profile-page.html',
})
export class ProfilePageComponent {
  adminName = input.required<string>();
  adminEmail = input.required<string>();
  companyName = input.required<string>();
  taxId = input.required<string>();
  tenantId = input.required<string>();
  profileSecurity = input.required<ProfileSecurityItem[]>();

  getInitials(name: string): string {
    return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }
}
