import { Component, signal } from '@angular/core';

interface K8sNamespace {
  id: string; name: string; tenant: string; pods: number;
  services: number; cpuReq: string; ramReq: string; status: 'approved' | 'rejected';
}

@Component({
  selector: 'app-kubernetes-page',
  standalone: true,
  imports: [],
  templateUrl: './kubernetes-page.html',
})
export class KubernetesPageComponent {
  k8sStats = signal([
    { label: 'Nodes', val: '6', sub: 'Tous opérationnels', bg: 'var(--blue-light)', color: 'var(--blue)' },
    { label: 'Pods running', val: '124', sub: 'Sur 200 max', bg: 'var(--green-light)', color: 'var(--green)' },
    { label: 'Namespaces', val: '18', sub: 'Tenants isolés', bg: 'var(--purple-light)', color: 'var(--purple)' },
    { label: 'Services actifs', val: '47', sub: 'LoadBalancers + ClusterIP', bg: 'var(--teal-light)', color: 'var(--teal)' },
  ]);

  k8sNamespaces = signal<K8sNamespace[]>([
    { id: 'n1', name: 'ns-cloudnet-prod', tenant: 'CloudNet SA', pods: 14, services: 6, cpuReq: '4 cores', ramReq: '8 GB', status: 'approved' },
    { id: 'n2', name: 'ns-bistech-prod', tenant: 'BisTech Group', pods: 8, services: 3, cpuReq: '2 cores', ramReq: '4 GB', status: 'approved' },
    { id: 'n3', name: 'ns-alphasys-prod', tenant: 'AlphaSys', pods: 22, services: 9, cpuReq: '8 cores', ramReq: '16 GB', status: 'approved' },
    { id: 'n4', name: 'ns-dataprime-dev', tenant: 'DataPrime SARL', pods: 5, services: 2, cpuReq: '1 core', ramReq: '2 GB', status: 'rejected' },
    { id: 'n5', name: 'ns-dynamix-system', tenant: 'Dynamix (interne)', pods: 18, services: 8, cpuReq: '6 cores', ramReq: '12 GB', status: 'approved' },
  ]);

  k8sResources = signal([
    { label: 'CPU alloué', val: '31 / 48 cores', pct: 64, color: 'blue' },
    { label: 'RAM allouée', val: '42 / 96 GB', pct: 43, color: 'teal' },
    { label: 'Stockage PVC', val: '820 / 2000 GB', pct: 41, color: 'amber' },
    { label: 'Pods utilisés', val: '124 / 200', pct: 62, color: 'blue' },
  ]);
}
