import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { DashboardHelperService, Activity } from '../../dashboard-helper.service';
import { forkJoin } from 'rxjs';

interface MonitorVM {
  id: number; name: string; owner: string; ownerEmail: string;
  cpu: number; ram: number; storage: number; os: string;
  ip: string | null; status: string; dateCreation: string;
  catalogueName: string | null;
  // Runtime metrics (from ESXi)
  runtimeState?: string; cpuUse?: number; ramUse?: number;
}

interface MonitorContainer {
  id: number; name: string; containerName: string; typeSgbd: string;
  owner: string; ownerEmail: string; hostIp: string; port: number;
  status: string; dateCreation: string; catalogueName: string | null;
  ramMB: number; stockageGB: number;
  // Live metrics
  cpuUsage?: string; ramUsage?: string; ramPercentage?: string;
  usedStorageMb?: number;
}

interface MonitorSaas {
  id: number; name: string; appName: string;
  owner: string; ownerEmail: string; url: string;
  status: string; dateCreation: string; catalogueName: string | null;
  // Live metrics (re-use container logic if available)
  cpuUsage?: string; ramUsage?: string; ramPercentage?: string;
  usedStorageMb?: number;
}

@Component({
  selector: 'app-monitoring-page',
  standalone: true,
  imports: [],
  templateUrl: './monitoring-page.html',
})
export class MonitoringPageComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  public h = inject(DashboardHelperService);
  private pollInterval: any;

  activeTab = signal<'iaas' | 'paas' | 'saas'>('iaas');

  vms = signal<MonitorVM[]>([]);
  containers = signal<MonitorContainer[]>([]);
  saasApps = signal<MonitorSaas[]>([]);

  // KPI Stats (top cards)
  monitorStats = signal([
    { label: 'Workloads actifs', val: '0', sub: 'Chargement...', bg: 'var(--blue-light)', color: 'var(--blue)', valColor: '' },
    { label: 'CPU moyen', val: '0%', sub: 'Sur toutes les VMs', bg: 'var(--green-light)', color: 'var(--green)', valColor: '' },
    { label: 'RAM moyenne', val: '0%', sub: 'Sur toutes les VMs', bg: 'var(--purple-light)', color: 'var(--purple)', valColor: '' },
    { label: 'Alertes AIOps', val: '0', sub: 'Aucune anomalie', bg: 'var(--amber-light)', color: 'var(--amber)', valColor: '' },
  ]);

  // AIOps Alerts (dynamic)
  aiopsAlerts = signal<Activity[]>([]);

  ngOnInit() {
    this.loadData();
    this.pollInterval = setInterval(() => this.loadData(), 15000);
  }

  ngOnDestroy() {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  setTab(tab: 'iaas' | 'paas' | 'saas') {
    this.activeTab.set(tab);
  }

  loadData() {
    const baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

    // Fetch monitoring data (VMs + Containers from DB)
    this.http.get<any>(`${baseUrl}/admin/monitoring`).subscribe({
      next: (data) => {
        // Process VMs
        const vmList: MonitorVM[] = data.vms || [];
        this.vms.set(vmList);

        // Process Containers — conserver les métriques live déjà affichées
        const prevContainers = this.containers();
        const containerList: MonitorContainer[] = (data.containers || []).map((c: MonitorContainer) => {
          const existing = prevContainers.find(p => p.id === c.id);
          return existing ? {
            ...c,
            cpuUsage: existing.cpuUsage,
            ramUsage: existing.ramUsage,
            ramPercentage: existing.ramPercentage,
            usedStorageMb: existing.usedStorageMb,
          } : c;
        });
        this.containers.set(containerList);

        // Process SaaS — conserver les métriques live déjà affichées
        const prevSaas = this.saasApps();
        const saasList: MonitorSaas[] = (data.saasApps || []).map((s: MonitorSaas) => {
          const existing = prevSaas.find(p => p.id === s.id);
          return existing ? {
            ...s,
            cpuUsage: existing.cpuUsage,
            ramUsage: existing.ramUsage,
            ramPercentage: existing.ramPercentage,
            usedStorageMb: existing.usedStorageMb,
          } : s;
        });
        this.saasApps.set(saasList);

        // Fetch live ESXi metrics
        this.http.get<any>(`${baseUrl}/esxi/host-stats`).subscribe({
          next: (res) => {
            const hostData = res?.data ?? res;
            if (hostData) {
              this.updateKPIs(vmList, containerList, saasList, hostData);
            }
          },
          error: () => this.updateKPIs(vmList, containerList, saasList, null)
        });

        // Fetch live container metrics for each running container and SaaS
        const runningContainers = containerList.filter(c => c.status === 'RUNNING');
        const runningSaas = saasList.filter(s => s.status === 'RUNNING');
        
        if (runningContainers.length > 0 || runningSaas.length > 0) {
          const paasRequests = runningContainers.map(c => this.http.get<any>(`${baseUrl}/paas/${c.id}/metrics`));
          const saasRequests = runningSaas.map(s => this.http.get<any>(`${baseUrl}/saas/${s.id}/metrics`));

          forkJoin([...paasRequests, ...saasRequests]).subscribe({
            next: (results) => {
              // Mettre à jour uniquement les métriques sans toucher aux données de base
              this.containers.update(current => {
                const updated = [...current];
                runningContainers.forEach((c, i) => {
                  const idx = updated.findIndex(u => u.id === c.id);
                  if (idx !== -1 && results[i]) {
                    updated[idx] = {
                      ...updated[idx],
                      cpuUsage: results[i].cpuUsage || updated[idx].cpuUsage || '0.00%',
                      ramUsage: results[i].ramUsage || updated[idx].ramUsage || '0B / 0B',
                      ramPercentage: results[i].ramPercentage || updated[idx].ramPercentage || '0.00%',
                      usedStorageMb: results[i].usedStorageMb ?? updated[idx].usedStorageMb ?? 0,
                    };
                  }
                });
                return updated;
              });

              const saasOffset = runningContainers.length;
              this.saasApps.update(current => {
                const updated = [...current];
                runningSaas.forEach((s, i) => {
                  const result = results[saasOffset + i];
                  const idx = updated.findIndex(u => u.id === s.id);
                  if (idx !== -1 && result) {
                    updated[idx] = {
                      ...updated[idx],
                      cpuUsage: result.cpuUsage || updated[idx].cpuUsage || '0.00%',
                      ramUsage: result.ramUsage || updated[idx].ramUsage || '0B / 0B',
                      ramPercentage: result.ramPercentage || updated[idx].ramPercentage || '0.00%',
                      usedStorageMb: result.usedStorageMb ?? updated[idx].usedStorageMb ?? 0,
                    };
                  }
                });
                return updated;
              });
            },
            error: () => {} // silent fail — metrics are optional
          });
        }
      },
      error: (err) => console.warn('Failed to load monitoring data', err)
    });
  }

  private updateKPIs(vms: MonitorVM[], containers: MonitorContainer[], saasApps: MonitorSaas[], hostData: any) {
    const activeVms = vms.filter(v => v.status === 'RUNNING').length;
    const activeContainers = containers.filter(c => c.status === 'RUNNING').length;
    const activeSaas = saasApps.filter(s => s.status === 'RUNNING').length;
    const totalContainers = activeContainers + activeSaas;
    const totalWorkloads = activeVms + totalContainers;

    const cpuPct = hostData?.cpuPercent ?? 0;
    const ramPct = hostData?.ramPercent ?? 0;

    // Generate AIOps alerts dynamically
    const alerts: Activity[] = [];
    if (cpuPct > 80) {
      alerts.push({
        type: 'alert', color: 'var(--red)', bg: 'var(--red-light)',
        msg: `<strong>ESXi Host</strong> — CPU critique à ${cpuPct}%`,
        time: 'Temps réel'
      });
    } else if (cpuPct > 60) {
      alerts.push({
        type: 'warn', color: 'var(--amber)', bg: 'var(--amber-light)',
        msg: `<strong>ESXi Host</strong> — CPU élevé à ${cpuPct}%`,
        time: 'Temps réel'
      });
    }
    if (ramPct > 85) {
      alerts.push({
        type: 'alert', color: 'var(--red)', bg: 'var(--red-light)',
        msg: `<strong>ESXi Host</strong> — RAM critique à ${ramPct}%`,
        time: 'Temps réel'
      });
    } else if (ramPct > 70) {
      alerts.push({
        type: 'warn', color: 'var(--amber)', bg: 'var(--amber-light)',
        msg: `<strong>ESXi Host</strong> — RAM élevée à ${ramPct}%`,
        time: 'Temps réel'
      });
    }

    // Check containers with high metrics
    for (const c of containers) {
      const ramP = parseFloat(c.ramPercentage?.replace('%', '') || '0');
      if (ramP > 80) {
        alerts.push({
          type: 'alert', color: 'var(--red)', bg: 'var(--red-light)',
          msg: `<strong>${c.containerName}</strong> — RAM à ${ramP.toFixed(1)}%`,
          time: 'Temps réel'
        });
      }
      const cpuP = parseFloat(c.cpuUsage?.replace('%', '') || '0');
      if (cpuP > 50) {
        alerts.push({
          type: 'warn', color: 'var(--amber)', bg: 'var(--amber-light)',
          msg: `<strong>${c.containerName}</strong> — CPU à ${cpuP.toFixed(1)}%`,
          time: 'Temps réel'
        });
      }
    }

    this.aiopsAlerts.set(alerts);

    const alertCount = alerts.filter(a => a.type === 'alert').length;
    const warnCount = alerts.filter(a => a.type === 'warn').length;

    this.monitorStats.set([
      { 
        label: 'Workloads actifs', 
        val: `${totalWorkloads}`, 
        sub: `${activeVms} VM · ${totalContainers} Conteneurs`, 
        bg: 'var(--blue-light)', 
        color: 'var(--blue)', valColor: '' 
      },
      {
        label: 'CPU global', valColor: cpuPct > 80 ? 'var(--red)' : '',
        val: `${cpuPct}%`, sub: 'Hôte ESXi',
        bg: 'var(--green-light)', color: 'var(--green)'
      },
      {
        label: 'RAM globale', valColor: ramPct > 85 ? 'var(--red)' : '',
        val: `${ramPct}%`, sub: 'Hôte ESXi',
        bg: 'var(--purple-light)', color: 'var(--purple)'
      },
      {
        label: 'Alertes AIOps',
        valColor: alertCount > 0 ? 'var(--red)' : warnCount > 0 ? 'var(--amber)' : 'var(--green)',
        val: `${alerts.length}`,
        sub: alertCount > 0 ? `${alertCount} critique${alertCount > 1 ? 's' : ''}` : warnCount > 0 ? `${warnCount} avertissement${warnCount > 1 ? 's' : ''}` : 'Tout est normal',
        bg: alertCount > 0 ? 'var(--red-light)' : warnCount > 0 ? 'var(--amber-light)' : 'var(--green-light)',
        color: alertCount > 0 ? 'var(--red)' : warnCount > 0 ? 'var(--amber)' : 'var(--green)'
      },
    ]);
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'RUNNING': return 'approved';
      case 'STOPPED': return 'rejected';
      case 'PROVISIONING': return 'pending';
      case 'AWAITING_PAYMENT': return 'suspended';
      default: return 'pending';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'RUNNING': return 'En ligne';
      case 'STOPPED': return 'Arrêtée';
      case 'PROVISIONING': return 'Provisionnement';
      case 'AWAITING_PAYMENT': return 'Impayée';
      default: return status;
    }
  }

  getSgbdColor(sgbd: string): string {
    switch (sgbd?.toUpperCase()) {
      case 'POSTGRESQL': return '#336791';
      case 'MYSQL': return '#00758F';
      case 'REDIS': return '#DC382D';
      case 'MONGODB': return '#4DB33D';
      default: return 'var(--blue)';
    }
  }

  parsePercent(val: string | undefined): number {
    return parseFloat(val?.replace('%', '') || '0');
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
