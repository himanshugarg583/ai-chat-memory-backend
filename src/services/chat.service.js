import { messageRepository } from '../repositories/message.repository.js';
import { memoryRepository } from '../repositories/memory.repository.js';
import { memoryService } from './memory.service.js';
import { shouldExtractMemory } from './memoryGate.js';
import { buildSystemPrompt, buildMessages, parseLLMResponse } from './promptBuilder.js';
import { chatCompletion } from '../integrations/llm.client.js';
import { embedText } from '../integrations/embedding.client.js';
import { config } from '../config/env.js';
import { errors } from '../utils/AppError.js';
import { expandAbbreviations, formatMemoryForEmbedding } from '../utils/textExpander.js';

export const chatService = {
  /**
   * Get messages for the current session
   */
  async getSessionMessages(user) {
    const messages = await messageRepository.getSessionMessages(
      user.id,
      user.session_started_at,
      null,
      100 // Get all session messages for display
    );

    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      memoryStatus: m.memory_status,
      createdAt: m.created_at,
    }));
  },

  /**
   * Process a chat message
   * This is the main chat flow - exactly 1 LLM call per message
   */
  async processMessage(user, messageContent) {
    // Step 1: Save user message (memory_status null initially)
    const userMessage = await messageRepository.create({
      user_id: user.id,
      role: 'user',
      content: messageContent,
      memory_status: null,
    });

    let assistantMessage = null;
    let memoryChanges = [];
    let usedMemories = [];
    let parseSuccess = true;

    try {
      // Step 2: Load session history (excluding the message we just saved)
      const history = await messageRepository.getSessionMessages(
        user.id,
        user.session_started_at,
        userMessage.id,
        config.CHAT_HISTORY_LIMIT
      );

      // Step 3: Memory retrieval (no LLM call)
      const memoryCount = await memoryRepository.countActive(user.id);
      let retrievedMemories = [];
      let allCandidates = [];
      let existingKeys = [];

      if (config.NODE_ENV === 'development') {
        console.log(`\n[Memory] Active memories in DB: ${memoryCount}, User ID: ${user.id}`);
        console.log(`[Memory] Min similarity threshold: ${config.MEMORY_MIN_SIMILARITY}`);
      }

      if (memoryCount > 0) {
        // Expand abbreviations in the query for better semantic matching
        const expandedQuery = expandAbbreviations(messageContent);
        if (config.NODE_ENV === 'development' && expandedQuery !== messageContent) {
          console.log(`[Memory] Expanded query: "${expandedQuery}"`);
        }

        // Embed the expanded user message for similarity search
        const queryEmbedding = await embedText(expandedQuery);
        if (config.NODE_ENV === 'development') {
          console.log(`[Memory] Query embedding generated, dimensions: ${queryEmbedding?.length}`);
        }

        // Get ALL candidates with no threshold (for dev logging)
        allCandidates = await memoryRepository.matchMemories(
          queryEmbedding,
          user.id,
          20, // Get more for logging
          0   // No threshold - get all
        );

        // Filter to those meeting threshold
        retrievedMemories = allCandidates.filter(
          (m) => m.similarity >= config.MEMORY_MIN_SIMILARITY
        ).slice(0, config.MEMORY_MATCH_COUNT);

        // In development, log ALL candidates with their similarity (including below threshold)
        if (config.NODE_ENV === 'development' && allCandidates.length > 0) {
          console.log(`[Memory] All candidates (${allCandidates.length}):`);
          allCandidates.forEach((m) => {
            const marker = m.similarity >= config.MEMORY_MIN_SIMILARITY ? '✓' : '✗';
            console.log(`  ${marker} [${m.memory_key}] "${m.content}" (similarity: ${m.similarity?.toFixed(4)})`);
          });
          console.log(`[Memory] Matched memories (above threshold): ${retrievedMemories.length}`);
        }

        // Get only the keys of active memories (not full content) for prompt merge hints
        existingKeys = await memoryRepository.getActiveKeys(user.id);
      }

      // Populate usedMemories for the response
      usedMemories = retrievedMemories.map((m) => ({
        memoryKey: m.memory_key,
        content: m.content,
        similarity: m.similarity,
      }));

      // Step 4: Memory gate check
      const gateResult = shouldExtractMemory(messageContent);

      // Step 5: Build prompt and make LLM call
      // Only send full content for retrieved memories; send only keys for others
      const retrievedKeys = new Set(retrievedMemories.map((m) => m.memory_key));
      const otherKeys = existingKeys.filter((k) => !retrievedKeys.has(k));

      const systemPrompt = buildSystemPrompt({
        memories: retrievedMemories.map((m) => ({
          memory_key: m.memory_key,
          content: m.content,
        })),
        existingKeys: otherKeys,
        includeMemoryInstructions: gateResult,
      });

      const messages = buildMessages({
        systemPrompt,
        history: history.map((m) => ({ role: m.role, content: m.content })),
        userMessage: messageContent,
      });

      // DEBUG: Log what's being sent to LLM (development only)
      if (config.NODE_ENV === 'development') {
        console.log('\n========== LLM REQUEST ==========');
        console.log('Retrieved Memories:', retrievedMemories.length);
        retrievedMemories.forEach((m) => {
          console.log(`  [${m.memory_key}] ${m.content} (similarity: ${m.similarity?.toFixed(4)})`);
        });
        console.log('\nMessages to LLM:');
        messages.forEach((msg, i) => {
          const preview = msg.content.length > 500 ? msg.content.substring(0, 500) + '...' : msg.content;
          console.log(`  [${i}] ${msg.role}: ${preview}`);
        });
        console.log('==================================\n');
      }

      // Step 6: Make EXACTLY ONE LLM call
      const rawResponse = await chatCompletion(messages);

      // Step 7: Parse the response
      const parsed = parseLLMResponse(rawResponse);
      parseSuccess = parsed.success;

      // Step 8: Save assistant message
      assistantMessage = await messageRepository.create({
        user_id: user.id,
        role: 'assistant',
        content: parsed.reply,
        memory_status: null,
      });

      // Step 9: Process memory operations if gate was true and we have ops
      if (gateResult && parsed.memoryOps.length > 0) {
        memoryChanges = await memoryService.processMemoryOps(
          user.id,
          parsed.memoryOps,
          userMessage.id
        );
      }

      // Step 10: Update user message memory status
      const memoryStatus = memoryService.determineMemoryStatus(
        gateResult,
        parseSuccess,
        memoryChanges
      );

      await messageRepository.updateMemoryStatus(userMessage.id, memoryStatus);

      // Update local object for response
      userMessage.memory_status = memoryStatus;
    } catch (error) {
      // LLM call failed - update message status and rethrow
      if (error.code === 'LLM_UNAVAILABLE') {
        await messageRepository.updateMemoryStatus(userMessage.id, 'failed');
        throw error;
      }
      throw error;
    }

    return {
      userMessage: {
        id: userMessage.id,
        content: userMessage.content,
        memoryStatus: userMessage.memory_status,
        createdAt: userMessage.created_at,
      },
      assistantMessage: assistantMessage
        ? {
            id: assistantMessage.id,
            content: assistantMessage.content,
            createdAt: assistantMessage.created_at,
          }
        : null,
      memoryChanges,
      usedMemories,
    };
  },
};
