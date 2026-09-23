import 'dotenv/config';
import { z } from 'zod';

// Schema for environment validation
const envSchema = z.object({
  // Required
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SECRET_KEY: z.string().min(1, 'SUPABASE_SECRET_KEY is required'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),

  // Optional with defaults
  PORT: z.coerce.number().default(8000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(512),
  LLM_TEMPERATURE: z.coerce.number().default(0.4),
  LLM_MAX_TOKENS: z.coerce.number().default(1024),
  LLM_TIMEOUT_MS: z.coerce.number().default(30000),
  MEMORY_MATCH_COUNT: z.coerce.number().default(5),
  MEMORY_MIN_SIMILARITY: z.coerce.number().default(0.2),
  MEMORY_CONFLICT_SIMILARITY: z.coerce.number().default(0.85),
  MEMORY_DUPLICATE_SIMILARITY: z.coerce.number().default(0.95),
  CHAT_HISTORY_LIMIT: z.coerce.number().default(10),
  MAX_MESSAGE_LENGTH: z.coerce.number().default(4000),
});

// Validate and parse environment variables
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('\n❌ Environment validation failed:\n');
  for (const issue of parsed.error.issues) {
    console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\nPlease check your .env file and ensure all required variables are set.\n');
  process.exit(1);
}

export const config = parsed.data;
