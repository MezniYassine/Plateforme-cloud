import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { WalletService } from '../../services/wallet.service';

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
  disk: number; cpuUse: number | null; ramUse: number | null;
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
  cpuUse?: number | null;
  ramUse?: number | null;
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
  private http = inject(HttpClient);
  private walletSvc = inject(WalletService);

  // --- Wallet ---
  walletSolde = signal<number>(0);
  walletDevise = signal<string>('DT');
  walletLoading = signal<boolean>(false);

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

    const isRunning = entity.status === 'RUNNING';

    // Calculer le prix de l'offre catalogue ou l'estimer dynamiquement selon la puissance de l'instance
    let cost = 0;
    if (entity.catalogue && entity.catalogue.prix !== undefined) {
      cost = Number(entity.catalogue.prix);
    } else {
      cost = Number(this.getCatalogPriceForVm(entity));
      if (!cost || cost <= 0) {
        // Formule d'estimation réaliste si pas liée au catalogue : 10 DT de base + 5 DT/vCPU + 2.5 DT/GB RAM + 0.1 DT/GB SSD
        const vcpuCount = entity.vCPU || 1;
        const ramGb = entity.ramGB || 1;
        const storageGb = entity.stockageGB || 20;
        cost = 10 + (vcpuCount * 5) + (ramGb * 2.5) + (storageGb * 0.1);
      }
    }
    cost = Math.round(cost * 100) / 100;
    const cpuUsage = isRunning ? this.normalizePercent(entity.cpuUse) : 0;
    const ramUsage = isRunning ? this.normalizePercent(entity.ramUse) : 0;

    return {
      id: String(entity.id),
      name: entity.nomPersonnalise,
      os: entity.os ?? 'Windows 7',
      cpu: entity.vCPU,
      ram: entity.ramGB,
      disk: entity.stockageGB,
      cpuUse: cpuUsage,
      ramUse: ramUsage,
      status: statusMap[entity.status] ?? 'provisioning',
      ip: entity.ipAddress ?? entity.vmReference ?? 'Provisioning',
      cost,
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

  private normalizePercent(value: number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
      return null;
    }

    return Math.max(0, Math.min(100, Math.round(numeric)));
  }
  metricColor(v: number | null): string {
    const value = v ?? 0;
    if (value > 80) return 'var(--red)';
    if (value > 60) return 'var(--amber)';
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

  loadWallet() {
    this.walletSvc.getWallet().subscribe({
      next: (data) => {
        this.walletSolde.set(data.solde);
        this.walletDevise.set(data.devise);
      },
      error: () => { }
    });
  }

  rechargerWallet() {
    if (this.walletLoading()) return;
    this.walletLoading.set(true);
    this.walletSvc.recharger().subscribe({
      next: (res) => {
        this.walletSolde.set(res.nouveauSolde);
        this.walletLoading.set(false);
        // Toast is normally handled at component level or via a notification service
        // For simplicity, we just log or alert if needed, or rely on UI updates
      },
      error: (err) => {
        this.walletLoading.set(false);
        console.error('Erreur recharge wallet', err);
        alert(err?.error?.message ?? 'Impossible de recharger le wallet');
      }
    });
  }
}
