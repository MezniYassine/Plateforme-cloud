import { Component, signal } from '@angular/core';

interface ESXiHost {
  id: string; name: string; model: string; ip: string;
  vcpu: number; ram: number; cpuPct: number; ramPct: number;
  vms: number; status: 'approved' | 'rejected';
}

@Component({
  selector: 'app-esxi-page',
  standalone: true,
  imports: [],
  templateUrl: './esxi-page.html',
})
export class EsxiPageComponent {
  esxiStats = signal([
    { label: 'Hôtes ESXi', val: '4', sub: 'En ligne', bg: 'var(--blue-light)', color: 'var(--blue)' },
    { label: 'vCPU total', val: '256', sub: '72% alloués', bg: 'var(--teal-light)', color: 'var(--teal)' },
    { label: 'RAM totale', val: '1 TB', sub: '58% utilisés', bg: 'var(--purple-light)', color: 'var(--purple)' },
    { label: 'VMs actives', val: '87', sub: 'Sur 4 hôtes', bg: 'var(--green-light)', color: 'var(--green)' },
  ]);

  esxiHosts = signal<ESXiHost[]>([
    { id: 'h1', name: 'esxi-host-01', model: 'Dell PowerEdge R750', ip: '10.0.0.11', vcpu: 64, ram: 256, cpuPct: 72, ramPct: 65, vms: 24, status: 'approved' },
    { id: 'h2', name: 'esxi-host-02', model: 'Dell PowerEdge R750', ip: '10.0.0.12', vcpu: 64, ram: 256, cpuPct: 58, ramPct: 71, vms: 22, status: 'approved' },
    { id: 'h3', name: 'esxi-host-03', model: 'HP ProLiant DL380', ip: '10.0.0.13', vcpu: 64, ram: 256, cpuPct: 45, ramPct: 42, vms: 19, status: 'approved' },
    { id: 'h4', name: 'esxi-host-04', model: 'HP ProLiant DL380', ip: '10.0.0.14', vcpu: 64, ram: 256, cpuPct: 31, ramPct: 38, vms: 22, status: 'approved' },
  ]);
}
