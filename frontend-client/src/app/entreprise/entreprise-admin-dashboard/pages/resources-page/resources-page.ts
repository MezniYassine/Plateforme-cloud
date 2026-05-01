import { Component, input, output } from '@angular/core';
import { DeployedResource, TeamMember } from '../../entreprise-helper.service';

@Component({
  selector: 'ent-resources-page',
  standalone: true,
  imports: [],
  templateUrl: './resources-page.html',
})
export class ResourcesPageComponent {
  filteredResources = input.required<DeployedResource[]>();
  resFilter = input.required<string>();
  teamMembers = input.required<TeamMember[]>();

  filterChange = output<string>();

  getInitials(name: string): string {
    return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  serviceColor(type: 'vm' | 'db' | 'saas'): { color: string; bg: string } {
    const map = {
      vm: { color: 'var(--blue)', bg: 'var(--blue-light)' },
      db: { color: 'var(--teal)', bg: 'var(--teal-light)' },
      saas: { color: 'var(--purple)', bg: 'var(--purple-light)' },
    };
    return map[type] ?? map.vm;
  }

  memberColor(name: string): string {
    const member = this.teamMembers().find(m => m.name === name);
    return member?.color ?? '#94a3b8';
  }
}
