import { Injectable } from '@angular/core';

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
}

export interface ServiceItem {
  name: string; desc: string; icon: string; color: string; bg: string;
  price: string; specs: string[]; tag?: string; tagColor?: string;
}

export interface Invoice {
  period: string; ref: string; resources: string;
  amount: string; status: string; statusClass: string;
}

@Injectable({ providedIn: 'root' })
export class PersonalDashboardHelperService {
  metricColor(v: number): string {
    if (v > 80) return 'var(--red)';
    if (v > 60) return 'var(--amber)';
    return 'var(--blue)';
  }

  createRandomBars(): number[] {
    return Array.from({ length: 12 }, () => Math.floor(Math.random() * 85) + 10);
  }
}
