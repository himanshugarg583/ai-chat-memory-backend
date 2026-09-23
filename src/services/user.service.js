import { userRepository } from '../repositories/user.repository.js';

export const userService = {
  /**
   * Start a new session (creates user with auto-generated email)
   */
  async startSession(name) {
    const user = await userRepository.createSession(name);
    return {
      id: user.id,
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
      name: user.name,
      sessionStartedAt: user.session_started_at,
    };
  },
};
