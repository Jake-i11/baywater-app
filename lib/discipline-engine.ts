/**
 * Discipline Event Tracking Module
 */
export interface DisciplineEvent {
  userId: string;
  tradeId: string;
  violationType: string;
  severity: number;
  financialImpact: number;
  timestamp: Date;
  ticker: string;
  setupType: string;
  dayOfWeek: string;
  timeOfDay: string;
  marketSession: string;
  previousTradeResult: 'win' | 'loss';
  consecutiveWins: number;
  consecutiveLosses: number;
  dailyPLBeforeTrade: number;
  positionSize: number;
  plannedRisk: number;
  actualRisk: number;
}

/**
 * Discipline Context Analyzer
 */
export class DisciplineContextAnalyzer {
  analyzeTrade(tradeData: any): DisciplineEvent {
    // Implementation to calculate behavioral context
    return {
      userId: tradeData.userId || '',
      tradeId: tradeData.tradeId || '',
      violationType: tradeData.violationType || '',
      severity: tradeData.severity || 0,
      financialImpact: tradeData.financialImpact || 0,
      timestamp: tradeData.timestamp || new Date(),
      ticker: tradeData.ticker || '',
      setupType: tradeData.setupType || '',
      dayOfWeek: tradeData.dayOfWeek || '',
      timeOfDay: tradeData.timeOfDay || '',
      marketSession: tradeData.marketSession || '',
      previousTradeResult: tradeData.previousTradeResult || 'loss',
      consecutiveWins: tradeData.consecutiveWins || 0,
      consecutiveLosses: tradeData.consecutiveLosses || 0,
      dailyPLBeforeTrade: tradeData.dailyPLBeforeTrade || 0,
      positionSize: tradeData.positionSize || 0,
      plannedRisk: tradeData.plannedRisk || 0,
      actualRisk: tradeData.actualRisk || 0,
    };
  }
}

/**
 * Behavioral Pattern Model
 */
export interface BehavioralPattern {
  userId: string;
  title: string;
  description: string;
  patternType: string;
  confidenceScore: number;
  sampleSize: number;
  affectedTrades: string[];
  estimatedFinancialImpact: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Pattern Detection Engine
 */
export class PatternDetectionEngine {
  private minSampleSize = 5;
  
  detectPatterns(events: DisciplineEvent[], userId: string): BehavioralPattern[] {
    const patterns: BehavioralPattern[] = [];
    
    // Pattern: Friday + after 2 losses
    const fridayLossPattern = this.detectFridayLossPattern(events, userId);
    if (fridayLossPattern) patterns.push(fridayLossPattern);
    
    // Pattern: Oversized positions after losses
    const oversizedAfterLossPattern = this.detectOversizedAfterLossPattern(events, userId);
    if (oversizedAfterLossPattern) patterns.push(oversizedAfterLossPattern);
    
    // Pattern: Stop-loss violations Friday afternoon
    const stopLossFridayPattern = this.detectStopLossFridayPattern(events, userId);
    if (stopLossFridayPattern) patterns.push(stopLossFridayPattern);
    
    return patterns;
  }
  
  private detectFridayLossPattern(events: DisciplineEvent[], userId: string): BehavioralPattern | null {
    const fridayLossEvents = events.filter(e => 
      e.dayOfWeek === 'Friday' && 
      e.previousTradeResult === 'loss' &&
      e.consecutiveLosses >= 2
    );
    
    if (fridayLossEvents.length < this.minSampleSize) return null;
    
    const violationRate = fridayLossEvents.filter(e => e.violationType).length / fridayLossEvents.length;
    const financialImpact = fridayLossEvents.reduce((sum, e) => sum + Math.abs(e.financialImpact), 0);
    
    return {
      userId,
      title: 'Friday Loss Pattern',
      description: `Trader breaks rules ${Math.round(violationRate * 10)}% more often on Fridays after two or more consecutive losses`,
      patternType: 'day_of_week_consecutive_losses',
      confidenceScore: Math.min(95, Math.round((fridayLossEvents.length / 20) * 100)),
      sampleSize: fridayLossEvents.length,
      affectedTrades: fridayLossEvents.map(e => e.tradeId),
      estimatedFinancialImpact: -financialImpact,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
  
  private detectOversizedAfterLossPattern(events: DisciplineEvent[], userId: string): BehavioralPattern | null {
    const afterLossEvents = events.filter(e => e.previousTradeResult === 'loss');
    const oversizedEvents = afterLossEvents.filter(e => e.positionSize > e.plannedRisk * 1.5);
    
    if (oversizedEvents.length < this.minSampleSize) return null;
    
    const increasePercent = (oversizedEvents.length / afterLossEvents.length) * 100;
    const financialImpact = oversizedEvents.reduce((sum, e) => sum + Math.abs(e.financialImpact), 0);
    
    return {
      userId,
      title: 'Oversized Positions After Losses',
      description: `After two consecutive losses, position size increases by ${Math.round(increasePercent)}%`,
      patternType: 'position_size_after_losses',
      confidenceScore: Math.min(90, Math.round((oversizedEvents.length / 15) * 100)),
      sampleSize: oversizedEvents.length,
      affectedTrades: oversizedEvents.map(e => e.tradeId),
      estimatedFinancialImpact: -financialImpact,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
  
  private detectStopLossFridayPattern(events: DisciplineEvent[], userId: string): BehavioralPattern | null {
    const fridayAfternoonEvents = events.filter(e => 
      e.dayOfWeek === 'Friday' && 
      (e.timeOfDay === 'afternoon' || e.timeOfDay === 'after_market')
    );
    
    const stopLossViolations = fridayAfternoonEvents.filter(e => 
      e.violationType === 'stop_loss_violation'
    );
    
    if (stopLossViolations.length < this.minSampleSize) return null;
    
    const violationRate = stopLossViolations.length / fridayAfternoonEvents.length;
    const financialImpact = stopLossViolations.reduce((sum, e) => sum + Math.abs(e.financialImpact), 0);
    
    return {
      userId,
      title: 'Friday Afternoon Stop-Loss Violations',
      description: `Friday afternoon has ${Math.round(violationRate * 100)}% more stop-loss violations`,
      patternType: 'stop_loss_violation_time',
      confidenceScore: Math.min(92, Math.round((stopLossViolations.length / 10) * 100)),
      sampleSize: stopLossViolations.length,
      affectedTrades: stopLossViolations.map(e => e.tradeId),
      estimatedFinancialImpact: -financialImpact,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}