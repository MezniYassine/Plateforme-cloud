import { Component, output, signal } from '@angular/core';
import { ServiceItem } from '../../personal-dashboard-helper.service';

@Component({
  selector: 'app-paas-tab',
  standalone: true,
  imports: [],
  templateUrl: './paas-tab.html',
})
export class PaasTabComponent {
  openDeploy = output<{ type: 'vm' | 'catalog'; name: string }>();

  paasServices = signal<ServiceItem[]>([
    { name: 'PostgreSQL 16', desc: 'Base de données relationnelle managée, sauvegardes auto, haute disponibilité.', icon: 'db', color: 'var(--blue)', bg: 'var(--blue-l)', price: '8.00', specs: ['1 vCPU', '4 GB RAM', '50 GB SSD'] },
    { name: 'MySQL 8.4', desc: 'Base de données open source optimisée pour les applications web.', icon: 'db', color: '#e65c00', bg: '#fff3e0', price: '7.50', specs: ['1 vCPU', '2 GB RAM', '30 GB SSD'] },
    { name: 'Redis 7', desc: 'Cache en mémoire ultra-rapide, files de messages, sessions.', icon: 'redis', color: 'var(--red)', bg: 'var(--red-l)', price: '4.50', specs: ['0.5 vCPU', '1 GB RAM', 'SSD'] },
    { name: 'MongoDB 7', desc: 'Base NoSQL orientée document, idéale pour les données flexibles.', icon: 'mongo', color: 'var(--green)', bg: 'var(--green-l)', price: '9.00', specs: ['1 vCPU', '4 GB RAM', '60 GB'] },
    { name: 'RabbitMQ', desc: "Broker de messages AMQP pour les architectures microservices.", icon: 'queue', color: 'var(--amber)', bg: 'var(--amber-l)', price: '5.50', specs: ['1 vCPU', '2 GB RAM'] },
    { name: 'Elasticsearch', desc: 'Moteur de recherche et analytique distribué en temps réel.', icon: 'search', color: 'var(--purple)', bg: 'var(--purple-l)', price: '14.00', specs: ['2 vCPU', '8 GB RAM', '100 GB'] },
  ]);
}
