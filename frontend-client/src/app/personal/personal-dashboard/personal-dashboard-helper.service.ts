import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Personal {
  id: number;
  profession: string;
  client?: {
    id: number;
    nom: string;
    prenom: string;
    email: string;
  };
}

export interface VM {
  id: string; name: string; os: string; cpu: number; ram: number;
  disk: number; cpuUse: number; ramUse: number;
  status: 'running' | 'stopped' | 'provisioning'; ip: string; cost: number;
  catalogName: string;
}

export interface VmCatalogue {
  id: number;
  nomService: string;
  prix: number | string;
  vcpu: number;
  ramMB: number;
  stockageGB: number;
}

export interface VmEntity {
  id: number;
  nomPersonnalise: string;
  status: 'AWAITING_PAYMENT' | 'PROVISIONING' | 'RUNNING' | 'STOPPED' | 'FAILED';
  dateCreation: string;
  vCPU: number;
  ramGB: number;
  stockageGB: number;
  ipAddress?: string | null;
  vmReference?: string | null;
  os?: string | null;
  catalogue?: VmCatalogue | null;
}

export interface CreateVmPayload {
  name: string;
  ramGB: number;
  vCPU: number;
  storageGB: number;
  templateName: string;
  catalogueId?: number;
}

export interface EsxiVm {
  id: string;
  name: string;
  state: string;
  ram: string;
}

export interface VmTemplate {
  id: string;
  name: string;
  label: string;
}

export interface ServiceItem {
  id?: number;
  name: string; desc: string; icon: string; color: string; bg: string;
  price: string; specs: string[]; tag?: string; tagColor?: string;
  vcpu?: number; ramGB?: number; stockageGB?: number;
}

export interface Invoice {
  period: string; ref: string; resources: string;
  amount: string; status: string; statusClass: string;
}

@Injectable({ providedIn: 'root' })
export class PersonalDashboardHelperService {
  private readonly base = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  getMyVms() {
    return this.http.get<VmEntity[]>(`${this.base}/esxi/my-vms`);
  }

  getVmTemplates() {
    return this.http.get<{ status: string; count: number; data: EsxiVm[] }>(`${this.base}/esxi/vms`);
  }

  /* Catalog similar to entreprise */
  catalogTabs = signal([{ key: 'all', label: 'Tout' }, { key: 'vm', label: 'VM' }, { key: 'db', label: 'Bases' }, { key: 'saas', label: 'SaaS' }]);
  catalogFilter = signal<string>('all');
  catalogItems = signal<ServiceItem[]>([]);
  filteredCatalog = computed(() => {
    const f = this.catalogFilter();
    return f === 'all'
      ? this.catalogItems()
      : this.catalogItems().filter((i: ServiceItem) => i.name.toLowerCase().includes(f));
  });
  selectedService = signal<ServiceItem | null>(null);
  selectService(s: ServiceItem) { this.selectedService.set(s); }

  createVm(payload: CreateVmPayload) {
    return this.http.post<{ message: string; vmId: number; status: string; vm: VmEntity }>(
      `${this.base}/esxi/provision`,
      payload,
    );
  }

  deleteVm(id: string) {
    return this.http.delete<{ status: string; message: string; vmId: number }>(
      `${this.base}/esxi/my-vms/${id}`,
    );
  }

  powerVm(id: string, action: 'start' | 'stop') {
    return this.http.post<{ status: string; message: string; vmId: number; newStatus: string }>(
      `${this.base}/esxi/my-vms/${id}/power`,
      { action },
    );
  }

  toVm(entity: VmEntity): VM {
    const statusMap: Record<VmEntity['status'], VM['status']> = {
      AWAITING_PAYMENT: 'provisioning',
      PROVISIONING: 'provisioning',
      RUNNING: 'running',
      STOPPED: 'stopped',
      FAILED: 'stopped',
    };

    return {
      id: String(entity.id),
      name: entity.nomPersonnalise,
      os: entity.os ?? 'Windows 2000',
      cpu: entity.vCPU,
      ram: entity.ramGB,
      disk: entity.stockageGB,
      cpuUse: entity.status === 'RUNNING' ? 15 : 0,
      ramUse: entity.status === 'RUNNING' ? 20 : 0,
      status: statusMap[entity.status] ?? 'provisioning',
      ip: entity.ipAddress ?? entity.vmReference ?? 'Provisioning',
      cost: Number(entity.catalogue?.prix ?? this.getCatalogPriceForVm(entity)),
      catalogName: entity.catalogue?.nomService ?? this.getCatalogNameForVm(entity),
    };
  }

  getCatalogNameForVm(entity: Pick<VmEntity, 'vCPU' | 'ramGB' | 'stockageGB'>): string {
    const plan = this.catalogItems().find((item) =>
      item.icon === 'vm' &&
      item.vcpu === entity.vCPU &&
      item.ramGB === entity.ramGB &&
      item.stockageGB === entity.stockageGB
    );

    return plan?.name ?? 'Offre catalogue non liee';
  }

  getCatalogPriceForVm(entity: Pick<VmEntity, 'vCPU' | 'ramGB' | 'stockageGB'>): number {
    const plan = this.catalogItems().find((item) =>
      item.icon === 'vm' &&
      item.vcpu === entity.vCPU &&
      item.ramGB === entity.ramGB &&
      item.stockageGB === entity.stockageGB
    );

    return Number(plan?.price ?? 0);
  }

  metricColor(v: number): string {
    if (v > 80) return 'var(--red)';
    if (v > 60) return 'var(--amber)';
    return 'var(--blue)';
  }

  createRandomBars(): number[] {
    return Array.from({ length: 12 }, () => Math.floor(Math.random() * 85) + 10);
  }

  loadCatalog(onDone?: () => void) {
    this.http.get<any[]>(`${this.base}/catalogue`).subscribe({
      next: (data) => {
        const items: ServiceItem[] = (data || []).map((cat: any) => {
          const isVm = cat.type === 'vm' || cat.vcpu !== undefined || cat.ramMB !== undefined;
          const icon = isVm ? 'vm' : (cat.type || 'saas');
          const specs = cat.specs 
            ? (typeof cat.specs === 'string' ? cat.specs.split('·').map((s: string) => s.trim()) : cat.specs)
            : [
                `${cat.vcpu || 0} vCPU`,
                `${cat.ramMB || 0} GB RAM`,
                `${cat.stockageGB || 0} GB SSD`
              ];

          return {
            id: cat.id !== undefined ? Number(cat.id) : undefined,
            name: cat.nomService || cat.name || 'Service sans nom',
            desc: cat.description || cat.desc || '',
            icon: icon,
            color: cat.color || 'var(--blue)',
            bg: cat.bg || 'var(--blue-light)',
            price: String(cat.prix !== undefined ? cat.prix : (cat.price || '0.00')),
            specs: specs,
            tag: cat.tag || (isVm ? 'IaaS' : undefined),
            tagColor: cat.tagColor || (isVm ? 'var(--blue-l)' : undefined),
            vcpu: Number(cat.vcpu ?? 0),
            ramGB: Number(cat.ramMB ?? 0),
            stockageGB: Number(cat.stockageGB ?? 0),
          };
        });
        this.catalogItems.set(items);
        onDone?.();
      },
      error: (err) => {
        console.error('Failed to load catalog', err);
        onDone?.();
      }
    });
  }
}
