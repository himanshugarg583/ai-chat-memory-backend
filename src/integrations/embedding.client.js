import OpenAI from 'openai';
import { config } from '../config/env.js';
import { errors } from '../utils/AppError.js';

const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
  timeout: config.LLM_TIMEOUT_MS,
});

/**
 * Generate embedding for a single text
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - Embedding vector
 */
export const embedText = async (text) => {
  const embeddings = await embedBatch([text]);
  return embeddings[0];
};

/**
 * Generate embeddings for multiple texts in a single API call
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
export const embedBatch = async (texts) => {
  if (!texts || texts.length === 0) {
    return [];
  }

  try {
    const response = await openai.embeddings.create({
      model: config.OPENAI_EMBEDDING_MODEL,
      input: texts,
      dimensions: config.EMBEDDING_DIMENSIONS,
    });

    // Sort by index to ensure order matches input
    const sorted = response.data.sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  } catch (error) {
    console.error('Embedding error:', error.message);

    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      throw errors.llmUnavailable('Embedding request timed out');
    }

    if (error.status === 429) {
      throw errors.llmUnavailable('Embedding rate limit exceeded');
    }

    if (error.status >= 500) {
      throw errors.llmUnavailable('Embedding service temporarily unavailable');
    }

    throw errors.llmUnavailable(error.message || 'Embedding request failed');
  }
};

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} - Similarity score (0 to 1)
 */
export const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
};
