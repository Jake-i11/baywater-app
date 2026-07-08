-- Extend discipline_violations with full behavioral context dimensions
-- required by the Discipline Confluence Engine.
ALTER TABLE discipline_violations
  ADD COLUMN IF NOT EXISTS ticker VARCHAR(50),
  ADD COLUMN IF NOT EXISTS setup_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS day_of_week VARCHAR(20),
  ADD COLUMN IF NOT EXISTS time_of_day VARCHAR(50),
  ADD COLUMN IF NOT EXISTS market_session VARCHAR(50),
  ADD COLUMN IF NOT EXISTS previous_trade_result VARCHAR(10),
  ADD COLUMN IF NOT EXISTS consecutive_wins INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_losses INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_pl_before_trade NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS position_size NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS planned_risk NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_risk NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS financial_impact NUMERIC DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_discipline_violations_day_of_week
  ON discipline_violations(day_of_week);
CREATE INDEX IF NOT EXISTS idx_discipline_violations_time_of_day
  ON discipline_violations(time_of_day);
CREATE INDEX IF NOT EXISTS idx_discipline_violations_prev_result
  ON discipline_violations(previous_trade_result);

-- Extend behavior_patterns with confluence engine output fields.
ALTER TABLE behavior_patterns
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS confidence_score INTEGER CHECK (confidence_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS estimated_financial_impact NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS affected_trades JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN behavior_patterns.title IS 'Human-readable pattern title';
COMMENT ON COLUMN behavior_patterns.description IS 'Plain-language description of the detected confluence';
COMMENT ON COLUMN behavior_patterns.confidence_score IS 'Statistical confidence (0-100)';
COMMENT ON COLUMN behavior_patterns.estimated_financial_impact IS 'Estimated $ cost attributable to this pattern (negative)';
COMMENT ON COLUMN behavior_patterns.affected_trades IS 'Array of trade IDs that form this pattern';

-- Trader profile: store structured recurring mistakes from the confluence engine.
ALTER TABLE trader_profiles
  ADD COLUMN IF NOT EXISTS recurring_mistakes JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN trader_profiles.recurring_mistakes IS 'Structured recurring behavioral weaknesses with confidence/impact';