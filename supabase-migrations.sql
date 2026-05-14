-- ── STRIKER DB migrations ──────────────────────────────────────────────────
-- ══ SETUP POKYNY ══════════════════════════════════════════════════════════════
--
-- 1. VYTVOR POUŽÍVATEĽOV v Supabase:
--    Dashboard → Authentication → Users → Invite user
--    staubert@striker-energy.de   (alebo iný email)
--    szabo@striker-energy.de
--    → Nastav heslo cez "Reset password" alebo "Edit user"
--
-- 2. SPUSTI SQL nižšie v SQL Editore
--
-- ══════════════════════════════════════════════════════════════════════════════
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

-- RLS: len prihlásení používatelia
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_authenticated_activity_log"
  ON activity_log FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- 3. RLS na zaznam tabuľke — len authenticated
ALTER TABLE zaznam ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_authenticated_zaznam"
  ON zaznam FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- 4. RLS na task_status tabuľke (ak existuje)
-- ALTER TABLE task_status ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "allow_authenticated_task_status"
--   ON task_status FOR ALL TO authenticated USING (true) WITH CHECK (true);
