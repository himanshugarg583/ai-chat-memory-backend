-- AI Chat & Memory Management Schema
-- Run this in Supabase SQL Editor

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    session_started_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    memory_status TEXT CHECK (memory_status IN ('created', 'updated', 'skipped', 'none_found', 'failed', NULL)),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Memories table with vector embeddings
CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    memory_key TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    embedding vector(1536),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('auto', 'manual')),
    source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, memory_key, status) -- Only one active memory per key per user
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_session ON messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_user_status ON memories(user_id, status);
CREATE INDEX IF NOT EXISTS idx_memories_user_key_status ON memories(user_id, memory_key, status);

-- Function to match memories by vector similarity
CREATE OR REPLACE FUNCTION match_memories(
    query_embedding vector(1536),
    match_user_id UUID,
    match_count INT DEFAULT 5,
    match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    memory_key TEXT,
    content TEXT,
    category TEXT,
    status TEXT,
    source TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.user_id,
        m.memory_key,
        m.content,
        m.category,
        m.status,
        m.source,
        1 - (m.embedding <=> query_embedding) AS similarity
    FROM memories m
    WHERE m.user_id = match_user_id
      AND m.status = 'active'
      AND m.embedding IS NOT NULL
      AND 1 - (m.embedding <=> query_embedding) > match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function to upsert a memory (create or update)
CREATE OR REPLACE FUNCTION upsert_memory(
    p_user_id UUID,
    p_memory_key TEXT,
    p_content TEXT,
    p_category TEXT DEFAULT 'general',
    p_embedding vector(1536) DEFAULT NULL,
    p_source TEXT DEFAULT 'manual',
    p_source_message_id UUID DEFAULT NULL
)
RETURNS TABLE (
    action TEXT,
    memory_id UUID,
    memory_key TEXT,
    content TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_existing_id UUID;
    v_action TEXT;
    v_new_id UUID;
BEGIN
    -- Check if an active memory with this key exists for this user
    SELECT id INTO v_existing_id
    FROM memories m
    WHERE m.user_id = p_user_id
      AND m.memory_key = p_memory_key
      AND m.status = 'active';
    
    IF v_existing_id IS NOT NULL THEN
        -- Supersede the existing memory
        UPDATE memories
        SET status = 'superseded',
            updated_at = NOW()
        WHERE id = v_existing_id;
        
        v_action := 'updated';
    ELSE
        v_action := 'created';
    END IF;
    
    -- Insert the new memory
    INSERT INTO memories (user_id, memory_key, content, category, embedding, source, source_message_id)
    VALUES (p_user_id, p_memory_key, p_content, p_category, p_embedding, p_source, p_source_message_id)
    RETURNING id INTO v_new_id;
    
    RETURN QUERY SELECT v_action, v_new_id, p_memory_key, p_content;
END;
$$;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_memories_updated_at
    BEFORE UPDATE ON memories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
