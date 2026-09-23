import { userService } from '../services/user.service.js';
import { success } from '../utils/response.js';

export const userController = {
  /**
   * POST /api/users/start-session
   * Start a new chat session (creates new user)
   */
  async startSession(req, res, next) {
    try {
      const { name } = req.body;
      const user = await userService.startSession(name);
      return success(res, { user });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/users/me/new-session
   * Start a new chat session (resets session_started_at)
   */
  async newSession(req, res, next) {
    try {
      const user = await userService.newSession(req.user.id);
      return success(res, { user });
    } catch (error) {
      next(error);
    }
  },
};
