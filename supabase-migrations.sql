-- ── STRIKER DB migrations ──────────────────────────────────────────────────
-- Spusti v Supabase SQL Editor: https://supabase.com/dashboard → SQL Editor

-- 1. Kategorie a tagy pre zaznamy
ALTER TABLE zaznam ADD COLUMN IF NOT EXISTS kategoria text DEFAULT 'Iné';
ALTER TABLE zaznam ADD COLUMN IF NOT EXISTS tagy      text[] DEFAULT '{}';

-- 2. Activity log
CREATE TABLE IF NOT EXISTS activity_log (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  user_name   TEXT        NOT NULL DEFAULT 'Staubert',
  action      TEXT        NOT NULL,
  icon        TEXT,
  description TEXT,
  record_id   TEXT
);

-- Index pre rýchle načítanie posledných udalostí
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at DESC);

-- RLS: všetci authenticated a anon môžu čítať a zapisovať (interná app bez auth)
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_activity_log" ON activity_log FOR ALL USING (true) WITH CHECK (true);
