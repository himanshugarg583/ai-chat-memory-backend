# AI Chat with Memory Management

A Node.js backend for an AI chat application with persistent memory extraction and retrieval using Supabase (PostgreSQL + pgvector) and OpenAI.

## Features

- **Conversational AI**: Chat with GPT-4o-mini with conversation history support
- **Automatic Memory Extraction**: AI detects and saves personal facts during conversation
- **Semantic Memory Retrieval**: Relevant memories are retrieved using vector similarity search
- **Memory Gate**: Heuristic filter to minimize unnecessary LLM calls for memory extraction
- **Manual Memory Management**: CRUD operations for memories with duplicate/conflict detection
- **Session Management**: Users can start new chat sessions while preserving long-term memories

---

## Setup

### Prerequisites
- Node.js 18+
- Supabase account
- OpenAI API key

### 1. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run `database/migrations/001_init.sql`
3. This creates:
   - `users`, `messages`, `memories` tables
   - pgvector extension for embeddings
   - `match_memories` RPC for similarity search
   - `upsert_memory` RPC for atomic memory updates

> **Privacy Note**: All data is stored in Supabase project. User messages and memories contain personal information. Ensure your Supabase project has appropriate access controls. Consider Row Level Security (RLS) for production.

### 2. Environment Configuration

```bash
cd backend
cp .env.example .env
```

Required variables:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-service-role-key  # NOT the anon key
OPENAI_API_KEY=sk-your-openai-key
```

### 3. Install & Run

```bash
npm install
npm run dev   # Development with hot reload
npm start     # Production
```

Server runs at http://localhost:8000

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 18+ (ES Modules) |
| Framework | Express 4.18.2 |
| Database | Supabase PostgreSQL + pgvector |
| LLM | OpenAI gpt-4o-mini |
| Embeddings | OpenAI text-embedding-3-small (512 dims) |
| Validation | Zod 3.22.4 |

### Project Structure

```
backend/
├── src/
│   ├── config/           # Environment & database config
│   ├── controllers/      # HTTP request handlers
│   ├── integrations/     # External API clients (OpenAI)
│   ├── middleware/       # Auth, validation, error handling
│   ├── repositories/     # Database access (queries)
│   ├── services/         # Business logic
│   │   ├── chat.service.js     # Chat orchestration
│   │   ├── memory.service.js   # Memory CRUD + conflicts
│   │   ├── memoryGate.js       # Heuristic filter
│   │   └── promptBuilder.js    # LLM prompt construction
│   ├── validators/       # Zod request schemas
│   ├── app.js            # Express setup
│   └── server.js         # Entry point
└── database/migrations/  # SQL schema
```

### Request Flow

```
Client → Controller → Service → Repository → Database
                  ↘ Integration → OpenAI
```

---

## Memory Design

### How Memories Work

1. **Memory Gate** (heuristic): Checks if user message might contain savable info
2. **LLM Extraction**: If gate passes, LLM prompt includes memory instructions
3. **Vector Storage**: Each memory is embedded (512-dim) and stored with pgvector
4. **Retrieval**: On each message, relevant memories are fetched via cosine similarity

### Similarity Thresholds

| Threshold | Value | Purpose |
|-----------|-------|---------|
| Duplicate | 0.92+ | Reject exact/near-duplicate memories |
| Conflict | 0.82+ | Warn about semantically similar but different memories |
| Retrieval | 0.70+ | Include in context when answering |

### Memory Gate Keywords

The gate triggers on personal pronouns and memory-related terms to avoid unnecessary LLM calls:

- **English**: i, i'm, my, we, our, remember, prefer, switched, migrated, actually, now, currently
- **Hindi**: mera, meri, mujhe

> **Note**: `me` and `main` were removed due to high false-positive rates in English questions.

---

## Cost Optimization

| Strategy | Impact |
|----------|--------|
| Memory Gate | Reduces memory extraction prompts by ~60-80% |
| 512-dim embeddings | 3x cheaper than 1536-dim with similar quality |
| Single LLM call | Chat + memory extraction in one request |
| PostgreSQL similarity | No LLM call for retrieval (vector search only) |
| Keys-only context | Only retrieved memories' content sent to LLM |

### Estimated Costs (per 1000 messages)

- Chat completion (gpt-4o-mini): ~$0.02-0.05
- Embeddings: ~$0.001
- Supabase: Free tier covers most use cases

---

## Trade-offs

| Decision | Benefit | Drawback |
|----------|---------|----------|
| Memory gate heuristic | Fast, cheap filtering | May miss some savable content |
| JSON mode for LLM | Structured output | Slightly higher latency |
| 512-dim embeddings | Lower cost, faster | Slightly less precise than 1536 |
| No RLS by default | Simpler setup | Requires service-role key |
| Single LLM call | Lower latency | Can't retry memory extraction separately |

---

## Conflict & Duplicate Handling

### How It Works

When a new memory is created (via chat extraction or manual entry), the system:

1. **Generates an embedding** for the new memory text (512-dimensional vector)
2. **Searches existing memories** using cosine similarity against all user memories
3. **Applies threshold rules** to determine the action:

```
New Memory: "User works at Microsoft"
          ↓
   Generate Embedding
          ↓
   Compare with existing memories
          ↓
   ┌─────────────────────────────────────┐
   │ Similarity ≥ 0.92 → DUPLICATE       │ → Reject (409 error)
   │ Similarity ≥ 0.82 → CONFLICT        │ → Warn, offer replace option
   │ Similarity < 0.82 → UNIQUE          │ → Save normally
   └─────────────────────────────────────┘
```

### Examples

| Existing Memory | New Memory | Similarity | Action |
|-----------------|------------|------------|--------|
| "User works at Google" | "User works at Google" | ~0.99 | Duplicate - Reject |
| "User works at Google" | "User is employed at Google" | ~0.94 | Duplicate - Reject |
| "User works at Google" | "User works at Microsoft" | ~0.85 | Conflict - Warn |
| "User works at Google" | "User likes pizza" | ~0.30 | Unique - Save |

### Conflict Resolution

When a conflict is detected (0.82-0.92 similarity):

1. **API returns 409** with the conflicting memory details
2. **Frontend shows dialog** asking user to choose:
   - **Keep existing**: Discard the new memory
   - **Replace**: Delete old memory, save new one (via `replaceMemoryId` parameter)
   - **Keep both**: Force save despite similarity warning

### Why These Thresholds?

- **0.92 (Duplicate)**: Catches rephrased duplicates while allowing genuinely different facts
- **0.82 (Conflict)**: Identifies potentially contradictory info (same topic, different values)
- **0.70 (Retrieval)**: Broad enough to find related context without irrelevant noise

---

## Why Embeddings?

### The Problem

Traditional keyword search fails for personal memory retrieval:

| User Query | Stored Memory | Keyword Match? | Semantically Related? |
|------------|---------------|----------------|----------------------|
| "What's my job?" | "User works at Google" | ❌ No | ✅ Yes |
| "favorite food" | "User loves pizza" | ❌ No | ✅ Yes |
| "programming language" | "User prefers Python" | ❌ No | ✅ Yes |

### The Solution: Vector Embeddings

Embeddings convert text into numerical vectors that capture **semantic meaning**:

```
"User works at Google"  →  [0.12, -0.45, 0.78, ...] (512 dimensions)
"What's my job?"        →  [0.15, -0.42, 0.75, ...] (similar direction)
"User likes pizza"      →  [-0.32, 0.61, 0.05, ...] (different direction)
```

Similar meanings = similar vectors = high cosine similarity.

### Why text-embedding-3-small (512 dims)?

| Option | Dimensions | Cost | Quality |
|--------|------------|------|---------|   
| text-embedding-3-large | 3072 | $$$$ | Best |
| text-embedding-3-small (1536) | 1536 | $$ | Great |
| **text-embedding-3-small (512)** | 512 | $ | Good ✓ |
| text-embedding-ada-002 | 1536 | $$ | Legacy |

**We chose 512 dimensions because:**
1. **3x cheaper** than 1536-dim version
2. **Faster** vector operations and smaller storage
3. **Sufficient quality** for personal fact matching (not research papers)
4. **pgvector friendly** - smaller indexes, faster queries

### Alternatives Considered

| Approach | Pros | Cons | Why Not |
|----------|------|------|---------|   
| Keyword search | Fast, simple | Misses synonyms/paraphrases | Poor recall |
| Full-text search | Better than keywords | Still lexical | Same issue |
| LLM for every retrieval | Perfect understanding | Expensive, slow | Cost prohibitive |
| **Embeddings** | Semantic, fast, cheap | Requires vector DB | ✅ Best balance |

---

## Known Limitations

1. **Memory gate is heuristic**: Messages without trigger words (e.g., "Born in Mumbai") won't trigger extraction
2. **Keyword gate trade-off**: Removed `me` and `main` from trigger keywords due to high false-positive rate in English questions (e.g., "What is the main difference..."). This means some Hindi sentences using `main` (meaning "I") won't trigger extraction unless other keywords are present. Run `npm run test:gate` to see current behavior.
3. **No multi-language support**: Gate keywords are English/Hindi only
4. **Conflict detection is similarity-based**: May not catch semantic contradictions
5. **No conversation summarization**: Long conversations increase token usage
6. **Single-user sessions only**: No shared/team memories
7. **No memory expiration**: Old memories persist indefinitely

---

## Manual Test Scenarios

### 1. Basic Chat (No Memory)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start session | Get user ID |
| 2 | Send "What is 2+2?" | Response with answer, no memory changes |
| 3 | Check memories | Empty or unchanged |

### 2. Memory Extraction
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send "I work at Google" | Response acknowledges, memory created |
| 2 | Check memories | See `company: User works at Google` |
| 3 | Send "What company do I work at?" | Response references Google |

### 3. Memory Conflict Detection
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create memory "User prefers React" | Success |
| 2 | Create similar "User likes React framework" | 409 Conflict with existing memory |
| 3 | Replace via `replaceMemoryId` | New memory replaces old |

### 4. Duplicate Prevention
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create memory "User's name is Alice" | Success |
| 2 | Create same memory again | 409 Duplicate error |

### 5. Session Reset
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send messages, verify history | Messages appear |
| 2 | Call `/users/me/new-session` | Get new session ID |
| 3 | Get messages | Empty (new session) |
| 4 | Get memories | Memories persist (not session-scoped) |

### 6. Memory Retrieval
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create memory about Python preference | Success |
| 2 | Ask "What's my favorite language?" | Response mentions Python, shows used memories |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Service health check |
| POST | `/api/users/start-session` | Login / start anonymous session |
| POST | `/api/users/me/new-session` | Reset chat, keep memories |
| GET | `/api/messages` | Get session messages |
| POST | `/api/chat` | Send message |
| GET | `/api/memories` | List memories |
| POST | `/api/memories` | Create memory |
| PUT | `/api/memories/:id` | Update memory |
| DELETE | `/api/memories/:id` | Delete memory |

### Authentication

All endpoints (except health) require `x-user-id` header with the user's UUID.

---