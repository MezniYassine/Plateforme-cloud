import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PaasInstance } from '../../personal-dashboard-helper.service';

@Component({
  selector: 'app-paas-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './paas-tab.html',
  styleUrl: './paas-tab.scss'
})
export class PaasTabComponent {
  paasInstances = input<PaasInstance[]>([]);
  openDeploy = output<{ type: 'paas'; name: string }>();
  deletePaas = output<number>();
  openUpgrade = output<PaasInstance>();

  // Filter & Search
  searchTerm = signal<string>('');
  selectedFilter = signal<string>('ALL');

  // Interactive states
  copiedKey = signal<string | null>(null);
  visiblePasswords = signal<Record<number, boolean>>({});

  filteredInstances = computed(() => {
    const list = this.paasInstances() || [];
    const search = this.searchTerm().trim().toLowerCase();
    const filter = this.selectedFilter().toUpperCase();

    return list.filter(p => {
      const matchFilter = filter === 'ALL' || (p.typeSgbd && p.typeSgbd.toUpperCase().includes(filter));
      const matchSearch = !search ||
        (p.nomPersonnalise && p.nomPersonnalise.toLowerCase().includes(search)) ||
        (p.typeSgbd && p.typeSgbd.toLowerCase().includes(search)) ||
        (p.hostIp && p.hostIp.includes(search));
      return matchFilter && matchSearch;
    });
  });

  getDbLogo(type?: string): string {
    const t = (type || '').toUpperCase();
    if (t.includes('POSTGRES')) return 'assets/PostgreSQL Logo.png';
    if (t.includes('MYSQL') || t.includes('MARIA')) return 'assets/MySQL Logo.png';
    if (t.includes('MONGO')) return 'assets/MongoDB Logo.png';
    if (t.includes('REDIS')) return 'assets/Redis logo.png';
    return 'assets/PostgreSQL Logo.png';
  }

  getDbBrandClass(type?: string): string {
    const t = (type || '').toUpperCase();
    if (t.includes('POSTGRES')) return 'brand-postgres';
    if (t.includes('MYSQL') || t.includes('MARIA')) return 'brand-mysql';
    if (t.includes('MONGO')) return 'brand-mongo';
    if (t.includes('REDIS')) return 'brand-redis';
    return 'brand-default';
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
