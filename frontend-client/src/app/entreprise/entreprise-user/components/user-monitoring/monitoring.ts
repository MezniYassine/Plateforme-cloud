import { Component, inject, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardHelperService, MetricHistoryItem, MyVM } from '../../dashboard-helper.service';

@Component({
  selector: 'app-monitoring',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './monitoring.html',
  styleUrls: ['./monitoring.scss']
})
export class Monitoring {
  state = inject(DashboardHelperService);

  // Search and status filter
  searchTerm = signal<string>('');
  selectedFilter = signal<string>('ALL'); // 'ALL' | 'RUNNING' | 'STOPPED'

  // Metric mode per VM: 'cpu' | 'ram' | 'disk'
  selectedMetric = signal<Record<string, 'cpu' | 'ram' | 'disk'>>({});

  // Range mode per VM: '1h' | '24h' | 'yesterday' | '7d'
  selectedRange = signal<Record<string, '1h' | '24h' | 'yesterday' | '7d'>>({});

  // Live 1h metrics history & custom range history
  monitorHistory = signal<Record<string, MetricHistoryItem[]>>({});
  customHistory = signal<Record<string, MetricHistoryItem[]>>({});
  isLoadingRange = signal<Record<string, boolean>>({});

  // Hovered item per VM for live inspection
  hoveredItem = signal<Record<string, { item: MetricHistoryItem; idx: number } | null>>({});

  private loadingHistory = new Set<string>();

  // ── KPI Summary Calculations ──────────────────────────────────────────
  totalVmsCount = computed(() => (this.state.myVMs() || []).length);

  runningVmsCount = computed(() => {
    return (this.state.myVMs() || []).filter(v => v.status === 'running').length;
  });

  stoppedVmsCount = computed(() => {
    return (this.state.myVMs() || []).filter(v => v.status !== 'running').length;
  });

  avgCpuUsage = computed(() => {
    const running = (this.state.myVMs() || []).filter(v => v.status === 'running' && v.cpu !== null);
    if (running.length === 0) return 0;
    const sum = running.reduce((acc, v) => acc + (v.cpu ?? 0), 0);
    return Math.round(sum / running.length);
  });

  avgRamUsage = computed(() => {
    const running = (this.state.myVMs() || []).filter(v => v.status === 'running' && v.ram !== null);
    if (running.length === 0) return 0;
    const sum = running.reduce((acc, v) => acc + (v.ram ?? 0), 0);
    return Math.round(sum / running.length);
  });

  // ── Filtered List ──────────────────────────────────────────────────────
  filteredVms = computed(() => {
    const list = this.state.myVMs() || [];
    const search = this.searchTerm().trim().toLowerCase();
    const filter = this.selectedFilter();

    return list.filter(v => {
      const matchSearch = !search ||
        (v.name && v.name.toLowerCase().includes(search)) ||
        (v.os && v.os.toLowerCase().includes(search)) ||
        (v.ip && v.ip.toLowerCase().includes(search));

      let matchFilter = true;
      if (filter === 'RUNNING') matchFilter = v.status === 'running';
      if (filter === 'STOPPED') matchFilter = v.status !== 'running';

      return matchSearch && matchFilter;
    });
  });

  constructor() {
    // Automatically load telemetry for all user VMs
    effect(() => {
      const vms = this.state.myVMs();
      for (const vm of vms) {
        this.ensureMonitorBars(vm.id);
      }
    });
  }

  getMetricTextColor(val: number | null): string {
    if (val === null) return '#94a3b8';
    if (val >= 80) return '#dc2626';
    if (val >= 50) return '#d97706';
    return '#059669';
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'running': return 'En ligne';
      case 'stopped': return 'Arrêtée';
      default: return status;
    }
  }

  // ── Metric Mode Helpers ───────────────────────────────────────────────
  getMetricMode(vmId: string): 'cpu' | 'ram' | 'disk' {
    return this.selectedMetric()[vmId] ?? 'cpu';
  }

  setMetricMode(vmId: string, mode: 'cpu' | 'ram' | 'disk', event?: Event) {
    if (event) event.stopPropagation();
    this.selectedMetric.update(m => ({ ...m, [vmId]: mode }));
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
  getRange(vmId: string): '1h' | '24h' | 'yesterday' | '7d' {
    return this.selectedRange()[vmId] ?? '1h';
  }

  setRange(vmId: string, range: '1h' | '24h' | 'yesterday' | '7d', event?: Event) {
    if (event) event.stopPropagation();
    this.selectedRange.update(r => ({ ...r, [vmId]: range }));

    if (range === '1h') {
      return;
    }

    this.isLoadingRange.update(l => ({ ...l, [vmId]: true }));
    this.state.getMetricHistory('IAAS', vmId, range).subscribe({
      next: (data) => {
        this.customHistory.update(c => ({ ...c, [vmId]: data || [] }));
        this.isLoadingRange.update(l => ({ ...l, [vmId]: false }));
      },
      error: (err) => {
        console.warn(`Erreur chargement métriques ${range} pour VM ${vmId}`, err);
        this.isLoadingRange.update(l => ({ ...l, [vmId]: false }));
      }
    });
  }

  // ── Hover Inspection Helpers ──────────────────────────────────────────
  setHoveredItem(vmId: string, item: MetricHistoryItem | null, idx = 0) {
    if (!item) {
      this.hoveredItem.update(h => ({ ...h, [vmId]: null }));
    } else {
      this.hoveredItem.update(h => ({ ...h, [vmId]: { item, idx } }));
    }
  }

  getHoveredOrLatest(vmId: string, vm: MyVM): { label: string; time: string; cpu: number; ram: number; disk: number; isHovered: boolean } {
    const range = this.getRange(vmId);
    const hovered = this.hoveredItem()[vmId];
    if (hovered && hovered.item) {
      const timeStr = this.formatReadoutTime(hovered.item.timestamp, range);
      const totalCount = this.getHistoryItems(vmId).length;
      return {
        label: `Point inspecté (${hovered.idx + 1}/${totalCount})`,
        time: timeStr,
        cpu: hovered.item.cpu,
        ram: hovered.item.ram,
        disk: hovered.item.disk,
        isHovered: true
      };
    }

    const history = this.getHistoryItems(vmId);
    const last = history[history.length - 1];
    const isLiveMode = range === '1h';
    const timeStr = last ? this.formatReadoutTime(last.timestamp, range) : (isLiveMode ? 'En direct' : '-');

    return {
      label: isLiveMode ? 'En direct' : 'Fin de période',
      time: timeStr,
      cpu: isLiveMode ? (vm.cpu ?? (last?.cpu || 0)) : (last?.cpu || 0),
      ram: isLiveMode ? (vm.ram ?? (last?.ram || 0)) : (last?.ram || 0),
      disk: last?.disk || (vm.disk || 0),
      isHovered: false
    };
  }

  // ── History & Bar Value Helpers ───────────────────────────────────────
  ensureMonitorBars(vmId: string) {
    if (this.monitorHistory()[vmId] || this.loadingHistory.has(vmId)) return;
    this.loadingHistory.add(vmId);

    this.state.getMetricHistory('IAAS', vmId, '1h').subscribe({
      next: (history) => {
        if (history && history.length > 0) {
          this.monitorHistory.update(h => ({ ...h, [vmId]: history }));
        } else {
          const now = Date.now();
          const items: MetricHistoryItem[] = Array.from({ length: 20 }, (_, i) => ({
            cpu: 0,
            ram: 0,
            disk: 0,
            timestamp: new Date(now - (19 - i) * 3 * 60 * 1000).toISOString(),
          }));
          this.monitorHistory.update(h => ({ ...h, [vmId]: items }));
        }
      },
      error: (err) => {
        console.warn(`Impossible de charger l'historique métrique pour VM ${vmId}`, err);
        const now = Date.now();
        const items: MetricHistoryItem[] = Array.from({ length: 20 }, (_, i) => ({
          cpu: 0,
          ram: 0,
          disk: 0,
          timestamp: new Date(now - (19 - i) * 3 * 60 * 1000).toISOString(),
        }));
        this.monitorHistory.update(h => ({ ...h, [vmId]: items }));
      }
    });
  }

  getHistoryItems(vmId: string): MetricHistoryItem[] {
    const range = this.getRange(vmId);
    if (range !== '1h') {
      const custom = this.customHistory()[vmId];
      if (custom && custom.length > 0) {
        return custom;
      }
    }

    const hist = this.monitorHistory()[vmId];
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
      case 'disk': return Math.max(0, Math.min(100, Math.round((item.disk / 50) * 100)));
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

  tickIndices(vmId: string): number[] {
    const items = this.getHistoryItems(vmId);
    const n = items.length;
    if (n === 0) return [];
    if (n <= 7) return items.map((_, i) => i);
    const step = (n - 1) / 4;
    return [0, 1, 2, 3, 4].map(k => Math.round(k * step));
  }

  timeAt(vmId: string, idx: number): string {
    const items = this.getHistoryItems(vmId);
    const item = items[idx];
    if (!item) return '';
    const d = new Date(item.timestamp);
    const range = this.getRange(vmId);
    if (range === '7d') {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      return `${day}/${month}`;
    }
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  getTimeTickPercent(vmId: string, idx: number): number {
    const items = this.getHistoryItems(vmId);
    if (items.length <= 1) return 0;
    return (idx / (items.length - 1)) * 100;
  }

  getOsLogo(os?: string): string {
    const o = (os || '').toLowerCase();
    if (o.includes('ubuntu')) return 'assets/ubuntu.png';
    if (o.includes('debian')) return 'assets/Debian.png';
    if (o.includes('alpine')) return 'assets/alpine.png';
    if (o.includes('2000')) return 'assets/windows 2000.png';
    if (o.includes('windows') || o.includes('win')) return 'assets/windows 7.png';
    return 'assets/ubuntu.png';
  }
}
