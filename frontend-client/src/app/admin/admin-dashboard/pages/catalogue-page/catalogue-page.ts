import { Component, signal, computed } from '@angular/core';

interface CatalogueItem {
  id: string; name: string; desc: string; type: string;
  price: string; bg: string; color: string; active: boolean; popular?: boolean;
}

@Component({
  selector: 'app-catalogue-page',
  standalone: true,
  imports: [],
  templateUrl: './catalogue-page.html',
})
export class CataloguePageComponent {
  catalogueFilter = signal<string>('all');

  catalogueTabs = signal([
    { key: 'all', label: 'Tout' },
    { key: 'iaas', label: 'IaaS' },
    { key: 'paas', label: 'PaaS' },
    { key: 'saas', label: 'SaaS' },
  ]);

  catalogueItems = signal<CatalogueItem[]>([
    { id: 'c1', name: 'VM Standard', desc: 'Instance IaaS 2 vCPU / 4 GB RAM / 50 GB SSD', type: 'iaas', price: '9.20', bg: 'var(--blue-light)', color: 'var(--blue)', active: true },
    { id: 'c2', name: 'VM Performance', desc: 'Instance IaaS 4 vCPU / 8 GB RAM / 100 GB SSD', type: 'iaas', price: '18.50', bg: 'var(--blue-light)', color: 'var(--blue)', active: true },
    { id: 'c3', name: 'VM Pro', desc: 'Instance IaaS 8 vCPU / 16 GB RAM / 200 GB SSD', type: 'iaas', price: '36.00', bg: 'var(--blue-light)', color: 'var(--blue)', active: true },
    { id: 'c4', name: 'PostgreSQL 16', desc: 'Base de données relationnelle managée', type: 'paas', price: '8.00', bg: 'var(--teal-light)', color: 'var(--teal)', active: true },
    { id: 'c5', name: 'MySQL 8.4', desc: 'Base de données open source managée', type: 'paas', price: '7.50', bg: 'var(--teal-light)', color: 'var(--teal)', active: true },
    { id: 'c6', name: 'Redis 7', desc: 'Cache en mémoire ultra-rapide', type: 'paas', price: '4.50', bg: 'var(--red-light)', color: 'var(--red)', active: true },
    { id: 'c7', name: 'MongoDB 7', desc: 'Base NoSQL orientée document', type: 'paas', price: '9.00', bg: 'var(--green-light)', color: 'var(--green)', active: false },
    { id: 'c8', name: 'Odoo ERP 17', desc: 'Suite ERP complète : CRM, RH, Finance', type: 'saas', price: '35.00', bg: 'var(--purple-light)', color: 'var(--purple)', active: true, popular: true },
    { id: 'c9', name: 'Nextcloud', desc: 'Espace collaboratif souverain', type: 'saas', price: '12.00', bg: 'var(--blue-light)', color: 'var(--blue)', active: true },
    { id: 'c10', name: 'GitLab CE', desc: 'DevOps complet : CI/CD, registre Docker', type: 'saas', price: '18.00', bg: 'var(--amber-light)', color: 'var(--amber)', active: true },
    { id: 'c11', name: 'Grafana Stack', desc: 'Monitoring : Grafana + Prometheus + Loki', type: 'saas', price: '14.00', bg: 'var(--amber-light)', color: 'var(--amber)', active: true },
    { id: 'c12', name: 'Mattermost', desc: 'Messagerie équipe sécurisée et souveraine', type: 'saas', price: '8.00', bg: 'var(--teal-light)', color: 'var(--teal)', active: false },
  ]);

  filteredCatalogue = computed(() => {
    const f = this.catalogueFilter();
    return f === 'all' ? this.catalogueItems() : this.catalogueItems().filter(i => i.type === f);
  });

  setCatalogueFilter(k: string) { this.catalogueFilter.set(k); }

  toggleService(id: string) {
    this.catalogueItems.update(list =>
      list.map(i => i.id === id ? { ...i, active: !i.active } : i)
    );
  }
}
