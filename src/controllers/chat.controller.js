import { chatService } from '../services/chat.service.js';
import { success } from '../utils/response.js';

export const chatController = {
  /**
   * GET /api/messages
   * Get messages for the current session
   */
  async getMessages(req, res, next) {
    try {
      const messages = await chatService.getSessionMessages(req.user);
      return success(res, { messages });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/chat
   * Send a message and get a response
   */
  async sendMessage(req, res, next) {
    try {
      const { message } = req.body;
      const result = await chatService.processMessage(req.user, message);
      return success(res, result);
    } catch (error) {
      next(error);
    }
  },
};
