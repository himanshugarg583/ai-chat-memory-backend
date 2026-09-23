-- =====================================================================
-- 001_init.sql  (corrected)
-- AI Chat & Memory Management schema for Supabase (PostgreSQL + pgvector)
-- Run in Supabase SQL Editor on a fresh project.
-- Matches the backend code: vector(512), RPC params p_*.
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- USERS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL CHECK (email = lower(email)),
    name TEXT,
    session_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- MESSAGES
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL CHECK (length(trim(content)) > 0),
    memory_status TEXT CHECK (memory_status IN ('created', 'updated', 'skipped', 'none_found', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_user_time ON messages(user_id, created_at DESC);

-- MEMORIES
CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    memory_key TEXT NOT NULL,
    content TEXT NOT NULL CHECK (length(trim(content)) > 0),
    category TEXT DEFAULT 'general',
    embedding vector(512),                       -- must equal EMBEDDING_DIMENSIONS
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('auto', 'manual')),
    source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only ONE active memory per key; any number of superseded versions (history).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_memory
    ON memories(user_id, memory_key) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_memories_user_status ON memories(user_id, status);
CREATE INDEX IF NOT EXISTS idx_memories_embedding
    ON memories USING hnsw (embedding vector_cosine_ops);

-- Backend uses the secret key (bypasses RLS). Block the public key.
ALTER TABLE users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- Remove older signatures if they exist (param names changed)
DROP FUNCTION IF EXISTS match_memories(vector, uuid, int, float);

-- Vector search: parameter names match memory.repository.js
CREATE OR REPLACE FUNCTION match_memories(
    p_query_embedding vector(512),
    p_user_id UUID,
    p_match_count INT DEFAULT 5,
    p_min_similarity FLOAT DEFAULT 0.2
)
RETURNS TABLE (
    id UUID, user_id UUID, memory_key TEXT, content TEXT,
    category TEXT, status TEXT, source TEXT, similarity FLOAT
)
LANGUAGE sql STABLE AS $$
    SELECT m.id, m.user_id, m.memory_key, m.content, m.category, m.status, m.source,
           1 - (m.embedding <=> p_query_embedding) AS similarity
    FROM memories m
    WHERE m.user_id = p_user_id
      AND m.status = 'active'
      AND m.embedding IS NOT NULL
      AND 1 - (m.embedding <=> p_query_embedding) >= p_min_similarity
    ORDER BY m.embedding <=> p_query_embedding
    LIMIT p_match_count;
$$;

-- Create or update a memory atomically (old version -> superseded)
CREATE OR REPLACE FUNCTION upsert_memory(
    p_user_id UUID,
    p_memory_key TEXT,
    p_content TEXT,
    p_category TEXT DEFAULT 'general',
    p_embedding vector(512) DEFAULT NULL,
    p_source TEXT DEFAULT 'manual',
    p_source_message_id UUID DEFAULT NULL
)
RETURNS TABLE (action TEXT, memory_id UUID, memory_key TEXT, content TEXT)
LANGUAGE plpgsql AS $$
DECLARE
    v_existing_id UUID;
    v_new_id UUID;
BEGIN
    SELECT m.id INTO v_existing_id
    FROM memories m
    WHERE m.user_id = p_user_id AND m.memory_key = p_memory_key AND m.status = 'active'
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
        UPDATE memories SET status = 'superseded' WHERE id = v_existing_id;
    END IF;

    INSERT INTO memories (user_id, memory_key, content, category, embedding, source, source_message_id)
    VALUES (p_user_id, p_memory_key, p_content, p_category, p_embedding, p_source, p_source_message_id)
    RETURNING id INTO v_new_id;

    RETURN QUERY SELECT
        CASE WHEN v_existing_id IS NULL THEN 'created' ELSE 'updated' END,
        v_new_id, p_memory_key, p_content;
END;
$$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_memories_updated_at ON memories;
CREATE TRIGGER update_memories_updated_at BEFORE UPDATE ON memories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();