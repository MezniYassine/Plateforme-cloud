import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardHelperService, MyService } from '../../dashboard-helper.service';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './services.html',
  styleUrls: ['./services.scss']
})
export class Services {
  state = inject(DashboardHelperService);

  searchTerm = signal<string>('');
  copiedField = signal<string | null>(null);
  showPassword = signal<Record<string, boolean>>({});

  stats = computed(() => {
    const list = this.state.myServices();
    const total = list.length;
    const paasCount = list.filter(s => s.type === 'db').length;
    const saasCount = list.filter(s => s.type === 'saas').length;
    const runningCount = list.filter(s => s.status === 'running' || !s.status).length;
    return { total, paasCount, saasCount, runningCount };
  });

  filteredServices = computed(() => {
    const list = this.state.filteredMyServices();
    const query = this.searchTerm().trim().toLowerCase();
    if (!query) return list;
    return list.filter(s =>
      (s.name && s.name.toLowerCase().includes(query)) ||
      (s.specs && s.specs.toLowerCase().includes(query)) ||
      (s.connectionString && s.connectionString.toLowerCase().includes(query)) ||
      (s.url && s.url.toLowerCase().includes(query)) ||
      (s.dbUser && s.dbUser.toLowerCase().includes(query))
    );
  });

  hasAppLogo(name?: string): boolean {
    const n = (name || '').toLowerCase();
    if (n.includes('postgres') || n.includes('psql')) return true;
    if (n.includes('mysql') || n.includes('phpmyadmin')) return true;
    if (n.includes('mongo')) return true;
    if (n.includes('redis')) return true;
    if (n.includes('word') || n.includes('wp')) return true;
    if (n.includes('n8n')) return true;
    return false;
  }

  getServiceLogo(name?: string): string {
    const n = (name || '').toLowerCase();
    if (n.includes('postgres') || n.includes('psql')) return 'assets/PostgreSQL Logo.png';
    if (n.includes('mysql') || n.includes('phpmyadmin')) return 'assets/MySQL Logo.png';
    if (n.includes('mongo')) return 'assets/MongoDB Logo.png';
    if (n.includes('redis')) return 'assets/Redis logo.png';
    if (n.includes('word') || n.includes('wp')) return 'assets/Wordpress logo.png';
    if (n.includes('n8n')) return 'assets/n8n_Logo.png';
    return '';
  }

  getBrandClass(name?: string): string {
    const n = (name || '').toLowerCase();
    if (n.includes('postgres')) return 'brand-postgres';
    if (n.includes('mysql') || n.includes('phpmyadmin')) return 'brand-mysql';
    if (n.includes('mongo')) return 'brand-mongo';
    if (n.includes('redis')) return 'brand-redis';
    if (n.includes('word') || n.includes('wp')) return 'brand-wordpress';
    if (n.includes('n8n')) return 'brand-n8n';
    return 'brand-default';
  }

  copyToClipboard(text: string, fieldId: string, event: MouseEvent) {
    event.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(text);
    this.copiedField.set(fieldId);
    setTimeout(() => this.copiedField.set(null), 2000);
  }

  togglePassword(serviceId: string, event: MouseEvent) {
    event.stopPropagation();
    this.showPassword.update(prev => ({
      ...prev,
      [serviceId]: !prev[serviceId]
    }));
  }

  isPasswordVisible(serviceId: string): boolean {
    return !!this.showPassword()[serviceId];
  }

  parseMetricValue(val?: string | number): number {
    if (val === undefined || val === null) return 0;
    const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
    return isNaN(num) ? 0 : Math.min(100, Math.max(0, num));
  }
}
