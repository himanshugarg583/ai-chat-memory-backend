import { memoryRepository } from '../repositories/memory.repository.js';
import { config } from '../config/env.js';

export const healthController = {
  /**
   * GET /api/health
   * Returns service status
   */
  async healthCheck(req, res, next) {
    try {
      // Check database connectivity
      let dbStatus = 'ok';
      try {
        await memoryRepository.ping();
      } catch {
        dbStatus = 'error';
      }

      const status = dbStatus === 'ok' ? 'healthy' : 'degraded';
      const statusCode = dbStatus === 'ok' ? 200 : 503;

      res.status(statusCode).json({
        status,
        timestamp: new Date().toISOString(),
        services: {
          database: dbStatus,
          api: 'ok',
        },
        config: {
          chatModel: config.OPENAI_CHAT_MODEL,
          embeddingModel: config.OPENAI_EMBEDDING_MODEL,
          embeddingDimensions: config.EMBEDDING_DIMENSIONS,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
