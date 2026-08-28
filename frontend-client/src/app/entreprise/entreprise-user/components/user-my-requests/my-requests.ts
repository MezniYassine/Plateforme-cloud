import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardHelperService, MyRequest } from '../../dashboard-helper.service';

@Component({
  selector: 'app-my-requests',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-requests.html',
  styleUrls: ['./my-requests.scss']
})
export class MyRequests {
  state = inject(DashboardHelperService);

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

  getServiceLogo(name?: string): string {
    const n = (name || '').toLowerCase();
    if (n.includes('ubuntu')) return 'assets/ubuntu.png';
    if (n.includes('debian')) return 'assets/Debian.png';
    if (n.includes('alpine')) return 'assets/alpine.png';
    if (n.includes('windows') || n.includes('win') || n.includes('2000')) return 'assets/windows 7.png';
    if (n.includes('postgres') || n.includes('psql')) return 'assets/PostgreSQL Logo.png';
    if (n.includes('mysql') || n.includes('phpmyadmin')) return 'assets/MySQL Logo.png';
    if (n.includes('mongo')) return 'assets/MongoDB Logo.png';
    if (n.includes('redis')) return 'assets/Redis logo.png';
    if (n.includes('word') || n.includes('wp')) return 'assets/Wordpress logo.png';
    if (n.includes('n8n')) return 'assets/n8n_Logo.png';
    return '';
  }
}
