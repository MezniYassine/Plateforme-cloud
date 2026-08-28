import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SaasInstance } from '../../personal-dashboard-helper.service';

@Component({
  selector: 'app-saas-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './saas-tab.html',
  styleUrl: './saas-tab.scss'
})
export class SaasTabComponent {
  saasInstances = input<SaasInstance[]>([]);
  openDeploy = output<{ type: 'saas'; name: string }>();
  deleteSaas = output<number>();

  // Filter & Search
  searchTerm = signal<string>('');
  selectedFilter = signal<string>('ALL');

  // Interactive states
  copiedKey = signal<string | null>(null);
  visiblePasswords = signal<Record<number, boolean>>({});

  getAppIdentity(s: SaasInstance): { logo: string; brandClass: string; category: string } {
    const text = [
      s.nomPersonnalise,
      s.catalogue?.nomService,
      s.linkedPaasService?.typeSgbd,
      s.linkedPaasService?.nomPersonnalise,
      s.ownerEmail
    ].filter(Boolean).join(' ').toLowerCase();

    if (text.includes('wordpress') || text.includes('wp')) {
      return {
        logo: 'assets/Wordpress logo.png',
        brandClass: 'brand-wordpress',
        category: 'CMS & Plateforme Web'
      };
    }
    if (text.includes('n8n')) {
      return {
        logo: 'assets/n8n_Logo.png',
        brandClass: 'brand-n8n',
        category: 'Automatisation & Workflow'
      };
    }
    if (text.includes('pgadmin') || (s.linkedPaasService && s.linkedPaasService.typeSgbd === 'POSTGRESQL')) {
      return {
        logo: 'assets/PostgreSQL Logo.png',
        brandClass: 'brand-pgadmin',
        category: 'Gestionnaire PostgreSQL'
      };
    }
    if (text.includes('phpmyadmin') || text.includes('pma') || (s.linkedPaasService && s.linkedPaasService.typeSgbd === 'MYSQL')) {
      return {
        logo: 'assets/MySQL Logo.png',
        brandClass: 'brand-phpmyadmin',
        category: 'Gestionnaire MySQL'
      };
    }
    if (text.includes('mongo') || (s.linkedPaasService && s.linkedPaasService.typeSgbd === 'MONGODB')) {
      return {
        logo: 'assets/MongoDB Logo.png',
        brandClass: 'brand-mongo',
        category: 'Gestionnaire MongoDB'
      };
    }
    if (text.includes('redis') || (s.linkedPaasService && s.linkedPaasService.typeSgbd === 'REDIS')) {
      return {
        logo: 'assets/Redis logo.png',
        brandClass: 'brand-redis',
        category: 'Gestionnaire Redis'
      };
    }
    return {
      logo: 'assets/DYNAMIX_DS.png',
      brandClass: 'brand-default',
      category: 'Application SaaS'
    };
  }

  filteredInstances = computed(() => {
    const list = this.saasInstances() || [];
    const search = this.searchTerm().trim().toLowerCase();
    const filter = this.selectedFilter().toUpperCase();

    return list.filter(s => {
      const id = this.getAppIdentity(s);
      const text = [
        s.nomPersonnalise,
        s.catalogue?.nomService,
        s.connectionString,
        s.ownerEmail,
        id.category
      ].filter(Boolean).join(' ').toLowerCase();

      let matchFilter = filter === 'ALL';
      if (filter === 'WORDPRESS') matchFilter = text.includes('wordpress') || text.includes('wp');
      if (filter === 'N8N') matchFilter = text.includes('n8n');
      if (filter === 'PHPMYADMIN') matchFilter = text.includes('phpmyadmin') || text.includes('pma');
      if (filter === 'PGADMIN') matchFilter = text.includes('pgadmin');

      const matchSearch = !search || text.includes(search);

      return matchFilter && matchSearch;
    });
  });

  getAppLogo(s: SaasInstance): string {
    return this.getAppIdentity(s).logo;
  }

  getAppBrandClass(s: SaasInstance): string {
    return this.getAppIdentity(s).brandClass;
  }

  getAppCategory(s: SaasInstance): string {
    return this.getAppIdentity(s).category;
  }

  shouldShowCredentials(s: SaasInstance): boolean {
    const text = [
      s.nomPersonnalise,
      s.catalogue?.nomService
    ].filter(Boolean).join(' ').toLowerCase();

    // phpMyAdmin uses linked MySQL DB credentials
    if (text.includes('phpmyadmin') || text.includes('pma') || (s.linkedPaasService && s.linkedPaasService.typeSgbd === 'MYSQL' && !text.includes('pgadmin'))) {
      return false;
    }
    // WordPress is configured during web setup
    if (text.includes('wordpress') || text.includes('wp')) {
      return false;
    }
    // Don't show if empty or dummy fallback
    const email = s.ownerEmail?.trim();
    const pass = s.ownerPassword?.trim();
    if (!email && !pass) return false;
    if (email === 'admin@cloud.local' && (!pass || pass === 'undefined')) return false;

    return true;
  }

  togglePassword(id: number) {
    this.visiblePasswords.update(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  }

  isPasswordVisible(id: number): boolean {
    return !!this.visiblePasswords()[id];
  }

  copyText(text: string | undefined, key: string, event?: Event) {
    if (event) event.stopPropagation();
    if (!text || text === '-' || text === 'Non disponible') return;
    navigator.clipboard.writeText(text);
    this.copiedKey.set(key);
    setTimeout(() => {
      if (this.copiedKey() === key) {
        this.copiedKey.set(null);
      }
    }, 2000);
  }

  isCopied(key: string): boolean {
    return this.copiedKey() === key;
  }
}
