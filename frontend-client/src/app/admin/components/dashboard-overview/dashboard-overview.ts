import { Component, computed, input, output, signal, OnInit, OnDestroy, inject, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { DashboardHelperService, Tenant, Activity } from '../../dashboard-helper.service';

export interface InfraMetric { label: string; val: string; pct: number; color: string; }

interface FlatTransaction {
  price: number;
  date: Date;
}

interface ChartPoint {
  x: number;
  y: number;
}

@Component({
  selector: 'app-dashboard-overview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-overview.html',
  encapsulation: ViewEncapsulation.None
})
export class DashboardOverviewComponent implements OnInit, OnDestroy {
  tenants = input.required<Tenant[]>();
  enterpriseCount = input.required<number>();
  pendingCount = input.required<number>();
  activeDevCount = input.required<number>();
  activities = input.required<Activity[]>();
  infraMetrics = input.required<InfraMetric[]>();
  activeVmCount = input.required<number>();

  navigateTo = output<string>();
  openModal = output<string>();
  quickAction = output<{ id: string; status: Tenant['status'] }>();

  selectedPeriod = signal<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  searchQuery = signal<string>('');

  private http = inject(HttpClient);
  private pollInterval: any;

  // Real Service Counts (IaaS, PaaS, SaaS)
  iaasCount = signal<number>(0);
  paasCount = signal<number>(0);
  saasCount = signal<number>(0);

  // Real Transactions extracted from all invoices
  transactions = signal<FlatTransaction[]>([]);

  // Real Billing Data Fallback
  billingData = signal<{
    currentMonth: number;
    previousMonth: number;
    annual: number;
    growthPct: number;
  } | null>(null);

  ngOnInit() {
    this.loadRealMonitoringAndBilling();
    this.pollInterval = setInterval(() => {
      this.loadRealMonitoringAndBilling();
    }, 4000);
  }

  ngOnDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  loadRealMonitoringAndBilling() {
    const base = environment.apiBaseUrl.replace(/\/$/, '');

    // 1. Fetch Real IaaS, PaaS, and SaaS Counts
    this.http.get<any>(`${base}/admin/monitoring`).subscribe({
      next: (data) => {
        const vms = (data?.vms || []).filter((v: any) => v.status === 'RUNNING' || v.status === 'ACTIVE' || v.status === 'Online');
        const containers = (data?.containers || []).filter((c: any) => c.status === 'RUNNING' || c.status === 'ACTIVE' || c.status === 'Online');
        const saas = (data?.saasApps || []).filter((s: any) => s.status === 'RUNNING' || s.status === 'ACTIVE' || s.status === 'Online');

        this.iaasCount.set(vms.length);
        this.paasCount.set(containers.length);
        this.saasCount.set(saas.length);
      },
      error: () => {
        this.iaasCount.set(0);
        this.paasCount.set(0);
        this.saasCount.set(0);
      }
    });

    // 2. Fetch Real Billing Metrics & Transactions from /admin/billing
    this.http.get<any>(`${base}/admin/billing`).subscribe({
      next: (data) => {
        if (data) {
          const txList: FlatTransaction[] = [];
          if (Array.isArray(data.billingInvoices)) {
            data.billingInvoices.forEach((inv: any) => {
              if (Array.isArray(inv.transactions) && inv.transactions.length > 0) {
                inv.transactions.forEach((tx: any) => {
                  if (tx.date) {
                    const parsedDate = new Date(tx.date);
                    if (!isNaN(parsedDate.getTime())) {
                      txList.push({
                        price: Number(tx.price) || 0,
                        date: parsedDate
                      });
                    }
                  }
                });
              } else if (inv.date) {
                const parsedDate = new Date(inv.date);
                if (!isNaN(parsedDate.getTime())) {
                  const price = inv.price !== undefined
                    ? Number(inv.price)
                    : (parseFloat(String(inv.amount || '').replace(/[^\d.]/g, '')) || 0);
                  txList.push({
                    price,
                    date: parsedDate
                  });
                }
              }
            });
          }
          this.transactions.set(txList);

          let currentMonth = 0;
          let previousMonth = 0;
          let annual = 0;
          let growthPct = 0;

          if (data.currentMonthTotal?.val) {
            currentMonth = parseFloat(String(data.currentMonthTotal.val).replace(/[^\d.]/g, '')) || 0;
          } else if (data.billingStats?.[0]?.val) {
            currentMonth = parseFloat(String(data.billingStats[0].val).replace(/[^\d.]/g, '')) || 0;
          }

          if (data.billingStats?.[0]?.sub) {
            const match = String(data.billingStats[0].sub).match(/([+-]?\d+)/);
            if (match) growthPct = parseInt(match[1], 10) || 0;
          }

          if (data.billingStats?.[3]?.val) {
            annual = parseFloat(String(data.billingStats[3].val).replace(/[^\d.]/g, '')) || 0;
          } else {
            annual = currentMonth;
          }

          if (data.revenuMoisPrecedent) {
            previousMonth = Number(data.revenuMoisPrecedent) || 0;
          }

          this.billingData.set({
            currentMonth,
            previousMonth,
            annual,
            growthPct
          });
        }
      },
      error: (err) => console.warn('Could not load billing metrics', err)
    });
  }

  // Filtered tenants for the recent table (dynamically bound to real data)
  pendingTenants = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    let list = this.tenants().filter(t => t.status === 'pending');
    if (q) {
      list = list.filter(t =>
        t.company.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        t.taxId.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 6);
  });

  // 100% Technical Cloud Breakdown (IaaS, PaaS, SaaS ONLY)
  donutStats = computed(() => {
    const iaas = this.iaasCount();
    const paas = this.paasCount();
    const saas = this.saasCount();
    const total = iaas + paas + saas;

    if (total === 0) {
      return {
        iaasCount: 0,
        paasCount: 0,
        saasCount: 0,
        totalActive: 0,
        iaasPct: 0,
        paasPct: 0,
        saasPct: 0,
        activeRate: '0',
        dash1: '0 377',
        dash2: '0 377',
        dash3: '0 377',
        offset2: 0,
        offset3: 0
      };
    }

    const iaasPct = Math.round((iaas / total) * 100);
    const paasPct = Math.round((paas / total) * 100);
    const saasPct = Math.max(0, 100 - iaasPct - paasPct);

    const circumference = 377; // 2 * PI * 60
    const len1 = (iaasPct / 100) * circumference;
    const len2 = (paasPct / 100) * circumference;
    const len3 = (saasPct / 100) * circumference;

    return {
      iaasCount: iaas,
      paasCount: paas,
      saasCount: saas,
      totalActive: total,
      iaasPct,
      paasPct,
      saasPct,
      activeRate: `${total}`,
      dash1: `${len1.toFixed(1)} 377`,
      dash2: `${len2.toFixed(1)} 377`,
      dash3: `${len3.toFixed(1)} 377`,
      offset2: -len1,
      offset3: -(len1 + len2)
    };
  });

  // Strict Calendar-Accurate Consumption based on transaction dates
  calendarStats = computed(() => {
    const txs = this.transactions();
    const now = new Date();

    // ─── 1. JOUR (Aujourd'hui vs Hier) ────────────────────────────────
    const isSameDay = (d1: Date, d2: Date) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    const todaySum = txs
      .filter(t => isSameDay(t.date, now))
      .reduce((sum, t) => sum + t.price, 0);

    const yesterdaySum = txs
      .filter(t => isSameDay(t.date, yesterday))
      .reduce((sum, t) => sum + t.price, 0);

    let dayGrowth = '+0%';
    if (yesterdaySum === 0) {
      dayGrowth = todaySum > 0 ? '+100%' : '+0%';
    } else {
      const g = Math.round(((todaySum - yesterdaySum) / yesterdaySum) * 100);
      dayGrowth = g >= 0 ? `+${g}%` : `${g}%`;
    }

    // ─── 2. SEMAINE (Lundi 00:00 à Dimanche 23:59 vs Semaine précédente) ──
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset, 0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

    const startOfPrevWeek = new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
    const endOfPrevWeek = new Date(startOfWeek.getTime() - 1);

    const thisWeekSum = txs
      .filter(t => t.date >= startOfWeek && t.date <= endOfWeek)
      .reduce((sum, t) => sum + t.price, 0);

    const lastWeekSum = txs
      .filter(t => t.date >= startOfPrevWeek && t.date <= endOfPrevWeek)
      .reduce((sum, t) => sum + t.price, 0);

    let weekGrowth = '+0%';
    if (lastWeekSum === 0) {
      weekGrowth = thisWeekSum > 0 ? '+100%' : '+0%';
    } else {
      const g = Math.round(((thisWeekSum - lastWeekSum) / lastWeekSum) * 100);
      weekGrowth = g >= 0 ? `+${g}%` : `${g}%`;
    }

    // ─── 3. MOIS (1er au dernier jour du mois vs Mois précédent) ───────────
    const isThisMonth = (d: Date) =>
      d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();

    const prevMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const prevMonthIndex = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const isPrevMonth = (d: Date) =>
      d.getFullYear() === prevMonthYear && d.getMonth() === prevMonthIndex;

    let thisMonthSum = txs
      .filter(t => isThisMonth(t.date))
      .reduce((sum, t) => sum + t.price, 0);

    let lastMonthSum = txs
      .filter(t => isPrevMonth(t.date))
      .reduce((sum, t) => sum + t.price, 0);

    if (thisMonthSum === 0 && this.billingData()?.currentMonth) {
      thisMonthSum = this.billingData()!.currentMonth;
      lastMonthSum = this.billingData()!.previousMonth;
    }

    let monthGrowth = '+0%';
    if (lastMonthSum === 0) {
      monthGrowth = thisMonthSum > 0 ? '+100%' : '+0%';
    } else {
      const g = Math.round(((thisMonthSum - lastMonthSum) / lastMonthSum) * 100);
      monthGrowth = g >= 0 ? `+${g}%` : `${g}%`;
    }

    // ─── 4. ANNÉE (1er Janvier au 31 Décembre vs Année précédente) ────────
    const isThisYear = (d: Date) => d.getFullYear() === now.getFullYear();
    const isPrevYear = (d: Date) => d.getFullYear() === now.getFullYear() - 1;

    let thisYearSum = txs
      .filter(t => isThisYear(t.date))
      .reduce((sum, t) => sum + t.price, 0);

    let lastYearSum = txs
      .filter(t => isPrevYear(t.date))
      .reduce((sum, t) => sum + t.price, 0);

    if (thisYearSum === 0 && this.billingData()?.annual) {
      thisYearSum = this.billingData()!.annual;
    }

    let yearGrowth = '+0%';
    if (lastYearSum === 0) {
      yearGrowth = thisYearSum > 0 ? '+100%' : '+0%';
    } else {
      const g = Math.round(((thisYearSum - lastYearSum) / lastYearSum) * 100);
      yearGrowth = g >= 0 ? `+${g}%` : `${g}%`;
    }

    return {
      today: { total: `${todaySum.toFixed(2)} DT`, label: "Aujourd'hui", growth: dayGrowth },
      week: { total: `${thisWeekSum.toFixed(2)} DT`, label: 'Cette semaine', growth: weekGrowth },
      month: { total: `${thisMonthSum.toFixed(2)} DT`, label: 'Ce mois-ci', growth: monthGrowth },
      year: { total: `${thisYearSum.toFixed(2)} DT`, label: 'Cette année', growth: yearGrowth }
    };
  });

  // Dynamic calculated billing based on real calendar transaction dates
  chartMetrics = computed(() => {
    const stats = this.calendarStats();
    switch (this.selectedPeriod()) {
      case 'daily':
        return stats.today;
      case 'weekly':
        return stats.week;
      case 'yearly':
        return stats.year;
      default:
        return stats.month;
    }
  });

  // 100% Dynamic Real SVG Wave Curve Generation based on transactions & period
  waveChartData = computed(() => {
    const txs = this.transactions();
    const period = this.selectedPeriod();
    const now = new Date();

    let labels: string[] = [];
    let currentValues: number[] = [];
    let prevValues: number[] = [];
    let legendCurrent = 'Période Actuelle';
    let legendPrev = 'Période Précédente';

    if (period === 'daily') {
      labels = ['00h', '04h', '08h', '12h', '16h', '20h', '24h'];
      currentValues = [0, 0, 0, 0, 0, 0, 0];
      prevValues = [0, 0, 0, 0, 0, 0, 0];
      legendCurrent = "Aujourd'hui";
      legendPrev = 'Hier';

      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const isSameDay = (d1: Date, d2: Date) =>
        d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

      txs.forEach(t => {
        const bucket = Math.min(6, Math.floor(t.date.getHours() / 4));
        if (isSameDay(t.date, now)) currentValues[bucket] += t.price;
        if (isSameDay(t.date, yesterday)) prevValues[bucket] += t.price;
      });
    } else if (period === 'weekly') {
      labels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
      currentValues = [0, 0, 0, 0, 0, 0, 0];
      prevValues = [0, 0, 0, 0, 0, 0, 0];
      legendCurrent = 'Cette semaine';
      legendPrev = 'Semaine passée';

      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset, 0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
      const startOfPrevWeek = new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
      const endOfPrevWeek = new Date(startOfWeek.getTime() - 1);

      txs.forEach(t => {
        const dayIdx = (t.date.getDay() + 6) % 7;
        if (t.date >= startOfWeek && t.date <= endOfWeek) currentValues[dayIdx] += t.price;
        if (t.date >= startOfPrevWeek && t.date <= endOfPrevWeek) prevValues[dayIdx] += t.price;
      });
    } else if (period === 'yearly') {
      labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
      currentValues = new Array(12).fill(0);
      prevValues = new Array(12).fill(0);
      legendCurrent = `Année ${now.getFullYear()}`;
      legendPrev = `Année ${now.getFullYear() - 1}`;

      txs.forEach(t => {
        const m = t.date.getMonth();
        if (t.date.getFullYear() === now.getFullYear()) currentValues[m] += t.price;
        if (t.date.getFullYear() === now.getFullYear() - 1) prevValues[m] += t.price;
      });
    } else {
      // Monthly (Buckets of 5 days: 1-5, 6-10, 11-15, 16-20, 21-25, 26-31)
      labels = ['1-5', '6-10', '11-15', '16-20', '21-25', '26-31'];
      currentValues = [0, 0, 0, 0, 0, 0];
      prevValues = [0, 0, 0, 0, 0, 0];
      legendCurrent = 'Ce mois-ci';
      legendPrev = 'Mois passé';

      const prevMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const prevMonthIdx = now.getMonth() === 0 ? 11 : now.getMonth() - 1;

      txs.forEach(t => {
        const b = Math.min(5, Math.floor((t.date.getDate() - 1) / 5));
        if (t.date.getFullYear() === now.getFullYear() && t.date.getMonth() === now.getMonth()) {
          currentValues[b] += t.price;
        }
        if (t.date.getFullYear() === prevMonthYear && t.date.getMonth() === prevMonthIdx) {
          prevValues[b] += t.price;
        }
      });
    }

    // Generate coordinates in SVG viewBox (0 0 500 130)
    const X_MIN = 20;
    const X_MAX = 480;
    const Y_MIN = 20;
    const Y_MAX = 105;
    const stepX = (X_MAX - X_MIN) / (labels.length - 1);

    const maxVal = Math.max(...currentValues, ...prevValues, 10);

    const currentPoints: ChartPoint[] = currentValues.map((v, i) => ({
      x: X_MIN + i * stepX,
      y: Y_MAX - (v / maxVal) * (Y_MAX - Y_MIN)
    }));

    const prevPoints: ChartPoint[] = prevValues.map((v, i) => ({
      x: X_MIN + i * stepX,
      y: Y_MAX - (v / maxVal) * (Y_MAX - Y_MIN)
    }));

    // Find peak highlight dots
    const dots: { cx: number; cy: number; val: number }[] = [];
    currentValues.forEach((v, i) => {
      if (v > 0) {
        dots.push({
          cx: currentPoints[i].x,
          cy: currentPoints[i].y,
          val: v
        });
      }
    });

    const currentPath = this.buildSpline(currentPoints);
    const currentArea = this.buildArea(currentPoints, 120);
    const prevPath = this.buildSpline(prevPoints);
    const prevArea = this.buildArea(prevPoints, 120);

    return {
      labels,
      currentPath,
      currentArea,
      prevPath,
      prevArea,
      dots,
      legendCurrent,
      legendPrev
    };
  });

  private buildSpline(pts: ChartPoint[]): string {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }

  private buildArea(pts: ChartPoint[], baseY = 120): string {
    if (pts.length < 2) return '';
    const line = this.buildSpline(pts);
    const first = pts[0];
    const last = pts[pts.length - 1];
    return `${line} L ${last.x.toFixed(1)} ${baseY} L ${first.x.toFixed(1)} ${baseY} Z`;
  }

  constructor(public h: DashboardHelperService) { }

  setPeriod(period: 'daily' | 'weekly' | 'monthly' | 'yearly') {
    this.selectedPeriod.set(period);
  }

  onQuickAction(id: string, status: Tenant['status']) {
    this.quickAction.emit({ id, status });
  }
}
