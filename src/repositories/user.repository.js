import { supabase } from '../config/supabase.js';
import { errors } from '../utils/AppError.js';
import { randomUUID } from 'crypto';

export const userRepository = {
  /**
   * Create a new session (user) with auto-generated email
   */
  async createSession(name) {
    const sessionId = randomUUID();
    const autoEmail = `session_${sessionId}@session.local`;
    return this.create({ email: autoEmail, name });
  },

  /**
   * Find user by ID
   */
  async findById(id) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('Database error in findById:', error);
      throw errors.databaseUnavailable('Failed to fetch user');
    }

    return data;
  },

  /**
   * Find user by email
   */
  async findByEmail(email) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('Database error in findByEmail:', error);
      throw errors.databaseUnavailable('Failed to fetch user');
    }

    return data;
  },

  /**
   * Create a new user
   */
  async create(userData) {
    const { data, error } = await supabase
      .from('users')
      .insert(userData)
      .select()
      .single();

    if (error) {
      console.error('Database error in create:', error);
      throw errors.databaseUnavailable('Failed to create user');
    }

    return data;
  },

  /**
   * Upsert user by email (create or update)
   */
  async upsertByEmail(email, name) {
    // First try to find existing user
    const existing = await this.findByEmail(email);

    if (existing) {
      // Update name if provided and different
      if (name && name !== existing.name) {
        const { data, error } = await supabase
          .from('users')
          .update({ name })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          console.error('Database error in upsertByEmail update:', error);
          throw errors.databaseUnavailable('Failed to update user');
        }
        return data;
      }
      return existing;
    }

    // Create new user
    return this.create({ email, name });
  },

  /**
   * Update session start time (for "new chat")
   */
  async updateSessionStart(userId) {
    const { data, error } = await supabase
      .from('users')
      .update({ session_started_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Database error in updateSessionStart:', error);
      throw errors.databaseUnavailable('Failed to update session');
    }

    return data;
  },
};
