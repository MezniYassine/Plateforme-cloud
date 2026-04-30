import { Component, signal } from '@angular/core';
import { Activity } from '../../dashboard-helper.service';

interface MonitorVM {
  id: string; name: string; tenant: string;
  cpu: number; ram: number; net: string; uptime: string; alert: boolean;
}

@Component({
  selector: 'app-monitoring-page',
  standalone: true,
  imports: [],
  templateUrl: './monitoring-page.html',
})
export class MonitoringPageComponent {
  monitorStats = signal([
    { label: 'Uptime global', val: '99.9%', sub: 'SLA garanti', bg: 'var(--green-light)', color: 'var(--green)', valColor: 'var(--green)' },
    { label: 'Alertes actives', val: '3', sub: '2 critiques', bg: 'var(--red-light)', color: 'var(--red)', valColor: 'var(--red)' },
    { label: 'CPU moyen', val: '51%', sub: 'Sur toutes les VMs', bg: 'var(--blue-light)', color: 'var(--blue)', valColor: '' },
    { label: 'RAM moyenne', val: '54%', sub: 'Sur toutes les VMs', bg: 'var(--purple-light)', color: 'var(--purple)', valColor: '' },
  ]);

  monitorVMs = signal<MonitorVM[]>([
    { id: 'v1', name: 'vm-prod-erp-01', tenant: 'CloudNet SA', cpu: 82, ram: 71, net: '↑ 12 MB/s', uptime: '99.9%', alert: true },
    { id: 'v2', name: 'vm-prod-db-02', tenant: 'AlphaSys', cpu: 45, ram: 58, net: '↑ 3 MB/s', uptime: '99.9%', alert: false },
    { id: 'v3', name: 'vm-dev-api-03', tenant: 'BisTech Group', cpu: 28, ram: 34, net: '↑ 1 MB/s', uptime: '99.7%', alert: false },
    { id: 'v4', name: 'vm-staging-04', tenant: 'DataPrime SARL', cpu: 91, ram: 88, net: '↑ 8 MB/s', uptime: '98.2%', alert: true },
    { id: 'v5', name: 'vm-odoo-prod-05', tenant: 'CloudNet SA', cpu: 63, ram: 72, net: '↑ 5 MB/s', uptime: '99.9%', alert: false },
  ]);

  aiopsAlerts = signal<Activity[]>([
    { type: 'alert', msg: '<strong>vm-prod-erp-01</strong> — CPU > 80% depuis 15 min', time: 'Il y a 8 min', color: 'var(--red)', bg: 'var(--red-light)' },
    { type: 'alert', msg: '<strong>vm-staging-04</strong> — RAM critique 88%', time: 'Il y a 22 min', color: 'var(--red)', bg: 'var(--red-light)' },
    { type: 'warn', msg: '<strong>esxi-host-01</strong> — CPU host à 72%, surveiller', time: 'Il y a 1h', color: 'var(--amber)', bg: 'var(--amber-light)' },
  ]);
}
