import { Component, signal } from '@angular/core';
import { ServiceItem } from '../../personal-dashboard-helper.service';

@Component({
  selector: 'app-saas-tab',
  standalone: true,
  imports: [],
  templateUrl: './saas-tab.html',
})
export class SaasTabComponent {
  saasServices = signal<ServiceItem[]>([
    { name: 'Odoo ERP 17', desc: "Suite ERP complète : CRM, comptabilité, RH, inventaire, e-commerce.", icon: 'erp', color: 'var(--purple)', bg: 'var(--purple-l)', price: '35.00', specs: ['4 vCPU', '8 GB', '500 GB'], tag: 'Populaire', tagColor: 'var(--purple)' },
    { name: 'Nextcloud', desc: 'Espace de travail collaboratif souverain : fichiers, agenda, visio.', icon: 'cloud', color: 'var(--blue)', bg: 'var(--blue-l)', price: '12.00', specs: ['2 vCPU', '4 GB', '200 GB'] },
    { name: 'GitLab CE', desc: 'Plateforme DevOps complète : CI/CD, dépôts Git, registry Docker.', icon: 'git', color: '#e65c00', bg: '#fff3e0', price: '18.00', specs: ['4 vCPU', '8 GB', '100 GB'], tag: 'DevOps', tagColor: 'var(--amber)' },
    { name: 'Mattermost', desc: 'Messagerie équipe sécurisée et souveraine, alternative à Slack.', icon: 'chat', color: 'var(--teal)', bg: 'var(--teal-l)', price: '8.00', specs: ['2 vCPU', '4 GB', '50 GB'] },
    { name: 'Grafana Stack', desc: 'Monitoring et dashboards : Grafana + Prometheus + Loki.', icon: 'monitor', color: 'var(--amber)', bg: 'var(--amber-l)', price: '14.00', specs: ['2 vCPU', '4 GB', '100 GB'] },
    { name: 'WordPress Pro', desc: 'CMS optimisé avec cache LiteSpeed, SSL, CDN intégré.', icon: 'web', color: 'var(--blue)', bg: 'var(--blue-l)', price: '6.00', specs: ['1 vCPU', '2 GB', '50 GB'] },
  ]);
}
