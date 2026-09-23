/**
 * Prompt builder - pure functions for constructing LLM prompts
 * No I/O, no side effects - just string construction
 */

/**
 * Build the system prompt for chat
 * @param {Object} options
 * @param {Array} options.memories - Retrieved memories [{memory_key, content}]
 * @param {Array} options.existingMemories - All active memories with content (for merge hints)
 * @param {Array} options.existingKeys - List of existing memory keys not in memories (keys only)
 * @param {boolean} options.includeMemoryInstructions - Whether to include memory extraction rules
 */
export const buildSystemPrompt = ({ memories = [], existingMemories = [], existingKeys = [], includeMemoryInstructions = false }) => {
  let prompt = `You are a helpful AI assistant. Be concise, friendly, and helpful.

You respond in JSON format. Always include a "reply" field with your response to the user.`;

  // Add memory context if available
  if (memories.length > 0) {
    prompt += `

Known facts about the user. When they are relevant to the question, use them to personalize the answer explicitly:`;
    for (const mem of memories) {
      prompt += `\n- [${mem.memory_key}] ${mem.content}`;
    }
  }

  // Add memory extraction instructions only when gate is true
  if (includeMemoryInstructions) {
    // Build list of existing memories with content for merge hints
    let existingMemoryHints = '';
    if (existingMemories.length > 0) {
      existingMemoryHints = '\n\nExisting memories (for updates/merges):';
      for (const mem of existingMemories) {
        existingMemoryHints += `\n- [${mem.memory_key}] ${mem.content}`;
      }
    }
    
    // Add keys that weren't retrieved but exist
    const otherKeys = existingKeys.filter(k => !existingMemories.some(m => m.memory_key === k));
    if (otherKeys.length > 0) {
      existingMemoryHints += `\nOther keys: [${otherKeys.join(', ')}]`;
    }

    prompt += `

In addition to "reply", you may include a "memory_ops" array to save or update facts about the user.

Memory rules:
- Save only stable, long-term facts about the user (identity, job, skills, tools, preferences, experience, location, goals)
- Questions and requests (what, which, suggest, recommend, how, tell me) must return empty memory_ops unless the same message also states a new fact about the user
- Never save questions, one-off tasks, general knowledge, or facts about yourself (the assistant)
- Each operation: { "action": "upsert" | "remove", "key": string, "content": string, "category": string }
- Write content in third person, short (e.g., "User works with PostgreSQL")
- Never write "primarily" unless the user explicitly said so
- If the user says "also" or "too", MERGE with the existing fact for that key (e.g., "User works with PostgreSQL and MySQL") instead of replacing it
- Preferred keys: name, profession, primary_language, primary_database, primary_framework, experience, location, company, goal, preference_<topic>, likes_<topic>
- Use snake_case for keys. Create a new key only if none of the preferred keys fit
- If updating an existing fact, REUSE the existing key
- One fact per key. A language change must not touch primary_database, etc.
- Use "remove" when the user says a fact is no longer true and provides no replacement
- If nothing is worth saving, return "memory_ops": []${existingMemoryHints}

Response format (JSON):
{
  "reply": "Your response to the user",
  "memory_ops": [
    { "action": "upsert", "key": "primary_database", "content": "User works with PostgreSQL", "category": "technical" }
  ]
}`;
  } else {
    prompt += `

Response format (JSON):
{
  "reply": "Your response to the user"
}`;
  }

  return prompt;
};

/**
 * Build the messages array for chat completion
 * @param {Object} options
 * @param {string} options.systemPrompt - The system prompt
 * @param {Array} options.history - Chat history [{role, content}]
 * @param {string} options.userMessage - The current user message
 */
export const buildMessages = ({ systemPrompt, history = [], userMessage }) => {
  const messages = [{ role: 'system', content: systemPrompt }];

  // Add conversation history
  for (const msg of history) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  // Add current user message
  messages.push({ role: 'user', content: userMessage });

  return messages;
};

/**
 * Parse the LLM response safely
 * @param {string} rawResponse - Raw response from LLM
 * @returns {Object} - Parsed response with reply and optional memory_ops
 */
export const parseLLMResponse = (rawResponse) => {
  try {
    const parsed = JSON.parse(rawResponse);
    
    return {
      success: true,
      reply: parsed.reply || rawResponse,
      memoryOps: Array.isArray(parsed.memory_ops) ? parsed.memory_ops : [],
    };
  } catch (error) {
    // JSON parse failed - use raw text as reply
    return {
      success: false,
      reply: rawResponse,
      memoryOps: [],
    };
  }
};
