import { Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { VM } from '../../personal-dashboard-helper.service';
import { PersonalDashboardHelperService } from '../../personal-dashboard-helper.service';

@Component({
  selector: 'app-monitor-tab',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './monitor-tab.html',
})
export class MonitorTabComponent {
  vms = input.required<VM[]>();
  monitorBars = input.required<Record<string, number[]>>();
  monitorBarTimes = input<Record<string, string[]>>({});
  lastRefresh = input<Date | null>(null);

  constructor(public h: PersonalDashboardHelperService) { }

  formatRefresh(d: Date | null): string {
    if (!d) return 'En attente…';
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'running': return 'Running';
      case 'stopped': return 'Arrêtée';
      case 'provisioning': return 'En cours…';
      case 'pending': return 'En attente…';
      default: return status;
    }
  }

  statusClass(status: string): string {
    switch (status) {
      case 'running': return 'badge running';
      case 'stopped': return 'badge stopped';
      case 'provisioning': return 'badge pending';
      default: return 'badge';
    }
  }

  /**
   * Retourne les indices des barres pour lesquels on affiche un label de temps.
   * On affiche toujours le premier, le dernier et environ 3 intermédiaires.
   */
  tickIndices(vmId: string): number[] {
    const bars = this.monitorBars()[vmId] ?? [];
    const n = bars.length;
    if (n === 0) return [];
    if (n <= 5) return bars.map((_, i) => i);
    // Afficher 5 ticks : 0, 25%, 50%, 75%, 100%
    const step = (n - 1) / 4;
    return [0, 1, 2, 3, 4].map(k => Math.round(k * step));
  }

  timeAt(vmId: string, idx: number): string {
    const times = this.monitorBarTimes()[vmId] ?? [];
    return times[idx] ?? '';
  }
}
