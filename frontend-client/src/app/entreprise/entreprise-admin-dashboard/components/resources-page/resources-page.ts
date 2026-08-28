import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DeployedResource, TeamMember } from '../../entreprise-helper.service';

@Component({
  selector: 'ent-resources-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './resources-page.html',
  styleUrl: './resources-page.scss',
})
export class ResourcesPageComponent {
  filteredResources = input.required<DeployedResource[]>();
  resFilter = input.required<string>();
  teamMembers = input.required<TeamMember[]>();

  filterChange = output<string>();

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

  memberColor(name: string, resourceOwnerColor?: string): string {
    if (resourceOwnerColor) return resourceOwnerColor;
    const member = this.teamMembers().find(m => m.name === name);
    return member?.color ?? '#64748b';
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

  formatStorage(val?: number, type?: string): string {
    if (val === null || val === undefined || val === 0) return '—';
    if (type === 'vm') {
      return val >= 1024 ? `${(val / 1024).toFixed(0)} GB` : `${val} GB`;
    }
    if (val >= 1024) {
      return `${(val / 1024).toFixed(1)} GB`;
    }
    return `${Math.round(val)} Mo`;
  }

  formatSpecs(specs?: string, type?: string): string {
    if (!specs || specs.trim() === '' || specs.includes('0 vCPU - 0 GB RAM - 0 GB SSD')) {
      if (type === 'saas') return 'Application SaaS Managée';
      if (type === 'db') return 'Base de données managée';
      return 'Configuration Standard';
    }
    return specs;
  }

  getCpu(r: DeployedResource): number {
    return typeof r.cpu === 'number' ? r.cpu : 0;
  }

  getRam(r: DeployedResource): number {
    return typeof r.ram === 'number' ? r.ram : 0;
  }

  isRunning(status?: string): boolean {
    return status === 'RUNNING';
  }

  isStopped(status?: string): boolean {
    return status === 'STOPPED';
  }
}
