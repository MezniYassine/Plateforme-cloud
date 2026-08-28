import { Component, computed, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DeployedResource, ResourceRequest, TeamMember } from '../../entreprise-helper.service';

@Component({
  selector: 'ent-team-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './team-page.html',
  styleUrl: './team-page.scss',
})
export class TeamPageComponent {
  teamMembers = input.required<TeamMember[]>();
  companyName = input.required<string>();
  deployedResources = input<DeployedResource[]>([]);
  resourceRequests = input<ResourceRequest[]>([]);

  openInviteModal = output<void>();
  toggleMember = output<string>();

  selectedMember = signal<TeamMember | null>(null);
  activeDetailTab = signal<'resources' | 'requests'>('resources');

  memberResources = computed(() => {
    const m = this.selectedMember();
    if (!m) return [];
    return this.deployedResources().filter(r => r.owner === m.name || r.owner?.toLowerCase() === m.name.toLowerCase());
  });

  memberRequests = computed(() => {
    const m = this.selectedMember();
    if (!m) return [];
    return this.resourceRequests().filter(r => r.user === m.name || r.user?.toLowerCase() === m.name.toLowerCase());
  });

  openDetails(m: TeamMember) {
    this.selectedMember.set(m);
    this.activeDetailTab.set('resources');
  }

  closeDetails() {
    this.selectedMember.set(null);
  }

  getInitials(name: string): string {
    return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  formatDate(d?: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  getMemberStatusClass(m: TeamMember): string {
    const status = m.status || (m.active ? 'APPROVED' : 'PENDING_VALIDATION');
    if (status === 'APPROVED') return 'is-active';
    if (status === 'PENDING_VALIDATION' || status === 'PENDING') return 'is-pending';
    if (status === 'SUSPENDED') return 'is-suspended';
    return 'is-pending';
  }

  getMemberStatusLabel(m: TeamMember): string {
    const status = m.status || (m.active ? 'APPROVED' : 'PENDING_VALIDATION');
    if (status === 'APPROVED') return 'Actif';
    if (status === 'PENDING_VALIDATION' || status === 'PENDING') return 'En attente';
    if (status === 'SUSPENDED') return 'Suspendu';
    return 'En attente';
  }

  isMfaActive(status?: string): boolean {
    return status === 'ACTIVE' || status === 'ACTIF';
  }

  getMfaLabel(status?: string): string {
    if (status === 'ACTIVE' || status === 'ACTIF') return 'Activé (Email OTP)';
    if (status === 'EN_ATTENTE') return 'En attente';
    return 'Désactivé';
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

  statusClass(status?: string): string {
    if (!status) return 'running';
    switch (status) {
      case 'RUNNING': return 'running';
      case 'STOPPED': return 'stopped';
      case 'PROVISIONING': return 'provisioning';
      case 'FAILED': return 'failed';
      default: return 'running';
    }
  }

  statusLabel(status?: string): string {
    if (!status) return 'En marche';
    switch (status) {
      case 'RUNNING': return 'En marche';
      case 'STOPPED': return 'Arrêtée';
      case 'PROVISIONING': return 'En cours';
      case 'FAILED': return 'Erreur';
      default: return status;
    }
  }

  getCpu(r: DeployedResource): number {
    return typeof r.cpu === 'number' ? r.cpu : 0;
  }

  getRam(r: DeployedResource): number {
    return typeof r.ram === 'number' ? r.ram : 0;
  }
}
