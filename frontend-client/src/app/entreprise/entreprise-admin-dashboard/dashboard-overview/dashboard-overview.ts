import { Component, computed, input, output } from '@angular/core';
import { Activity, ResourceRequest, TeamMember } from '../entreprise-helper.service';

@Component({
  selector: 'ent-dashboard-overview',
  standalone: true,
  imports: [],
  templateUrl: './dashboard-overview.html',
  styleUrl: './dashboard-overview.scss',
})
export class DashboardOverview {
  teamMembers = input.required<TeamMember[]>();
  resourceRequests = input.required<ResourceRequest[]>();
  activeResourcesCount = input.required<number>();
  monthlyBudget = input.required<number>();
  monthlySpend = input.required<number>();
  activities = input.required<Activity[]>();
  teamSpend = input.required<Array<Pick<TeamMember, 'name' | 'spend' | 'color'>>>();
  pendingRequestsCount = input.required<number>();

  readonly budgetUsedPct = computed(() =>
    Math.round((this.monthlySpend() / this.monthlyBudget()) * 100)
  );

  navigateTo = output<string>();
  approveRequest = output<string>();
  rejectRequest = output<string>();

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
}
