import OpenAI from 'openai';
import { config } from '../config/env.js';
import { errors } from '../utils/AppError.js';

const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
  timeout: config.LLM_TIMEOUT_MS,
});

/**
 * Make a chat completion call with JSON mode
 * @param {Array} messages - Array of message objects with role and content
 * @returns {Promise<string>} - The raw response content (should be valid JSON)
 */
export const chatCompletion = async (messages) => {
  try {
    const response = await openai.chat.completions.create({
      model: config.OPENAI_CHAT_MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_tokens: config.LLM_MAX_TOKENS,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    return content;
  } catch (error) {
    console.error('LLM error:', error.message);
    
    // Handle timeout
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      throw errors.llmUnavailable('LLM request timed out');
    }
    
    // Handle rate limiting
    if (error.status === 429) {
      throw errors.llmUnavailable('LLM rate limit exceeded');
    }
    
    // Handle other OpenAI errors
    if (error.status >= 500) {
      throw errors.llmUnavailable('LLM service temporarily unavailable');
    }

    throw errors.llmUnavailable(error.message || 'LLM request failed');
  }
};
