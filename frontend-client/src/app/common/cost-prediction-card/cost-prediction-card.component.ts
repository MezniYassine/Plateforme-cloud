import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

export interface MonthlyPoint {
  month: string;
  amount: number;
}

export interface PredictionData {
  predictedAmount: number;
  confidenceLow: number;
  confidenceHigh: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
  trendPct: number;
  monthlyHistory: MonthlyPoint[];
  nextMonth: string;
}

@Component({
  selector: 'app-cost-prediction-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cost-prediction-card.component.html',
  styleUrls: ['./cost-prediction-card.component.scss'],
})
export class CostPredictionCardComponent implements OnInit {
  /** API endpoint, e.g. '/api/admin/billing/prediction' */
  @Input() apiUrl!: string;
  /** Label describing what is predicted, e.g. 'revenus' or 'dépenses' */
  @Input() label = 'dépenses';
  /** Currency symbol */
  @Input() currency = 'DT';
  /** If true, UP is good (green) and DOWN is bad (red) — e.g. platform revenues for Admin Global */
  @Input() isRevenue = false;

  get isRevenueMetric(): boolean {
    return this.isRevenue || (this.label || '').toLowerCase().includes('revenu');
  }

  loading = signal(true);
  error   = signal(false);
  data    = signal<PredictionData | null>(null);

  // ── SVG Chart helpers ──────────────────────────────────────────────
  readonly CHART_W = 260;
  readonly CHART_H = 88;

  chartBars = computed(() => {
    const d = this.data();
    if (!d || d.monthlyHistory.length === 0) return [];

    const all = [...d.monthlyHistory, { month: d.nextMonth, amount: d.predictedAmount, isPrediction: true }];
    const maxVal = Math.max(...all.map(p => p.amount), 1);
    const totalBars = all.length;

    // Dynamic bar width and gap based on number of bars
    let barW = 32;
    let barGap = 16;
    if (totalBars <= 3) {
      barW = 44;
      barGap = 20;
    } else if (totalBars <= 4) {
      barW = 38;
      barGap = 16;
    } else if (totalBars <= 6) {
      barW = 28;
      barGap = 12;
    }

    const totalWidth = totalBars * (barW + barGap) - barGap;
    const startX = Math.max(6, (this.CHART_W - totalWidth) / 2);

    return all.map((p: any, i: number) => {
      // Reserve 20px at top for amount text, 20px at bottom for month label
      const maxBarHeight = this.CHART_H - 40;
      const barH = Math.max(8, ((p.amount / maxVal) * maxBarHeight));
      const x = startX + i * (barW + barGap);
      const y = this.CHART_H - 20 - barH;
      return {
        x, y,
        width: barW,
        height: barH,
        month: p.month,
        amount: p.amount,
        isPrediction: !!p.isPrediction,
      };
    });
  });

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.http.get<PredictionData>(this.apiUrl).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  formatAmount(n: number): string {
    return n.toFixed(2);
  }

  trendIcon(): string {
    const t = this.data()?.trend;
    return t === 'UP' ? '↑' : t === 'DOWN' ? '↓' : '→';
  }

  trendClass(): string {
    const t = this.data()?.trend;
    if (!t || t === 'STABLE') return 'trend-stable';

    if (this.isRevenueMetric) {
      // Pour les revenus (Admin Global) : Hausse = Vert (positif), Baisse = Rouge (négatif)
      return t === 'UP' ? 'trend-positive' : 'trend-negative';
    } else {
      // Pour les dépenses/coûts (Entreprise, Personnel) : Baisse = Vert (économie), Hausse = Rouge (dépense)
      return t === 'DOWN' ? 'trend-positive' : 'trend-negative';
    }
  }
}
