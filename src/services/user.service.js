import { userRepository } from '../repositories/user.repository.js';

export const userService = {
  /**
   * Login/upsert a user by email
   */
  async login(email, name) {
    const user = await userRepository.upsertByEmail(email, name);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      sessionStartedAt: user.session_started_at,
    };
  },

  /**
   * Start a new chat session
   */
  async newSession(userId) {
    const user = await userRepository.updateSessionStart(userId);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      sessionStartedAt: user.session_started_at,
    };
  },
};
