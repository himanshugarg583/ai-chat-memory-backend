# AI Chat with Memory Management

A Node.js backend for an AI chat application with persistent memory extraction and retrieval using Supabase (PostgreSQL + pgvector) and OpenAI.

## Features

- **Conversational AI**: Chat with GPT-4o-mini with conversation history support
- **Automatic Memory Extraction**: AI detects and saves personal facts during conversation
- **Semantic Memory Retrieval**: Relevant memories are retrieved using vector similarity search
- **Memory Gate**: Heuristic filter to minimize unnecessary LLM calls for memory extraction
- **Manual Memory Management**: CRUD operations for memories with duplicate/conflict detection
- **Session Management**: Users can start new chat sessions while preserving long-term memories

## Tech Stack

- Node.js 18+ (ES Modules)
- Express 4.18.2
- @supabase/supabase-js 2.39.0
- OpenAI SDK 4.24.0 (gpt-4o-mini + text-embedding-3-small)
- Zod 3.22.4 (validation)
- PostgreSQL with pgvector extension (via Supabase)

## Project Structure

```
backend/
├── public/
│   └── index.html          # Test UI
├── src/
│   ├── config/
│   │   ├── env.js          # Environment validation
│   │   └── supabase.js     # Database client
│   ├── controllers/        # Request handlers
│   ├── integrations/       # External API clients (LLM, embeddings)
│   ├── middleware/         # Express middleware
│   ├── repositories/       # Database access layer
│   ├── routes/             # API route definitions
│   ├── services/           # Business logic
│   │   ├── chat.service.js    # Chat flow orchestration
│   │   ├── memory.service.js  # Memory CRUD + conflict detection
│   │   ├── memoryGate.js      # Heuristic memory trigger
│   │   └── promptBuilder.js   # LLM prompt construction
│   ├── utils/
│   │   └── AppError.js     # Error handling
│   ├── validators/         # Zod schemas
│   ├── app.js              # Express app setup
│   └── server.js           # Entry point
├── .env.example
└── package.json

database/
└── migrations/
    └── 001_init.sql        # Database schema
```

## Setup

### 1. Database Setup

1. Create a Supabase project at https://supabase.com
2. Run the migration in `database/migrations/001_init.sql` via the SQL Editor
3. This creates:
   - `users` table with session tracking
   - `messages` table for chat history
   - `memories` table with pgvector embeddings
   - `match_memories` RPC function for similarity search
   - `upsert_memory` RPC function for memory updates

### 2. Environment Configuration

```bash
cd backend
cp .env.example .env
```

Fill in your `.env`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-service-role-key
OPENAI_API_KEY=sk-your-openai-key
```

### 3. Install & Run

```bash
npm install
npm run dev   # Development with --watch
npm start     # Production
```

Server runs at http://localhost:3000

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Service health check |
| POST | `/api/users/login` | Login/register by email |
| POST | `/api/users/me/new-session` | Start new chat session |
| GET | `/api/messages` | Get current session messages |
| POST | `/api/chat` | Send message and get response |
| GET | `/api/memories` | List user memories |
| POST | `/api/memories` | Create memory manually |
| PUT | `/api/memories/:id` | Update memory |
| DELETE | `/api/memories/:id` | Delete memory |

### Authentication

Pass `x-user-id` header with the user's UUID for authenticated endpoints.

## Chat Flow

1. Save user message to database
2. Load session conversation history
3. Retrieve relevant memories via vector similarity search
4. Run memory gate (heuristic check for personal content)
5. Build prompt with memories and optional memory extraction instructions
6. Make ONE LLM call (JSON mode, temperature 0.4)
7. Parse response and save assistant message
8. If gate was true, process any `memory_ops` from response
9. Update user message with memory status
10. Return response with any memory changes

## Memory Gate Keywords

The memory gate triggers on personal pronouns and memory-related terms:
- English: i, i'm, im, i've, ive, i'd, my, me, mine, we, we're, our, us, myself, name's, remember, actually, now, currently, migrated, switched, prefer
- Hindi: mera, meri, mujhe, main

## Cost Optimization

- Memory gate reduces LLM calls by ~60-80%
- Batch embedding API calls where possible
- Vector similarity search happens in PostgreSQL (no LLM call)
- Single LLM call per user message (not separate for memory extraction)

## Test UI

Open http://localhost:3000 in your browser for a simple test interface with:
- Chat panel with conversation history
- Memory panel showing stored facts
- Manual memory creation

## License

MIT
