-- ══════════════════════════════════════════════════════════════
--  STRIKER Team Chat – Supabase Schema
--  Spusti v Supabase SQL Editore (Dashboard → SQL Editor)
-- ══════════════════════════════════════════════════════════════

-- ── CHAT MESSAGES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author     TEXT        NOT NULL,
  text       TEXT        NOT NULL,
  type       TEXT        NOT NULL DEFAULT 'info'
               CHECK (type IN ('info', 'warning', 'critical', 'ai_note')),
  pinned     BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── LINKED ENTRIES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.linked_entries (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_ids     JSONB       NOT NULL DEFAULT '[]',
  title           TEXT        NOT NULL,
  summary         TEXT,
  decisions       TEXT,
  tasks           TEXT,
  critical_points TEXT,
  created_by      TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chat_messages_created
  ON public.chat_messages (created_at ASC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned
  ON public.chat_messages (pinned)
  WHERE pinned = true;

CREATE INDEX IF NOT EXISTS idx_linked_entries_created
  ON public.linked_entries (created_at DESC);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
ALTER TABLE public.chat_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linked_entries ENABLE ROW LEVEL SECURITY;

-- chat_messages: authenticated users can read, insert, update (pin)
CREATE POLICY "chat_messages_select" ON public.chat_messages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "chat_messages_insert" ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "chat_messages_update" ON public.chat_messages
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- linked_entries: authenticated users can read and insert
CREATE POLICY "linked_entries_select" ON public.linked_entries
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "linked_entries_insert" ON public.linked_entries
  FOR INSERT TO authenticated WITH CHECK (true);

-- ── HOTOVÉ / COMPLETED TASKS ────────────────────────────────
-- Run this migration to add completion tracking to the zaznam table.
-- Format: { "task text": "2026-05-16" }
ALTER TABLE public.zaznam ADD COLUMN IF NOT EXISTS ulohy_splnene JSONB DEFAULT '{}';

-- ── REALTIME ─────────────────────────────────────────────────
-- Enable realtime replication for both tables in Supabase Dashboard:
--   Database → Replication → Supabase Realtime → toggle on chat_messages & linked_entries
--
-- Or run:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.linked_entries;
