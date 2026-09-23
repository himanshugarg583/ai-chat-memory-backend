import { z } from 'zod';
import { memoryRepository } from '../repositories/memory.repository.js';
import { embedText, embedBatch, cosineSimilarity } from '../integrations/embedding.client.js';
import { config } from '../config/env.js';
import { errors } from '../utils/AppError.js';
import { formatMemoryForEmbedding } from '../utils/textExpander.js';

// Schema for validating memory operations from LLM
const memoryOpSchema = z.object({
  action: z.enum(['upsert', 'remove']),
  key: z.string().min(1),
  content: z.string().optional(),
  category: z.string().optional().default('general'),
});

/**
 * Generate a random key for manual memories
 */
const generateManualKey = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'manual_';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Normalize content for comparison
 */
const normalizeContent = (content) => {
  return content.toLowerCase().trim().replace(/\s+/g, ' ');
};

export const memoryService = {
  /**
   * Get memories for a user
   */
  async getMemories(userId, status = 'active') {
    const memories = await memoryRepository.getByUser(userId, status);
    return memories.map((m) => ({
      id: m.id,
      memoryKey: m.memory_key,
      content: m.content,
      category: m.category,
      status: m.status,
      source: m.source,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    }));
  },

  /**
   * Create a manual memory with duplicate/conflict detection
   * If replaceMemoryId is provided, reuse its key atomically via upsert_memory
   */
  async createMemory(userId, { content, category, memoryKey, replaceMemoryId }) {
    let key = memoryKey || generateManualKey();

    // If replacing, validate and reuse the replaced memory's key
    if (replaceMemoryId) {
      const toReplace = await memoryRepository.findById(replaceMemoryId);
      if (!toReplace || toReplace.user_id !== userId || toReplace.status !== 'active') {
        throw errors.notFound('Memory to replace');
      }
      // Reuse the replaced memory's key for atomic upsert
      key = toReplace.memory_key;
    }

    // Generate embedding using key:content format for better matching
    const textForEmbedding = formatMemoryForEmbedding(key, content);
    const embedding = await embedText(textForEmbedding);

    // Check for duplicates/conflicts among existing active memories (skip if replacing)
    if (!replaceMemoryId) {
      const existingMemories = await memoryRepository.getActiveWithEmbeddings(userId);
      const normalizedNew = normalizeContent(content);

      // First: exact-content check across ALL keys
      for (const existing of existingMemories) {
        if (normalizeContent(existing.content) === normalizedNew) {
          throw errors.duplicateMemory({
            id: existing.id,
            memoryKey: existing.memory_key,
            content: existing.content,
            similarity: 1.0,
          });
        }
      }

      // Then: embedding similarity check
      for (const existing of existingMemories) {
        if (!existing.embedding) continue;

        const similarity = cosineSimilarity(embedding, existing.embedding);

        // Semantic duplicate
        if (similarity >= config.MEMORY_DUPLICATE_SIMILARITY) {
          throw errors.duplicateMemory({
            id: existing.id,
            memoryKey: existing.memory_key,
            content: existing.content,
            similarity,
          });
        }

        // Potential conflict
        if (similarity >= config.MEMORY_CONFLICT_SIMILARITY && existing.memory_key !== key) {
          throw errors.memoryConflict({
            id: existing.id,
            memoryKey: existing.memory_key,
            content: existing.content,
            similarity,
          });
        }
      }
    }

    // Use upsert to create/replace the memory atomically (supersedes existing in one call)
    const result = await memoryRepository.upsertMemory(
      userId,
      key,
      content,
      category || 'general',
      embedding,
      'manual',
      null
    );

    // Fetch the created memory
    const memory = await memoryRepository.findActiveByUserAndKey(userId, key);
    return {
      id: memory.id,
      memoryKey: memory.memory_key,
      content: memory.content,
      category: memory.category,
      status: memory.status,
      source: memory.source,
      createdAt: memory.created_at,
    };
  },

  /**
   * Update a memory in place
   */
  async updateMemory(userId, memoryId, updates) {
    const memory = await memoryRepository.findById(memoryId);

    // Check ownership and status
    if (!memory || memory.user_id !== userId || memory.status !== 'active') {
      throw errors.notFound('Memory');
    }

    const updateData = {};
    if (updates.content) {
      updateData.content = updates.content;
      // Re-embed using key:content format
      const textForEmbedding = formatMemoryForEmbedding(memory.memory_key, updates.content);
      updateData.embedding = await embedText(textForEmbedding);
    }
    if (updates.category) {
      updateData.category = updates.category;
    }

    const updated = await memoryRepository.update(memoryId, updateData);

    return {
      id: updated.id,
      memoryKey: updated.memory_key,
      content: updated.content,
      category: updated.category,
      status: updated.status,
      source: updated.source,
      updatedAt: updated.updated_at,
    };
  },

  /**
   * Delete a memory (hard delete)
   */
  async deleteMemory(userId, memoryId) {
    const memory = await memoryRepository.findById(memoryId);

    if (!memory || memory.user_id !== userId) {
      throw errors.notFound('Memory');
    }

    await memoryRepository.delete(memoryId);
    return true;
  },

  /**
   * Process memory operations from LLM response
   * Called during chat flow - includes duplicate detection
   */
  async processMemoryOps(userId, memoryOps, userMessageId) {
    const results = [];
    const validOps = [];

    // Validate and collect valid operations
    for (const op of memoryOps) {
      const parsed = memoryOpSchema.safeParse(op);
      if (!parsed.success) {
        console.warn('Invalid memory op skipped:', op?.key, parsed.error.issues[0]?.message);
        continue;
      }
      validOps.push(parsed.data);
    }

    if (validOps.length === 0) {
      return results;
    }

    // Bug fix 1: Merge ops that share the same key before embedding
    const mergedOps = [];
    const opsByKey = new Map();
    for (const op of validOps) {
      const existing = opsByKey.get(op.key);
      if (!existing) {
        opsByKey.set(op.key, op);
        mergedOps.push(op);
      } else {
        // Same key appears twice
        if (op.action === 'remove' || existing.action === 'remove') {
          // If one is remove, keep the last op
          const idx = mergedOps.indexOf(existing);
          mergedOps[idx] = op;
          opsByKey.set(op.key, op);
        } else {
          // Both are upserts - merge content
          existing.content = `${existing.content}; ${op.content}`;
        }
      }
    }

    // Get existing memories for duplicate detection
    const existingMemories = await memoryRepository.getActiveWithEmbeddings(userId);

    // Batch embed all upsert contents using key:content format
    const upsertOps = mergedOps.filter((op) => op.action === 'upsert' && op.content);
    let embeddings = [];
    if (upsertOps.length > 0) {
      try {
        const textsForEmbedding = upsertOps.map((op) => 
          formatMemoryForEmbedding(op.key, op.content)
        );
        embeddings = await embedBatch(textsForEmbedding);
      } catch (error) {
        console.error('Failed to embed memory contents:', error);
        // Continue without embeddings - ops will be skipped
      }
    }

    let embeddingIndex = 0;
    for (const op of mergedOps) {
      try {
        if (op.action === 'upsert' && op.content) {
          const embedding = embeddings[embeddingIndex++];
          if (!embedding) {
            console.warn('No embedding for op:', op.key);
            continue;
          }

          // Check for exact content match with same key
          const normalizedNew = normalizeContent(op.content);
          const existingWithKey = existingMemories.find(
            (m) => m.memory_key === op.key
          );
          if (existingWithKey) {
            if (normalizedNew === normalizeContent(existingWithKey.content)) {
              // Report as unchanged - do not count toward memory_status
              results.push({
                action: 'unchanged',
                memoryKey: op.key,
                content: op.content,
              });
              continue;
            }
          }

          // Check for exact-content duplicate across ALL keys (including batch-saved)
          const exactDupe = existingMemories.find(
            (m) => m.memory_key !== op.key && normalizeContent(m.content) === normalizedNew
          );
          if (exactDupe) {
            results.push({
              action: 'skipped_duplicate',
              memoryKey: op.key,
              content: op.content,
              existingKey: exactDupe.memory_key,
            });
            continue;
          }

          // Check for semantic duplicates with different keys
          let isDuplicate = false;
          for (const existing of existingMemories) {
            if (existing.memory_key === op.key) continue;
            if (!existing.embedding) continue;

            const similarity = cosineSimilarity(embedding, existing.embedding);
            if (similarity >= config.MEMORY_DUPLICATE_SIMILARITY) {
              results.push({
                action: 'skipped_duplicate',
                memoryKey: op.key,
                content: op.content,
                existingKey: existing.memory_key,
              });
              isDuplicate = true;
              break;
            }
          }

          if (isDuplicate) continue;

          // Perform upsert
          const result = await memoryRepository.upsertMemory(
            userId,
            op.key,
            op.content,
            op.category || 'general',
            embedding,
            'auto',
            userMessageId
          );

          results.push({
            action: result.action,
            memoryKey: result.memory_key,
            content: result.content,
          });

          // Bug fix 2: Update existingMemories in place after successful upsert
          const existingIdx = existingMemories.findIndex((m) => m.memory_key === op.key);
          if (existingIdx !== -1) {
            existingMemories.splice(existingIdx, 1);
          }
          existingMemories.push({
            memory_key: op.key,
            content: op.content,
            embedding,
          });
        } else if (op.action === 'remove') {
          // Find and supersede the memory
          const existing = await memoryRepository.findActiveByUserAndKey(userId, op.key);
          if (existing) {
            await memoryRepository.supersede(existing.id);
            results.push({
              action: 'removed',
              memoryKey: op.key,
              content: existing.content,
            });

            // Bug fix 2: Remove from existingMemories after successful remove
            const existingIdx = existingMemories.findIndex((m) => m.memory_key === op.key);
            if (existingIdx !== -1) {
              existingMemories.splice(existingIdx, 1);
            }
          }
        }
      } catch (error) {
        // Log with more context
        const errorMsg = error.message || error.code || 'Unknown error';
        console.error(`Memory op failed [${op.action}:${op.key}]:`, errorMsg);
        
        // Add failure to results so caller knows what happened
        results.push({
          action: 'failed',
          memoryKey: op.key,
          error: errorMsg,
        });
        // Continue with other ops
      }
    }

    return results;
  },

  /**
   * Determine memory status for a user message based on results
   */
  determineMemoryStatus(gateResult, parseSuccess, memoryResults) {
    if (!gateResult) {
      return 'skipped';
    }

    if (!parseSuccess) {
      return 'failed';
    }

    if (!memoryResults || memoryResults.length === 0) {
      return 'none_found';
    }

    // Filter out unchanged and skipped_duplicate - they don't count as real changes
    const realActions = memoryResults.filter(
      (r) => !['unchanged', 'skipped_duplicate'].includes(r.action)
    );

    if (realActions.length === 0) {
      return 'none_found';
    }

    // Check if all real actions failed
    const allFailed = realActions.every((r) => r.action === 'failed');
    if (allFailed) {
      return 'failed';
    }

    // Check for any updates or removes
    const hasUpdate = realActions.some((r) => r.action === 'updated' || r.action === 'removed');
    if (hasUpdate) {
      return 'updated';
    }

    // Check for any creates
    const hasCreate = realActions.some((r) => r.action === 'created');
    if (hasCreate) {
      return 'created';
    }

    return 'none_found';
  },
};
