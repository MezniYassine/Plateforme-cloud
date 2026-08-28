import { Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Activity, ResourceRequest, TeamMember } from '../entreprise-helper.service';

@Component({
  selector: 'ent-dashboard-overview',
  standalone: true,
  imports: [CommonModule],
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

  readonly budgetUsedPct = computed(() => {
    const b = this.monthlyBudget();
    if (!b || b === 0) return 0;
    return Math.round((this.monthlySpend() / b) * 100);
  });

  navigateTo = output<string>();
  approveRequest = output<string>();
  rejectRequest = output<string>();

  getInitials(name: string): string {
    return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  hasAppLogo(name?: string, type?: string): boolean {
    const n = (name || '').toLowerCase();
    const t = (type || '').toLowerCase();

    if (n.includes('wordpress') || n.includes('wp')) return true;
    if (n.includes('n8n')) return true;
    if (n.includes('pgadmin')) return true;
    if (n.includes('phpmyadmin')) return true;

    if (t === 'db' || n.includes('db') || n.includes('base')) {
      if (n.includes('postgres') || n.includes('psql')) return true;
      if (n.includes('mysql')) return true;
      if (n.includes('mongo')) return true;
      if (n.includes('redis')) return true;
      return false;
    }

    if (t === 'vm' || n.includes('vm')) {
      if (n.includes('debian')) return true;
      if (n.includes('alpine')) return true;
      if (n.includes('windows') || n.includes('win') || n.includes('2000')) return true;
      if (n.includes('ubuntu')) return true;
      return false;
    }

    return false;
  }

  getServiceLogo(name?: string, type?: string): string {
    const n = (name || '').toLowerCase();
    const t = (type || '').toLowerCase();

    if (n.includes('wordpress') || n.includes('wp')) return 'assets/Wordpress logo.png';
    if (n.includes('n8n')) return 'assets/n8n_Logo.png';
    if (n.includes('pgadmin') || n.includes('postgres') || n.includes('psql')) return 'assets/PostgreSQL Logo.png';
    if (n.includes('phpmyadmin') || n.includes('mysql') || n.includes('phpsql') || n.includes('phpadmin')) return 'assets/MySQL Logo.png';
    if (n.includes('mongo')) return 'assets/MongoDB Logo.png';
    if (n.includes('redis')) return 'assets/Redis logo.png';

    if (n.includes('debian')) return 'assets/Debian.png';
    if (n.includes('alpine')) return 'assets/alpine.png';
    if (n.includes('windows') || n.includes('win') || n.includes('2000')) return 'assets/windows 7.png';
    if (n.includes('ubuntu')) return 'assets/ubuntu.png';

    return '';
  }

  getCategoryLabel(type?: string): string {
    if (type === 'vm') return 'IAAS';
    if (type === 'db') return 'PAAS';
    if (type === 'saas') return 'SAAS';
    return 'SERVICE';
  }

  formatSpecs(specs?: string, type?: string): string {
    if (!specs || specs.trim() === '' || specs.includes('0 vCPU - 0 GB RAM - 0 GB SSD')) {
      if (type === 'saas') return 'Application SaaS Managée';
      if (type === 'db') return 'Base de données managée';
      return 'Configuration Standard';
    }
    return specs;
  }
}
