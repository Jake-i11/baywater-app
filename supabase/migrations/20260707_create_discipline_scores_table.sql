-- Create discipline_scores table for tracking overall discipline scores
CREATE TABLE discipline_scores (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date_range TSANGE NOT NULL,
  final_score INTEGER NOT NULL CHECK (final_score BETWEEN 0 AND 100),
  starting_score INTEGER NOT NULL DEFAULT 100,
  deductions INTEGER NOT NULL DEFAULT 0,
  bonuses INTEGER NOT NULL DEFAULT 0,
  explanation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_discipline_scores_user_id ON discipline_scores(user_id);
CREATE INDEX idx_discipline_scores_date_range ON discipline_scores(date_range);
CREATE INDEX idx_discipline_scores_final_score ON discipline_scores(final_score);
CREATE INDEX idx_discipline_scores_created_at ON discipline_scores(created_at);

-- Add comments for documentation
COMMENT ON TABLE discipline_scores IS 'Tracks overall discipline scores calculated by the deterministic scoring engine';
COMMENT ON COLUMN discipline_scores.date_range IS 'Date range covered by this score (e.g., daily, weekly, monthly)';
COMMENT ON COLUMN discipline_scores.final_score IS 'Final discipline score (0-100)';
COMMENT ON COLUMN discipline_scores.starting_score IS 'Starting score before deductions (typically 100)';
COMMENT ON COLUMN discipline_scores.deductions IS 'Total points deducted for violations';
COMMENT ON COLUMN discipline_scores.bonuses IS 'Total bonus points for good behavior';
COMMENT ON COLUMN discipline_scores.explanation IS 'Detailed explanation of how the score was calculated';