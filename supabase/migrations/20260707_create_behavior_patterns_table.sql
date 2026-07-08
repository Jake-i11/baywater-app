-- Create behavior_patterns table for tracking historical behavior patterns
CREATE TABLE behavior_patterns (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_type VARCHAR(255) NOT NULL,
  frequency INTEGER NOT NULL DEFAULT 1,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 10),
  ai_summary TEXT NOT NULL,
  last_occurrence TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_occurrence TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_behavior_patterns_user_id ON behavior_patterns(user_id);
CREATE INDEX idx_behavior_patterns_pattern_type ON behavior_patterns(pattern_type);
CREATE INDEX idx_behavior_patterns_severity ON behavior_patterns(severity);
CREATE INDEX idx_behavior_patterns_last_occurrence ON behavior_patterns(last_occurrence);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_behavior_patterns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_behavior_patterns_updated_at
BEFORE UPDATE ON behavior_patterns
FOR EACH ROW
EXECUTE FUNCTION update_behavior_patterns_updated_at();

-- Add comments for documentation
COMMENT ON TABLE behavior_patterns IS 'Tracks historical behavior patterns detected by the AI system';
COMMENT ON COLUMN behavior_patterns.pattern_type IS 'Type of behavior pattern (e.g., Revenge Trading, Oversized Positions)';
COMMENT ON COLUMN behavior_patterns.frequency IS 'Number of times this pattern has occurred';
COMMENT ON COLUMN behavior_patterns.severity IS 'Average severity score (1-10) for this pattern';
COMMENT ON COLUMN behavior_patterns.ai_summary IS 'AI-generated summary of the behavior pattern';
COMMENT ON COLUMN behavior_patterns.last_occurrence IS 'When this pattern was last detected';
COMMENT ON COLUMN behavior_patterns.first_occurrence IS 'When this pattern was first detected';
COMMENT ON COLUMN behavior_patterns.updated_at IS 'When this record was last updated';