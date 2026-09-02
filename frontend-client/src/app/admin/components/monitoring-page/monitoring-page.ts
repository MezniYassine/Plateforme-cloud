import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../environments/environment';
import { DashboardHelperService, Activity } from '../../dashboard-helper.service';
import { AdminLogsService, SystemLog } from '../../services/logs.service';
import { forkJoin } from 'rxjs';

interface MonitorVM {
  id: number; name: string; owner: string; ownerEmail: string;
  cpu: number; ram: number; storage: number; os: string;
  ip: string | null; status: string; dateCreation: string;
  catalogueName: string | null;
  // Runtime metrics (from ESXi)
  runtimeState?: string; cpuUse?: number; ramUse?: number;
  cpuUsageMhz?: number; ramUsageMb?: number;
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
  // Live metrics
  cpuUsage?: string; ramUsage?: string; ramPercentage?: string;
  usedStorageMb?: number;
}

@Component({
  selector: 'app-monitoring-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './monitoring-page.html',
  styleUrl: './monitoring-page.scss'
})
export class MonitoringPageComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private logsService = inject(AdminLogsService);
  public h = inject(DashboardHelperService);
  private pollInterval: any;

  activeTab = signal<'iaas' | 'paas' | 'saas' | 'logs'>('iaas');

  vms = signal<MonitorVM[]>([]);
  containers = signal<MonitorContainer[]>([]);
  saasApps = signal<MonitorSaas[]>([]);

  // Logs & Incidents System
  logs = signal<SystemLog[]>([]);
  logStats = signal({
    unresolvedCount: 0,
    criticalCount: 0,
    errorCount: 0,
    warnCount: 0,
  });
  selectedLogSource = signal<string>('ALL');
  selectedLogLevel = signal<string>('ALL');
  selectedLogResolved = signal<boolean | undefined>(undefined);
  isResolvingLog = signal<number | null>(null);

  // 4 Top KPI Cards aligned with Dynamix Cloud Palette
  monitorStats = signal([
    { label: 'Workloads actifs', val: '0', sub: 'Calcul en cours...', cardClass: 'card-anthracite-dark', icon: 'workloads' },
    { label: 'CPU moyen', val: '0%', sub: 'Sur toutes les instances', cardClass: 'card-orange-deep', icon: 'cpu' },
    { label: 'RAM moyenne', val: '0%', sub: 'Sur toutes les instances', cardClass: 'card-anthracite-mid', icon: 'ram' },
    { label: 'Incidents & Logs', val: '0', sub: 'Aucun incident', cardClass: 'card-orange-vibrant', icon: 'logs' },
  ]);

  ngOnInit() {
    this.loadData();
    this.loadLogs();
    this.pollInterval = setInterval(() => {
      this.loadData();
      this.loadLogs();
    }, 10000);
  }

  ngOnDestroy() {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  setTab(tab: 'iaas' | 'paas' | 'saas' | 'logs') {
    this.activeTab.set(tab);
    if (tab === 'logs') {
      this.loadLogs();
    }
  }

  loadData() {
    const baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

    // Fetch monitoring data (VMs + Containers + SaaS from DB)
    this.http.get<any>(`${baseUrl}/admin/monitoring`).subscribe({
      next: (data) => {
        // Process VMs
        const vmList: MonitorVM[] = data.vms || [];
        this.vms.set(vmList);

        // Process Containers
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

        // Process SaaS
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

        // Fetch live ESXi host metrics
        this.http.get<any>(`${baseUrl}/esxi/host-stats`).subscribe({
          next: (res) => {
            const hostData = res?.data ?? res;
            if (hostData) {
              this.updateKPIs(vmList, containerList, saasList, hostData);
            }
          },
          error: () => this.updateKPIs(vmList, containerList, saasList, null)
        });

        // Fetch live container metrics
        const runningContainers = containerList.filter(c => c.status === 'RUNNING');
        const runningSaas = saasList.filter(s => s.status === 'RUNNING');
        
        if (runningContainers.length > 0 || runningSaas.length > 0) {
          const paasRequests = runningContainers.map(c => this.http.get<any>(`${baseUrl}/paas/${c.id}/metrics`));
          const saasRequests = runningSaas.map(s => this.http.get<any>(`${baseUrl}/saas/${s.id}/metrics`));

          forkJoin([...paasRequests, ...saasRequests]).subscribe({
            next: (results) => {
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
            error: () => {}
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

    const unresolvedIncidents = this.logStats().unresolvedCount;

    this.monitorStats.set([
      { 
        label: 'Workloads actifs', 
        val: `${totalWorkloads}`, 
        sub: `${activeVms} VM · ${totalContainers} Conteneurs`, 
        cardClass: 'card-anthracite-dark',
        icon: 'workloads'
      },
      { 
        label: 'CPU moyen', 
        val: `${cpuPct}%`, 
        sub: 'Infrastructure globale', 
        cardClass: 'card-orange-deep',
        icon: 'cpu'
      },
      { 
        label: 'RAM moyenne', 
        val: `${ramPct}%`, 
        sub: 'Infrastructure globale', 
        cardClass: 'card-anthracite-mid',
        icon: 'ram'
      },
      { 
        label: 'Incidents & Logs', 
        val: `${unresolvedIncidents}`, 
        sub: unresolvedIncidents === 0 ? 'Système optimal' : `${unresolvedIncidents} incident(s) actif(s)`, 
        cardClass: 'card-orange-vibrant',
        icon: 'alert'
      },
    ]);
  }

  // ═══════════════════════════════════════════════════════════════
  // LOGS & INCIDENTS MANAGEMENT
  // ═══════════════════════════════════════════════════════════════
  loadLogs() {
    this.logsService.getLogs({
      source: this.selectedLogSource(),
      level: this.selectedLogLevel(),
      resolved: this.selectedLogResolved(),
      limit: 150,
    }).subscribe({
      next: (res) => {
        this.logs.set(res.logs || []);
        if (res.stats) {
          this.logStats.set(res.stats);
        }
      },
      error: (err) => console.warn('Could not load system logs', err)
    });
  }

  onFilterChange() {
    this.loadLogs();
  }

  resolveLog(id: number, event?: Event) {
    if (event) event.stopPropagation();
    this.isResolvingLog.set(id);
    this.logsService.resolveLog(id).subscribe({
      next: (updated) => {
        this.isResolvingLog.set(null);
        this.logs.update(current => current.map(l => l.id === id ? { ...l, resolved: true, resolvedAt: updated.resolvedAt } : l));
        this.logStats.update(s => ({
          ...s,
          unresolvedCount: Math.max(0, s.unresolvedCount - 1),
        }));
      },
      error: (err) => {
        this.isResolvingLog.set(null);
        console.error('Erreur lors de la résolution du log', err);
      }
    });
  }

  clearResolvedLogs() {
    if (!confirm('Êtes-vous sûr de vouloir supprimer tous les logs marqués comme résolus ?')) return;
    this.logsService.clearResolved().subscribe({
      next: () => {
        this.loadLogs();
      },
      error: (err) => console.error('Erreur purge logs', err)
    });
  }

  getLogLevelClass(level: string): string {
    const l = (level || '').toUpperCase();
    if (l === 'CRITICAL') return 'lvl-critical';
    if (l === 'ERROR') return 'lvl-error';
    if (l === 'WARN') return 'lvl-warn';
    return 'lvl-info';
  }

  getLogLevelLabel(level: string): string {
    const l = (level || '').toUpperCase();
    if (l === 'CRITICAL') return 'Critique';
    if (l === 'ERROR') return 'Erreur';
    if (l === 'WARN') return 'Avertissement';
    return 'Info';
  }

  getLogSourceLabel(source: string): string {
    const s = (source || '').toUpperCase();
    switch (s) {
      case 'ESXI': return 'VMware ESXi';
      case 'DOCKER': return 'Moteur Docker';
      case 'DBAAS': return 'Machine DBaaS';
      case 'PROVISIONING': return 'Provisioning';
      case 'STORAGE': return 'Stockage / Disque';
      case 'SERVICE': return 'Service Client';
      case 'AUTH': return 'Authentification';
      default: return 'Système';
    }
  }

  getLogSourceBadgeClass(source: string): string {
    const s = (source || '').toUpperCase();
    switch (s) {
      case 'ESXI': return 'src-esxi';
      case 'DOCKER': return 'src-docker';
      case 'DBAAS': return 'src-dbaas';
      case 'PROVISIONING': return 'src-prov';
      case 'STORAGE': return 'src-storage';
      default: return 'src-default';
    }
  }

  getStatusBadgeClass(status: string): string {
    const s = (status || '').toUpperCase();
    if (s === 'RUNNING' || s === 'ACTIVE') return 'running';
    if (s === 'STOPPED' || s === 'POWEREDOFF') return 'stopped';
    return 'failed';
  }

  getStatusLabel(status: string): string {
    const s = (status || '').toUpperCase();
    if (s === 'RUNNING' || s === 'ACTIVE') return 'En cours';
    if (s === 'STOPPED' || s === 'POWEREDOFF') return 'Arrêté';
    if (s === 'PROVISIONING') return 'Provisioning';
    return 'Échec';
  }

  getSgbdColor(sgbd: string): string {
    const s = (sgbd || '').toLowerCase();
    if (s.includes('postgres')) return '#336791';
    if (s.includes('mysql')) return '#00758f';
    if (s.includes('mongo')) return '#13aa52';
    if (s.includes('redis')) return '#d82c20';
    return '#64748b';
  }

  parsePercent(val?: string): number {
    if (!val) return 0;
    return parseFloat(val.replace('%', '')) || 0;
  }
}
