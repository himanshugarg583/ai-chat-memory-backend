# AI Usage Documentation

This document describes how AI tools were used in building this project and the design decisions made.

---

## AI Tools Used

### 1. Code Generation & Architecture



**What it was used for**:
- Initial Express.js boilerplate structure
- Zod validation schema patterns
- PostgreSQL migration syntax reference

**My design decisions**:
- Memory gate heuristics and trigger patterns
- Similarity thresholds for duplicate/conflict detection
- Service layer separation and repository pattern
- Error handling strategy with custom AppError class

### 2. Chat Completion (Runtime AI)

**Model**: OpenAI gpt-4o-mini

**Configuration**:
- Temperature: 0.4 (balanced creativity/consistency)
- JSON response format for structured output
- Max tokens: 1024

**Design decisions after testing**:
- Tuned memory extraction prompts to save only stable facts
- Added third-person writing requirement
- Limited extraction to 5 memory ops per message

### 3. Text Embeddings (Runtime AI)

**Model**: OpenAI text-embedding-3-small (512 dimensions)

**Design decisions**:
- 512 dimensions vs 1536 for cost optimization
- Similarity thresholds: 0.92 (duplicate), 0.82 (conflict), 0.7 (retrieval)
- Embed `key:content` format for semantic accuracy

---

## Key Design Decisions

| Area | Decision | Reasoning |
|------|----------|-----------|
| Memory Gate | Regex-based pre-filter | Reduces LLM calls by ~70% |
| Conflict Detection | Cosine similarity + key matching | Catches semantic duplicates |
| Database | Supabase + pgvector | Managed PostgreSQL with vector support |
| API Structure | RESTful with clear resource naming | Standard conventions for maintainability |
| Frontend State | Custom hooks (useChat, useMemories) | Clean separation of concerns |

---

## Code Organization

### Backend
- **Architecture**: Controller → Service → Repository pattern
- **Validation**: Zod schemas with custom validators
- **Error handling**: Centralized middleware with AppError class

### Frontend
- **Structure**: Feature-based folders (chat, memories)
- **State**: Custom hooks for domain logic
- **UI**: Shared components in components/ui/
- **Utilities**: Constants and formatters extracted to lib/

## Technical Details (Runtime AI Usage)

### Memory Gate

The memory gate is a regex-based filter that determines if a message might contain savable information. It runs **before** the LLM call to reduce token usage by ~60-80%.

**Trigger patterns**: Personal pronouns (i, my, me), memory-related terms (remember, prefer, switched), Hindi pronouns (mera, meri, mujhe)

### Memory Extraction Prompt

When the gate triggers, the LLM receives instructions to:
- Save only stable, long-term facts (not questions or tasks)
- Use semantic keys like `primary_language`, `company`, `preference_*`
- Write content in third person
- Return `memory_ops: []` if nothing worth saving

### Response Format

```json
{
  "reply": "Your response to the user",
  "memory_ops": [
    { "action": "upsert", "key": "company", "content": "User works at Acme Corp", "category": "personal" }
  ]
}
```

## Text Embeddings

### Model: text-embedding-3-small

**Purpose**: Convert text to 512-dimensional vectors for semantic similarity search.

**Usage**:
1. **Memory Storage**: Each memory's content is embedded and stored in the `memories` table
2. **Query Embedding**: User messages are embedded for similarity search against stored memories
3. **Duplicate Detection**: New memories are compared against existing ones to detect duplicates

### Configuration

- Dimensions: 512 (configurable via `EMBEDDING_DIMENSIONS`)
- Batch processing: Multiple texts embedded in single API call

### Similarity Thresholds

| Threshold | Config Key | Default | Purpose |
|-----------|------------|---------|---------|
| Match | `MEMORY_MIN_SIMILARITY` | 0.3 | Minimum similarity to retrieve a memory |
| Conflict | `MEMORY_CONFLICT_SIMILARITY` | 0.85 | Similarity that triggers conflict warning |
| Duplicate | `MEMORY_DUPLICATE_SIMILARITY` | 0.95 | Similarity that blocks as exact duplicate |

## Cost Optimization Strategies

### 1. Memory Gate Filtering
Messages without personal indicators skip memory extraction entirely.

### 2. Single LLM Call Architecture
Memory extraction happens in the same call as response generation:
- ❌ Avoided: 2 calls (one for response, one for memory analysis)
- ✅ Implemented: 1 call with combined JSON output

### 3. Batch Embeddings
When processing multiple memory operations, texts are batched into a single embedding API call.

### 4. Database-Side Similarity Search
Vector similarity search uses PostgreSQL's pgvector extension:
```sql
SELECT * FROM memories
WHERE 1 - (embedding <=> query_embedding) > threshold
ORDER BY embedding <=> query_embedding
LIMIT match_count;
```
This runs entirely in the database—no LLM calls needed for retrieval.

### 5. Session-Based History
Only messages from the current session are included in context, reducing token count.

## Error Handling

### LLM Errors

| Error Type | HTTP Status | Behavior |
|------------|-------------|----------|
| Timeout | 503 | Message marked as `failed` |
| Rate limit (429) | 503 | Retry with exponential backoff recommended |
| Server error (5xx) | 503 | Temporary unavailability |

### Embedding Errors

Embedding failures during chat don't block the response—memories are simply not retrieved or stored.

## Monitoring Recommendations

1. **Token Usage**: Track input/output tokens per request
2. **Memory Gate Hit Rate**: Percentage of messages that trigger memory extraction
3. **Memory Match Quality**: Average similarity scores of retrieved memories
4. **Latency**: LLM and embedding response times

