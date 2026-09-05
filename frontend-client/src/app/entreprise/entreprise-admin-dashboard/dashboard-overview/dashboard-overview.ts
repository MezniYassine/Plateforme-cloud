import { Component, computed, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Activity, ResourceRequest, TeamMember, DeployedResource, WalletTransaction } from '../entreprise-helper.service';

interface ChartPoint {
  x: number;
  y: number;
}

@Component({
  selector: 'ent-dashboard-overview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-overview.html',
  styleUrl: './dashboard-overview.scss',
})
export class DashboardOverview {
  teamMembers = input.required<TeamMember[]>();
  resourceRequests = input.required<ResourceRequest[]>();
  activeResourcesCount = input.required<number>();
  monthlyBudget = input.required<number>();
  monthlySpend = input.required<number>();
  activities = input<Activity[]>([]);
  teamSpend = input.required<Array<Pick<TeamMember, 'name' | 'spend' | 'color'>>>();
  pendingRequestsCount = input.required<number>();
  deployedResources = input<DeployedResource[]>([]);
  walletTransactions = input<WalletTransaction[]>([]);

  selectedPeriod = signal<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');

  readonly budgetUsedPct = computed(() => {
    const b = this.monthlyBudget();
    if (!b || b === 0) return 0;
    return Math.round((this.monthlySpend() / b) * 100);
  });

  // ── Donut Analytics: Répartition Cloud (Toutes les ressources de l'entreprise : IaaS, PaaS, SaaS) ──
  readonly donutStats = computed(() => {
    const resources = this.deployedResources() || [];
    const iaas = resources.filter(r => (r.type || '').toLowerCase() === 'vm').length;
    const paas = resources.filter(r => (r.type || '').toLowerCase() === 'db' || (r.type || '').toLowerCase() === 'paas').length;
    const saas = resources.filter(r => (r.type || '').toLowerCase() === 'saas').length;
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

  // ── Dépenses de l'Entreprise seulement (Extraire les débits réels avec dates) ──
  readonly transactions = computed<Array<{ price: number; date: Date }>>(() => {
    const list = this.walletTransactions() || [];
    const result: Array<{ price: number; date: Date }> = [];

    for (const t of list) {
      if (t.type === 'debit' || !t.type) {
        const rawDateStr = t.rawDate || t.date;
        let d: Date | null = null;
        if (rawDateStr) {
          const parsed = new Date(rawDateStr);
          if (!isNaN(parsed.getTime())) {
            d = parsed;
          } else {
            const match = String(rawDateStr).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (match) {
              d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
            }
          }
        }
        if (d && !isNaN(d.getTime())) {
          result.push({
            price: Math.abs(Number(t.amount || 0)),
            date: d,
          });
        }
      }
    }

    return result;
  });

  // ── Strict Calendar-Accurate Consumption based on transaction dates (Dépenses Entreprise) ──
  readonly calendarStats = computed(() => {
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

    if (thisMonthSum === 0 && this.monthlySpend()) {
      thisMonthSum = this.monthlySpend();
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

    if (thisYearSum === 0 && this.monthlySpend()) {
      thisYearSum = this.monthlySpend();
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

  readonly chartMetrics = computed(() => {
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

  // ── 100% Dynamic Real SVG Wave Curve Generation based on transactions & period ──
  readonly waveChartData = computed(() => {
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

  setPeriod(period: 'daily' | 'weekly' | 'monthly' | 'yearly') {
    this.selectedPeriod.set(period);
  }

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

  navigateTo = output<string>();
  approveRequest = output<string>();
  rejectRequest = output<string>();

  getInitials(name: string): string {
    return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  hasAppLogo(name?: string, type?: string): boolean {
    const n = (name || '').toLowerCase();
    const t = (type || '').toLowerCase();

    if (n.includes('wordpress') || n.includes('wp')) return true;
    if (n.includes('n8n')) return true;
    if (n.includes('pgadmin')) return true;
    if (n.includes('phpmyadmin')) return true;

    if (t === 'db' || n.includes('db') || n.includes('base')) {
      if (n.includes('postgres') || n.includes('psql')) return true;
      if (n.includes('mysql')) return true;
      if (n.includes('mongo')) return true;
      if (n.includes('redis')) return true;
      return false;
    }

    if (t === 'vm' || n.includes('vm')) {
      if (n.includes('debian')) return true;
      if (n.includes('alpine')) return true;
      if (n.includes('windows') || n.includes('win') || n.includes('2000')) return true;
      if (n.includes('ubuntu')) return true;
      return false;
    }

    return false;
  }

  getServiceLogo(name?: string, type?: string): string {
    const n = (name || '').toLowerCase();
    const t = (type || '').toLowerCase();

    if (n.includes('wordpress') || n.includes('wp')) return 'assets/Wordpress logo.png';
    if (n.includes('n8n')) return 'assets/n8n_Logo.png';
    if (n.includes('pgadmin') || n.includes('postgres') || n.includes('psql')) return 'assets/PostgreSQL Logo.png';
    if (n.includes('phpmyadmin') || n.includes('mysql') || n.includes('phpsql') || n.includes('phpadmin')) return 'assets/MySQL Logo.png';
    if (n.includes('mongo')) return 'assets/MongoDB Logo.png';
    if (n.includes('redis')) return 'assets/Redis logo.png';

    if (n.includes('debian')) return 'assets/Debian.png';
    if (n.includes('alpine')) return 'assets/alpine.png';
    if (n.includes('windows') || n.includes('win') || n.includes('2000')) return 'assets/windows 7.png';
    if (n.includes('ubuntu')) return 'assets/ubuntu.png';

    return '';
  }

  getCategoryLabel(type?: string): string {
    if (type === 'vm') return 'IAAS';
    if (type === 'db') return 'PAAS';
    if (type === 'saas') return 'SAAS';
    return 'SERVICE';
  }

  formatSpecs(specs?: string, type?: string): string {
    if (!specs || specs.trim() === '' || specs.includes('0 vCPU - 0 GB RAM - 0 GB SSD')) {
      if (type === 'saas') return 'Application SaaS Managée';
      if (type === 'db') return 'Base de données managée';
      return 'Configuration Standard';
    }
    return specs;
  }
}
