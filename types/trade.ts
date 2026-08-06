export interface TradeData {
  localId: string;
  id?: string;
  ticker: string;
  direction: string;
  side: string;
  entry_price: string | null;
  exit_price: string | null;
  size: string;
  entry_time: string | null;
  exit_time: string | null;
  timestamp: string | null;
  realized_pl: string | null;
  holdTime: number | null;
  violations: string[];
  violationsCount: number;
  discipline_score: number | null;
  violation_cost: string | null;
  displayTime?: string;
  chartData: any | null;
  tradeMetrics: any | null;
  aiReview: any | null;
  aiReviewGeneratedAt: number | null;
  behaviorTags: string[];
  behaviorSeverity: string;
  behaviorSummary: string;
  rawData?: any;
}
