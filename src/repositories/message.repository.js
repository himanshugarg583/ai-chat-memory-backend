import { supabase } from '../config/supabase.js';
import { errors } from '../utils/AppError.js';

export const messageRepository = {
  /**
   * Create a new message
   */
  async create(messageData) {
    const { data, error } = await supabase
      .from('messages')
      .insert(messageData)
      .select()
      .single();

    if (error) {
      console.error('Database error in message create:', error);
      throw errors.databaseUnavailable('Failed to create message');
    }

    return data;
  },

  /**
   * Get messages for a user's current session
   * Returns LAST N messages (most recent), ordered oldest first for context
   */
  async getSessionMessages(userId, sessionStartedAt, excludeMessageId = null, limit = 10) {
    // First get the most recent messages (descending order)
    let query = supabase
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', sessionStartedAt)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (excludeMessageId) {
      query = query.neq('id', excludeMessageId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error in getSessionMessages:', error);
      throw errors.databaseUnavailable('Failed to fetch messages');
    }

    // Reverse to get oldest-first order for LLM context
    return (data || []).reverse();
  },

  /**
   * Update memory status on a message
   */
  async updateMemoryStatus(messageId, memoryStatus) {
    const { data, error } = await supabase
      .from('messages')
      .update({ memory_status: memoryStatus })
      .eq('id', messageId)
      .select()
      .single();

    if (error) {
      console.error('Database error in updateMemoryStatus:', error);
      throw errors.databaseUnavailable('Failed to update message');
    }

    return data;
  },

  /**
   * Get all messages for a user (for admin/debug purposes)
   */
  async getAllByUser(userId) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Database error in getAllByUser:', error);
      throw errors.databaseUnavailable('Failed to fetch messages');
    }

    return data || [];
  },
};
