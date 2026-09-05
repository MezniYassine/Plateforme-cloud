import { Component, computed, inject, input, output, signal, effect, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DeployedResource, TeamMember } from '../../entreprise-helper.service';
import { environment } from '../../../../../environments/environment';

export interface MetricHistoryItem {
  cpu: number;
  ram: number;
  disk: number;
  timestamp: string;
}

@Component({
  selector: 'ent-monitoring-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './monitoring-page.html',
  styleUrls: ['./monitoring-page.scss'],
  encapsulation: ViewEncapsulation.None
})
export class MonitoringPageComponent {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl.replace(/\/$/, '');

  deployedResources = input.required<DeployedResource[]>();
  teamMembers = input.required<TeamMember[]>();

  resourceDeployed = output<void>();
  navigateTo = output<string>();

  // Search & Filters
  searchTerm = signal<string>('');
  selectedFilter = signal<string>('ALL'); // 'ALL' | 'RUNNING' | 'STOPPED'
  typeFilter = signal<string>('all'); // 'all' | 'iaas' | 'paas' | 'saas'
  ownerFilter = signal<string>('ALL');

  // Metric mode per resource: 'cpu' | 'ram' | 'disk'
  selectedMetric = signal<Record<string, 'cpu' | 'ram' | 'disk'>>({});

  // Range mode per resource: '1h' | '24h' | 'yesterday' | '7d'
  selectedRange = signal<Record<string, '1h' | '24h' | 'yesterday' | '7d'>>({});

  // Live 1h metrics history & custom range history
  monitorHistory = signal<Record<string, MetricHistoryItem[]>>({});
  customHistory = signal<Record<string, MetricHistoryItem[]>>({});
  isLoadingRange = signal<Record<string, boolean>>({});

  // Hovered item per resource for live inspection
  hoveredItem = signal<Record<string, { item: MetricHistoryItem; idx: number } | null>>({});

  private loadingHistory = new Set<string>();

  // ── KPI Summary Calculations ──────────────────────────────────────────
  totalVmsCount = computed(() => (this.deployedResources() || []).length);

  runningVmsCount = computed(() => {
    return (this.deployedResources() || []).filter(v => v.status === 'RUNNING' || v.status === 'running').length;
  });

  stoppedVmsCount = computed(() => {
    return this.totalVmsCount() - this.runningVmsCount();
  });

  avgCpuUsage = computed(() => {
    const running = (this.deployedResources() || []).filter(v => (v.status === 'RUNNING' || v.status === 'running') && v.cpu !== null && v.cpu !== undefined);
    if (running.length === 0) return 0;
    const sum = running.reduce((acc, v) => acc + (Number(v.cpu) || 0), 0);
    return Math.round(sum / running.length);
  });

  avgRamUsage = computed(() => {
    const running = (this.deployedResources() || []).filter(v => (v.status === 'RUNNING' || v.status === 'running') && v.ram !== null && v.ram !== undefined);
    if (running.length === 0) return 0;
    const sum = running.reduce((acc, v) => acc + (Number(v.ram) || 0), 0);
    return Math.round(sum / running.length);
  });

  // ── Filtered List ──────────────────────────────────────────────────────
  filteredVms = computed(() => {
    const list = this.deployedResources() || [];
    const search = this.searchTerm().trim().toLowerCase();
    const filter = this.selectedFilter();
    const type = this.typeFilter();
    const owner = this.ownerFilter();

    return list.filter(v => {
      // 1. Type Filter
      if (type === 'iaas' && (v.type || '').toLowerCase() !== 'vm') return false;
      if (type === 'paas' && (v.type || '').toLowerCase() !== 'db' && (v.type || '').toLowerCase() !== 'paas') return false;
      if (type === 'saas' && (v.type || '').toLowerCase() !== 'saas') return false;

      // 2. Owner Filter
      if (owner !== 'ALL') {
        const oId = String(v.ownerId ?? '');
        const oName = (v.owner || '').toLowerCase();
        if (oId !== owner && !oName.includes(owner.toLowerCase())) return false;
      }

      // 3. Status Filter
      const isRunning = v.status === 'RUNNING' || v.status === 'running';
      if (filter === 'RUNNING' && !isRunning) return false;
      if (filter === 'STOPPED' && isRunning) return false;

      // 4. Search term
      if (search) {
        const matchName = (v.name || '').toLowerCase().includes(search);
        const matchOs = (v.os || '').toLowerCase().includes(search);
        const matchIp = (v.ip || '').toLowerCase().includes(search);
        const matchOwner = (v.owner || '').toLowerCase().includes(search);
        const matchSpecs = (v.specs || '').toLowerCase().includes(search);
        if (!matchName && !matchOs && !matchIp && !matchOwner && !matchSpecs) {
          return false;
        }
      }

      return true;
    });
  });

  constructor() {
    effect(() => {
      const resources = this.deployedResources();
      for (const res of resources) {
        this.ensureMonitorBars(res);
      }
    });
  }

  getMetricTextColor(val: number | null): string {
    if (val === null || val === undefined) return '#94a3b8';
    if (val >= 80) return '#dc2626';
    if (val >= 50) return '#d97706';
    return '#059669';
  }

  statusLabel(status?: string): string {
    if (status === 'RUNNING' || status === 'running') return 'En ligne';
    return 'Arrêtée';
  }

  // ── Metric Mode Helpers ───────────────────────────────────────────────
  getMetricMode(resId: string): 'cpu' | 'ram' | 'disk' {
    return this.selectedMetric()[resId] ?? 'cpu';
  }

  setMetricMode(resId: string, mode: 'cpu' | 'ram' | 'disk', event?: Event) {
    if (event) event.stopPropagation();
    this.selectedMetric.update(m => ({ ...m, [resId]: mode }));
  }

  getMetricUnit(mode: 'cpu' | 'ram' | 'disk'): string {
    if (mode === 'disk') return 'Mo';
    return '%';
  }

  getMetricLabel(mode: 'cpu' | 'ram' | 'disk'): string {
    switch (mode) {
      case 'cpu': return 'Charge CPU';
      case 'ram': return 'Mémoire RAM';
      case 'disk': return 'Stockage Disque';
    }
  }

  // ── Range Selection Helpers ───────────────────────────────────────────
  getRange(resId: string): '1h' | '24h' | 'yesterday' | '7d' {
    return this.selectedRange()[resId] ?? '1h';
  }

  setRange(res: DeployedResource, range: '1h' | '24h' | 'yesterday' | '7d', event?: Event) {
    if (event) event.stopPropagation();
    this.selectedRange.update(r => ({ ...r, [res.id]: range }));

    if (range === '1h') return;

    this.isLoadingRange.update(l => ({ ...l, [res.id]: true }));
    const backendType = res.type === 'db' ? 'PAAS' : res.type === 'saas' ? 'SAAS' : 'IAAS';
    const id = res.realId || res.id;

    this.http.get<MetricHistoryItem[]>(`${this.base}/metrics/history/${backendType}/${id}?range=${range}`).subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.customHistory.update(c => ({ ...c, [res.id]: data }));
        } else {
          this.generateCustomHistory(res, range);
        }
        this.isLoadingRange.update(l => ({ ...l, [res.id]: false }));
      },
      error: () => {
        this.generateCustomHistory(res, range);
        this.isLoadingRange.update(l => ({ ...l, [res.id]: false }));
      }
    });
  }

  // ── Hover Inspection Helpers ──────────────────────────────────────────
  setHoveredItem(resId: string, item: MetricHistoryItem | null, idx = 0) {
    if (!item) {
      this.hoveredItem.update(h => ({ ...h, [resId]: null }));
    } else {
      this.hoveredItem.update(h => ({ ...h, [resId]: { item, idx } }));
    }
  }

  getHoveredOrLatest(resId: string, res: DeployedResource): { label: string; time: string; cpu: number; ram: number; disk: number; isHovered: boolean } {
    const range = this.getRange(resId);
    const hovered = this.hoveredItem()[resId];
    if (hovered && hovered.item) {
      const timeStr = this.formatReadoutTime(hovered.item.timestamp, range);
      const totalCount = this.getHistoryItems(resId).length;
      return {
        label: `Point inspecté (${hovered.idx + 1}/${totalCount})`,
        time: timeStr,
        cpu: hovered.item.cpu,
        ram: hovered.item.ram,
        disk: hovered.item.disk,
        isHovered: true
      };
    }

    const history = this.getHistoryItems(resId);
    const last = history[history.length - 1];
    const isLiveMode = range === '1h';
    const isRunning = res.status === 'RUNNING' || res.status === 'running';
    const timeStr = last ? this.formatReadoutTime(last.timestamp, range) : (isLiveMode ? 'En direct' : '-');

    return {
      label: isLiveMode ? 'En direct' : 'Fin de période',
      time: timeStr,
      cpu: isLiveMode ? (isRunning ? (Number(res.cpu) || 0) : 0) : (last?.cpu || 0),
      ram: isLiveMode ? (isRunning ? (Number(res.ram) || 0) : 0) : (last?.ram || 0),
      disk: last?.disk || Number(this.getDisk(res)) || 12,
      isHovered: false
    };
  }

  // ── History & Bar Value Helpers ───────────────────────────────────────
  ensureMonitorBars(res: DeployedResource) {
    if (this.monitorHistory()[res.id] || this.loadingHistory.has(res.id)) return;
    this.loadingHistory.add(res.id);

    const backendType = res.type === 'db' ? 'PAAS' : res.type === 'saas' ? 'SAAS' : 'IAAS';
    const id = res.realId || res.id;

    this.http.get<MetricHistoryItem[]>(`${this.base}/metrics/history/${backendType}/${id}?range=1h`).subscribe({
      next: (history) => {
        if (history && history.length > 0) {
          this.monitorHistory.update(h => ({ ...h, [res.id]: history }));
        } else {
          this.generateFallbackLiveHistory(res);
        }
      },
      error: () => {
        this.generateFallbackLiveHistory(res);
      }
    });
  }

  private generateFallbackLiveHistory(res: DeployedResource) {
    const now = Date.now();
    const isRunning = res.status === 'RUNNING' || res.status === 'running';
    const currentCpu = isRunning ? (Number(res.cpu) || 0) : 0;
    const currentRam = isRunning ? (Number(res.ram) || 0) : 0;
    const disk = Number(this.getDisk(res)) || 12;

    const items: MetricHistoryItem[] = Array.from({ length: 20 }, (_, i) => {
      if (!isRunning) {
        return { cpu: 0, ram: 0, disk: 0, timestamp: new Date(now - (19 - i) * 3 * 60 * 1000).toISOString() };
      }
      const variation = Math.sin(i * 0.5) * 5;
      const c = Math.max(0, Math.min(100, Math.round(currentCpu + variation)));
      const r = Math.max(0, Math.min(100, Math.round(currentRam + (i % 2 === 0 ? 2 : -2))));
      return {
        cpu: c,
        ram: r,
        disk,
        timestamp: new Date(now - (19 - i) * 3 * 60 * 1000).toISOString(),
      };
    });

    if (items.length > 0 && isRunning) {
      items[items.length - 1].cpu = currentCpu;
      items[items.length - 1].ram = currentRam;
    }

    this.monitorHistory.update(h => ({ ...h, [res.id]: items }));
  }

  private generateCustomHistory(res: DeployedResource, range: '24h' | 'yesterday' | '7d') {
    const now = Date.now();
    const isRunning = res.status === 'RUNNING' || res.status === 'running';
    const baseCpu = isRunning ? (Number(res.cpu) || 0) : 0;
    const baseRam = isRunning ? (Number(res.ram) || 0) : 0;
    const disk = Number(this.getDisk(res)) || 12;
    const count = 20;

    let stepMs = 72 * 60 * 1000; // 24h
    if (range === 'yesterday') stepMs = 72 * 60 * 1000;
    if (range === '7d') stepMs = 500 * 60 * 1000;

    const items: MetricHistoryItem[] = Array.from({ length: count }, (_, i) => {
      const ts = new Date(now - (count - 1 - i) * stepMs).toISOString();
      if (!isRunning) {
        return { cpu: 0, ram: 0, disk: 0, timestamp: ts };
      }
      const c = Math.max(0, Math.min(100, Math.round(baseCpu + (Math.sin(i * 0.8) * 12))));
      const r = Math.max(0, Math.min(100, Math.round(baseRam + (Math.cos(i * 0.8) * 8))));
      return { cpu: c, ram: r, disk, timestamp: ts };
    });

    this.customHistory.update(c => ({ ...c, [res.id]: items }));
  }

  getHistoryItems(resId: string): MetricHistoryItem[] {
    const range = this.getRange(resId);
    if (range !== '1h') {
      const custom = this.customHistory()[resId];
      if (custom && custom.length > 0) {
        return custom;
      }
    }

    const hist = this.monitorHistory()[resId];
    if (hist && hist.length > 0) {
      return hist;
    }

    const now = Date.now();
    return Array.from({ length: 20 }, (_, i) => ({
      cpu: 0,
      ram: 0,
      disk: 0,
      timestamp: new Date(now - (19 - i) * 3 * 60 * 1000).toISOString(),
    }));
  }

  getBarValue(item: MetricHistoryItem, mode: 'cpu' | 'ram' | 'disk'): number {
    switch (mode) {
      case 'cpu': return Math.max(0, Math.min(100, item.cpu || 0));
      case 'ram': return Math.max(0, Math.min(100, item.ram || 0));
      case 'disk': return Math.max(0, Math.min(100, Math.round(((item.disk || 12) / 50) * 100)));
    }
  }

  getBarColor(val: number, mode: 'cpu' | 'ram' | 'disk' = 'cpu'): string {
    if (mode === 'ram') {
      if (val >= 85) return 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)';
      if (val >= 65) return 'linear-gradient(180deg, #8b5cf6 0%, #6d28d9 100%)';
      return 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)';
    }
    if (mode === 'disk') {
      return 'linear-gradient(180deg, #06b6d4 0%, #0d9488 100%)';
    }
    // CPU mode
    if (val >= 80) return 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)';
    if (val >= 50) return 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)';
    return 'linear-gradient(180deg, #10b981 0%, #059669 100%)';
  }

  formatTooltipTime(ts: string, range = '1h'): string {
    if (!ts) return '';
    const d = new Date(ts);
    const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (range === '7d') {
      return `Moyenne du ${d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`;
    }
    if (range === 'yesterday') {
      return `Hier (${dateStr}) à ${timeStr}`;
    }
    return `${dateStr} à ${timeStr}`;
  }

  formatReadoutTime(ts: string, range = '1h'): string {
    if (!ts) return '';
    const d = new Date(ts);
    if (range === '7d') {
      return 'Moyenne du ' + d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    }
    if (range === 'yesterday') {
      return 'Hier à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    if (range === '24h') {
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  tickIndices(resId: string): number[] {
    const items = this.getHistoryItems(resId);
    const n = items.length;
    if (n === 0) return [];
    if (n <= 7) return items.map((_, i) => i);
    const step = (n - 1) / 4;
    return [0, 1, 2, 3, 4].map(k => Math.round(k * step));
  }

  timeAt(resId: string, idx: number): string {
    const items = this.getHistoryItems(resId);
    const item = items[idx];
    if (!item) return '';
    const d = new Date(item.timestamp);
    const range = this.getRange(resId);
    if (range === '7d') {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      return `${day}/${month}`;
    }
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  getTimeTickPercent(resId: string, idx: number): number {
    const items = this.getHistoryItems(resId);
    if (items.length <= 1) return 0;
    return (idx / (items.length - 1)) * 100;
  }

  // ── Spec & Visual Formatters ──────────────────────────────────────────
  getServiceLogo(res: DeployedResource): string {
    const name = (res.name || '').toLowerCase();
    const os = (res.os || '').toLowerCase();
    const type = (res.type || '').toLowerCase();

    if (name.includes('wordpress') || name.includes('wp')) return 'assets/Wordpress logo.png';
    if (name.includes('n8n')) return 'assets/n8n_Logo.png';
    if (name.includes('pgadmin') || name.includes('postgres') || name.includes('psql')) return 'assets/PostgreSQL Logo.png';
    if (name.includes('phpmyadmin') || name.includes('mysql') || name.includes('phpsql')) return 'assets/MySQL Logo.png';
    if (name.includes('mongo')) return 'assets/MongoDB Logo.png';
    if (name.includes('redis')) return 'assets/Redis logo.png';

    if (os.includes('ubuntu') || name.includes('ubuntu')) return 'assets/ubuntu.png';
    if (os.includes('debian') || name.includes('debian')) return 'assets/Debian.png';
    if (os.includes('alpine') || name.includes('alpine')) return 'assets/alpine.png';
    if (os.includes('2000') || name.includes('2000')) return 'assets/windows 2000.png';
    if (os.includes('windows') || os.includes('win') || name.includes('win')) return 'assets/windows 7.png';

    if (type === 'db' || type === 'paas') return 'assets/MySQL Logo.png';
    if (type === 'saas') return 'assets/Wordpress logo.png';

    return 'assets/ubuntu.png';
  }

  getVcpu(res: DeployedResource): string {
    const s = res.specs || '';
    const match = s.match(/(\d+)\s*(?:vCPU|CPU|Cores?)/i);
    return match ? match[1] : '1';
  }

  getDisk(res: DeployedResource): string {
    if (res.storage) return String(res.storage);
    const s = res.specs || '';
    const match = s.match(/(\d+)\s*(?:GB|Go)\s*(?:SSD|Stockage|Disque)?/i);
    return match ? match[1] : '12';
  }

  getRam(res: DeployedResource): string {
    if (res.ram !== undefined && res.ram !== null) return String(res.ram);
    const s = res.specs || '';
    const match = s.match(/(\d+)\s*(?:GB|Go)\s*RAM/i);
    return match ? match[1] : '0';
  }
}
