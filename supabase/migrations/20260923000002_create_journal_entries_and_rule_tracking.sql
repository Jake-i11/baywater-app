-- Journal entries: per-trade or standalone notes with rule tracking
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
  journal_id UUID REFERENCES journals(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT,
  emotional_state TEXT,
  lessons_learned TEXT,
  plan_for_improvement TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user_id ON journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_trade_id ON journal_entries(trade_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_journal_id ON journal_entries(journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date DESC);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own journal entries"
  ON journal_entries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Rule tracking: records which rules were followed/violated for a journal entry
CREATE TABLE IF NOT EXISTS journal_entry_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES user_rules(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('followed', 'violated', 'not_applicable')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(journal_entry_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_journal_entry_rules_user_id ON journal_entry_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_rules_entry_id ON journal_entry_rules(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_rules_rule_id ON journal_entry_rules(rule_id);

ALTER TABLE journal_entry_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own rule tracking"
  ON journal_entry_rules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
