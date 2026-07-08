-- Create discipline_violations table for tracking individual violations
CREATE TABLE discipline_violations (
  id BIGSERIAL PRIMARY KEY,
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  violation_type VARCHAR(255) NOT NULL,
  severity_score INTEGER NOT NULL CHECK (severity_score BETWEEN 1 AND 10),
  severity_category VARCHAR(50) NOT NULL CHECK (severity_category IN ('low', 'medium', 'high')),
  ai_reasoning TEXT NOT NULL,
  evidence JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_discipline_violations_user_id ON discipline_violations(user_id);
CREATE INDEX idx_discipline_violations_trade_id ON discipline_violations(trade_id);
CREATE INDEX idx_discipline_violations_violation_type ON discipline_violations(violation_type);
CREATE INDEX idx_discipline_violations_created_at ON discipline_violations(created_at);

-- Add comments for documentation
COMMENT ON TABLE discipline_violations IS 'Tracks individual discipline violations detected by the AI system';
COMMENT ON COLUMN discipline_violations.violation_type IS 'Type of violation (e.g., Position Size Violation, Emotional Trading)';
COMMENT ON COLUMN discipline_violations.severity_score IS 'Severity score from 1 (minor) to 10 (major)';
COMMENT ON COLUMN discipline_violations.severity_category IS 'Severity category: low (1-3), medium (4-6), high (7-10)';
COMMENT ON COLUMN discipline_violations.ai_reasoning IS 'AI-generated explanation of why this is a violation';
COMMENT ON COLUMN discipline_violations.evidence IS 'Specific evidence supporting the violation classification';