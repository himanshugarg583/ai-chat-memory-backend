import { memoryService } from '../services/memory.service.js';

export const memoryController = {
  /**
   * GET /api/memories
   * Get all memories for the user
   */
  async getMemories(req, res, next) {
    try {
      const { status } = req.query || { status: 'active' };
      const memories = await memoryService.getMemories(req.user.id, status);

      res.status(200).json({
        success: true,
        count: memories.length,
        memories,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/memories
   * Create a new memory manually
   */
  async createMemory(req, res, next) {
    try {
      const { content, category, memoryKey, replaceMemoryId } = req.body;
      const memory = await memoryService.createMemory(req.user.id, {
        content,
        category,
        memoryKey,
        replaceMemoryId,
      });

      res.status(201).json({
        success: true,
        memory,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/memories/:id
   * Update a memory in place
   */
  async updateMemory(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;
      const memory = await memoryService.updateMemory(req.user.id, id, updates);

      res.status(200).json({
        success: true,
        memory,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/memories/:id
   * Delete a memory
   */
  async deleteMemory(req, res, next) {
    try {
      const { id } = req.params;
      await memoryService.deleteMemory(req.user.id, id);

      res.status(200).json({
        success: true,
        message: 'Memory deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },
};
