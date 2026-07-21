import { Component, input, output } from '@angular/core';
import { TeamMember } from '../../entreprise-helper.service';

@Component({
  selector: 'ent-team-page',
  standalone: true,
  imports: [],
  templateUrl: './team-page.html',
})
export class TeamPageComponent {
  teamMembers = input.required<TeamMember[]>();
  companyName = input.required<string>();

  openInviteModal = output<void>();
  toggleMember = output<string>();

  getInitials(name: string): string {
    return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }
}
