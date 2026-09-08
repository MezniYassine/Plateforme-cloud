/**
 * DYNA-CLOUD — Utilitaire de Prédiction de Coûts (Option B IA)
 * Algorithme : Régression linéaire pondérée + moyenne mobile
 */

export interface MonthlyPoint {
  month: string;   // 'Jan', 'Fév', etc.
  amount: number;
}

export interface PredictionResult {
  predictedAmount: number;
  confidenceLow: number;
  confidenceHigh: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
  trendPct: number;
  monthlyHistory: MonthlyPoint[];
  nextMonth: string;
}

const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

/**
 * Régression linéaire simple (moindres carrés)
 * Retourne la valeur prédite pour x = n (prochain point)
 */
function linearRegression(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  if (n === 1) return values[0];

  const xs = values.map((_, i) => i);
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = values.reduce((s, y) => s + y, 0) / n;

  const numerator   = xs.reduce((s, x, i) => s + (x - meanX) * (values[i] - meanY), 0);
  const denominator = xs.reduce((s, x) => s + (x - meanX) ** 2, 0);

  const slope     = denominator !== 0 ? numerator / denominator : 0;
  const intercept = meanY - slope * meanX;

  return Math.max(0, slope * n + intercept);
}

/**
 * Moyenne pondérée exponentielle (mois récents ont plus de poids)
 */
function weightedAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, _, i) => sum + (i + 1), 0);
  return values.reduce((sum, v, i) => sum + v * (i + 1), 0) / total;
}

/**
 * Fonction principale — calcule la prédiction à partir d'un tableau mensuel indexé [0=Jan..11=Déc]
 * @param revenusMensuels  tableau de 12 montants (index = mois)
 * @param currentMonthIdx  index du mois courant (0-11)
 */
export function computePrediction(
  revenusMensuels: number[],
  currentMonthIdx: number,
): PredictionResult {
  const nextMonthIdx = (currentMonthIdx + 1) % 12;
  const nextMonth = MONTH_NAMES[nextMonthIdx];

  // Construire l'historique des mois disponibles (non nuls)
  const history: MonthlyPoint[] = [];
  for (let i = 0; i <= currentMonthIdx; i++) {
    if (revenusMensuels[i] > 0) {
      history.push({ month: MONTH_NAMES[i], amount: revenusMensuels[i] });
    }
  }

  // Valeurs numériques pour calcul
  const values = history.map(h => h.amount);

  let predicted: number;

  if (values.length === 0) {
    predicted = 0;
  } else if (values.length === 1) {
    predicted = values[0];
  } else {
    // Combinaison : 60% régression linéaire + 40% moyenne pondérée
    const lrPred  = linearRegression(values);
    const waPred  = weightedAverage(values);
    predicted = lrPred * 0.6 + waPred * 0.4;
  }

  predicted = Math.round(predicted * 100) / 100;

  // Intervalle de confiance ±15%
  const confidenceLow  = Math.round(predicted * 0.85 * 100) / 100;
  const confidenceHigh = Math.round(predicted * 1.15 * 100) / 100;

  // Tendance vs dernier mois réel
  const lastAmount = values.length > 0 ? values[values.length - 1] : 0;
  const trendPct = lastAmount > 0
    ? Math.round(((predicted - lastAmount) / lastAmount) * 100)
    : 0;

  const trend: 'UP' | 'DOWN' | 'STABLE' =
    trendPct > 3  ? 'UP' :
    trendPct < -3 ? 'DOWN' : 'STABLE';

  // Retourner les 6 derniers mois pour l'affichage
  const monthlyHistory = history.slice(-6);

  return {
    predictedAmount: predicted,
    confidenceLow,
    confidenceHigh,
    trend,
    trendPct,
    monthlyHistory,
    nextMonth,
  };
}
