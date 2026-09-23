import { memoryService } from '../services/memory.service.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

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

  /**
   * POST /api/memories/upload-pdf
   * Extract text from PDF and create memories
   */
  async uploadPdf(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { message: 'No PDF file uploaded' },
        });
      }

      // Parse PDF
      const pdfData = await pdfParse(req.file.buffer);
      const text = pdfData.text.trim();

      if (!text) {
        return res.status(400).json({
          success: false,
          error: { message: 'Could not extract text from PDF' },
        });
      }

      // Split text into chunks (max ~500 chars each for better memory units)
      const chunks = [];
      const paragraphs = text.split(/\n\n+/);
      let currentChunk = '';

      for (const para of paragraphs) {
        const cleaned = para.replace(/\s+/g, ' ').trim();
        if (!cleaned) continue;

        if (currentChunk.length + cleaned.length > 500) {
          if (currentChunk) chunks.push(currentChunk.trim());
          currentChunk = cleaned;
        } else {
          currentChunk += (currentChunk ? ' ' : '') + cleaned;
        }
      }
      if (currentChunk) chunks.push(currentChunk.trim());

      // Create memories for each chunk
      const category = req.body.category || 'general';
      const createdMemories = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk.length < 10) continue; // Skip very short chunks

        const memory = await memoryService.createMemory(req.user.id, {
          content: chunk,
          category,
          memoryKey: `pdf_${Date.now()}_${i}`,
        });
        createdMemories.push(memory);
      }

      res.status(201).json({
        success: true,
        message: `Created ${createdMemories.length} memories from PDF`,
        count: createdMemories.length,
        memories: createdMemories,
      });
    } catch (error) {
      next(error);
    }
  },
};
