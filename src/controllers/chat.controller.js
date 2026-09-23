import { chatService } from '../services/chat.service.js';

export const chatController = {
  /**
   * GET /api/messages
   * Get messages for the current session
   */
  async getMessages(req, res, next) {
    try {
      const messages = await chatService.getSessionMessages(req.user);

      res.status(200).json({
        success: true,
        messages,
      });
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

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },
};
