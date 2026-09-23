import 'dotenv/config';

export const config = {
  // Server
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || '',

  // OpenAI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_CHAT_MODEL: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
  OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  EMBEDDING_DIMENSIONS: parseInt(process.env.EMBEDDING_DIMENSIONS || '512', 10),

  // LLM Settings
  LLM_MAX_TOKENS: parseInt(process.env.LLM_MAX_TOKENS || '1024', 10),
  LLM_TIMEOUT_MS: parseInt(process.env.LLM_TIMEOUT_MS || '30000', 10),

  // Memory Settings
  MEMORY_MATCH_COUNT: parseInt(process.env.MEMORY_MATCH_COUNT || '5', 10),
  MEMORY_MIN_SIMILARITY: parseFloat(process.env.MEMORY_MIN_SIMILARITY || '0.2'),
  MEMORY_CONFLICT_SIMILARITY: parseFloat(process.env.MEMORY_CONFLICT_SIMILARITY || '0.85'),
  MEMORY_DUPLICATE_SIMILARITY: parseFloat(process.env.MEMORY_DUPLICATE_SIMILARITY || '0.95'),

  // Chat Settings
  CHAT_HISTORY_LIMIT: parseInt(process.env.CHAT_HISTORY_LIMIT || '10', 10),
  MAX_MESSAGE_LENGTH: parseInt(process.env.MAX_MESSAGE_LENGTH || '4000', 10),
};
