import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardHelperService, MyVM, MyService, MyRequest } from '../../dashboard-helper.service';

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './user-dashboard.html',
  styleUrls: ['./user-dashboard.scss']
})
export class UserDashboardComponent {
  state = inject(DashboardHelperService);
  copiedIp = signal<string | null>(null);

  getOsLogo(os?: string): string {
    const o = (os || '').toLowerCase();
    if (o.includes('ubuntu')) return 'assets/ubuntu.png';
    if (o.includes('debian')) return 'assets/Debian.png';
    if (o.includes('alpine')) return 'assets/alpine.png';
    if (o.includes('2000')) return 'assets/windows 2000.png';
    if (o.includes('windows') || o.includes('win')) return 'assets/windows 7.png';
    return 'assets/ubuntu.png';
  }

  hasAppLogo(name?: string): boolean {
    const n = (name || '').toLowerCase();
    if (n.includes('postgres') || n.includes('psql')) return true;
    if (n.includes('mysql') || n.includes('phpmyadmin')) return true;
    if (n.includes('mongo') || n.includes('express')) return true;
    if (n.includes('redis')) return true;
    if (n.includes('word') || n.includes('wp')) return true;
    if (n.includes('n8n')) return true;
    return false;
  }

  getServiceLogo(name?: string): string {
    const n = (name || '').toLowerCase();
    if (n.includes('postgres') || n.includes('psql')) return 'assets/PostgreSQL Logo.png';
    if (n.includes('mysql') || n.includes('phpmyadmin')) return 'assets/MySQL Logo.png';
    if (n.includes('mongo') || n.includes('express')) return 'assets/MongoDB Logo.png';
    if (n.includes('redis')) return 'assets/Redis logo.png';
    if (n.includes('word') || n.includes('wp')) return 'assets/Wordpress logo.png';
    if (n.includes('n8n')) return 'assets/n8n_Logo.png';
    return '';
  }

  copyIp(ip: string, event: MouseEvent) {
    event.stopPropagation();
    if (!ip) return;
    navigator.clipboard.writeText(ip);
    this.copiedIp.set(ip);
    setTimeout(() => this.copiedIp.set(null), 2000);
  }
}
