-- STRIKER AI Agent V2 migrations
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/jjvegnwqipmcipwvdjje/sql

-- 1. Add metadata column to chat_messages for AI agent tracking
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- 2. Index for fast AI agent duplicate checks
CREATE INDEX IF NOT EXISTS idx_chat_messages_agent
  ON chat_messages ((metadata->>'type'), (metadata->>'date'))
  WHERE author = 'ai-agent';

-- 3. ai_task_suggestions table (needed for extract-task.js)
CREATE TABLE IF NOT EXISTS ai_task_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      text NOT NULL,
  task_title      text NOT NULL,
  assigned_to     text NOT NULL DEFAULT 'both',
  priority        text NOT NULL DEFAULT 'NORMÁLNA',
  deadline        date,
  confidence_score float DEFAULT 0.7,
  status          text NOT NULL DEFAULT 'pending',
  category        text,
  description     text,
  reason          text,
  extracted_by_ai boolean DEFAULT true,
  created_from    text DEFAULT 'chat_ai',
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE ai_task_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "allow_all_ai_suggestions"
  ON ai_task_suggestions FOR ALL USING (true) WITH CHECK (true);
