import { supabase } from '../config/supabase.js';
import { errors } from '../utils/AppError.js';

export const memoryRepository = {
  /**
   * Find memory by ID
   */
  async findById(id) {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('Database error in memory findById:', error);
      throw errors.databaseUnavailable('Failed to fetch memory');
    }

    return data;
  },

  /**
   * Find active memory by user and key
   */
  async findActiveByUserAndKey(userId, memoryKey) {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .eq('memory_key', memoryKey)
      .eq('status', 'active')
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('Database error in findActiveByUserAndKey:', error);
      throw errors.databaseUnavailable('Failed to fetch memory');
    }

    return data;
  },

  /**
   * Get all memories for a user (optionally filter by status)
   */
  async getByUser(userId, status = 'active') {
    let query = supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error in memory getByUser:', error);
      throw errors.databaseUnavailable('Failed to fetch memories');
    }

    return data || [];
  },

  /**
   * Get active memory keys for a user (just keys, no content)
   */
  async getActiveKeys(userId) {
    const { data, error } = await supabase
      .from('memories')
      .select('memory_key')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) {
      console.error('Database error in getActiveKeys:', error);
      throw errors.databaseUnavailable('Failed to fetch memory keys');
    }

    return (data || []).map((m) => m.memory_key);
  },

  /**
   * Get all active memories with embeddings for a user
   */
  async getActiveWithEmbeddings(userId) {
    const { data, error } = await supabase
      .from('memories')
      .select('id, memory_key, content, category, embedding')
      .eq('user_id', userId)
      .eq('status', 'active')
      .not('embedding', 'is', null);

    if (error) {
      console.error('Database error in getActiveWithEmbeddings:', error);
      throw errors.databaseUnavailable('Failed to fetch memories');
    }

    return data || [];
  },

  /**
   * Count active memories for a user
   */
  async countActive(userId) {
    const { count, error } = await supabase
      .from('memories')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) {
      console.error('Database error in countActive:', error);
      throw errors.databaseUnavailable('Failed to count memories');
    }

    return count || 0;
  },

  /**
   * Match memories using vector similarity (calls RPC function)
   */
  async matchMemories(embedding, userId, matchCount, matchThreshold) {
    const { data, error } = await supabase.rpc('match_memories', {
      p_query_embedding: embedding,
      p_user_id: userId,
      p_match_count: matchCount,
      p_min_similarity: matchThreshold,
    });

    if (error) {
      console.error('Database error in matchMemories:', error);
      throw errors.databaseUnavailable('Failed to match memories');
    }

    return data || [];
  },

  /**
   * Upsert a memory (calls RPC function)
   */
  async upsertMemory(userId, memoryKey, content, category, embedding, source, sourceMessageId) {
    const { data, error } = await supabase.rpc('upsert_memory', {
      p_user_id: userId,
      p_memory_key: memoryKey,
      p_content: content,
      p_category: category || 'general',
      p_embedding: embedding,
      p_source: source || 'manual',
      p_source_message_id: sourceMessageId || null,
    });

    if (error) {
      console.error('Database error in upsertMemory:', error);
      throw errors.databaseUnavailable('Failed to upsert memory');
    }

    return data?.[0] || null;
  },

  /**
   * Create a new memory directly (without upsert logic)
   */
  async create(memoryData) {
    const { data, error } = await supabase
      .from('memories')
      .insert(memoryData)
      .select()
      .single();

    if (error) {
      console.error('Database error in memory create:', error);
      throw errors.databaseUnavailable('Failed to create memory');
    }

    return data;
  },

  /**
   * Update memory content/category in place
   */
  async update(id, updates) {
    const { data, error } = await supabase
      .from('memories')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Database error in memory update:', error);
      throw errors.databaseUnavailable('Failed to update memory');
    }

    return data;
  },

  /**
   * Mark a memory as superseded
   */
  async supersede(id) {
    const { data, error } = await supabase
      .from('memories')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Database error in memory supersede:', error);
      throw errors.databaseUnavailable('Failed to supersede memory');
    }

    return data;
  },

  /**
   * Hard delete a memory
   */
  async delete(id) {
    const { error } = await supabase
      .from('memories')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Database error in memory delete:', error);
      throw errors.databaseUnavailable('Failed to delete memory');
    }

    return true;
  },

  /**
   * Ping database (for health check)
   */
  async ping() {
    const { error } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (error) {
      throw errors.databaseUnavailable('Database health check failed');
    }

    return true;
  },
};
