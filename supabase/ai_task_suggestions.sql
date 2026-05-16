-- ── STRIKER AI – ai_task_suggestions table ───────────────────────────────────
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_task_suggestions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       text        NOT NULL,
  task_title       text        NOT NULL,
  assigned_to      text        NOT NULL DEFAULT 'both',
  priority         text        NOT NULL DEFAULT 'NORMÁLNA',
  deadline         date,
  confidence_score float       DEFAULT 0.7,
  status           text        NOT NULL DEFAULT 'pending',
  category         text,
  description      text,
  reason           text,
  extracted_by_ai  boolean     DEFAULT true,
  created_from     text        DEFAULT 'chat_ai',
  created_at       timestamptz DEFAULT now()
);

-- Row Level Security
ALTER TABLE ai_task_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_ai_suggestions"
  ON ai_task_suggestions
  FOR ALL
  USING (true)
  WITH CHECK (true);
