# AI Usage Documentation

This document describes how AI tools were used in building this project, what I designed myself, and decisions made after reviewing AI-generated code.

---

## AI Tools Used

### 1. Code Generation & Architecture

**Tool**: [PLACEHOLDER: e.g., GitHub Copilot / ChatGPT / Claude]

**What it was used for**:
- [PLACEHOLDER: List specific tasks AI helped with, e.g., "Generating initial Express.js boilerplate", "Suggesting database schema", "Writing validation schemas"]
- [PLACEHOLDER: Add more items]

**What I designed/changed myself**:
- [PLACEHOLDER: List architectural decisions you made, e.g., "Memory conflict detection thresholds", "Memory gate heuristics", "Separation of concerns in service layer"]
- [PLACEHOLDER: Add more items]

### 2. Chat Completion (Runtime AI)

**Model**: OpenAI gpt-4o-mini

**Used for**:
- Generating conversational responses
- Extracting memory operations from user messages (when memory gate triggers)

**Configuration chosen by me**:
- Temperature: 0.4 (balanced creativity/consistency)
- JSON response format for structured output
- Max tokens: 1024

**Decisions after reviewing AI behavior**:
- [PLACEHOLDER: e.g., "Tuned memory extraction prompts after AI was saving too many temporary facts", "Added third-person writing requirement after AI used first-person"]
- [PLACEHOLDER: Add more items]

### 3. Text Embeddings (Runtime AI)

**Model**: OpenAI text-embedding-3-small (512 dimensions)

**Used for**:
- Converting memories to vectors for semantic search
- Finding relevant memories when responding to user queries

**My design decisions**:
- Chose 512 dimensions (vs 1536) to reduce costs while maintaining quality
- Set similarity thresholds: 0.92 (duplicate), 0.82 (conflict), 0.7 (retrieval)
- Decided to embed `key:content` format for better semantic matching

---

## What I Designed Myself

1. **Memory Gate Heuristic**: [PLACEHOLDER: Explain your reasoning for the keyword patterns]
2. **Conflict Detection**: [PLACEHOLDER: Explain why you chose those similarity thresholds]
3. **Database Schema**: [PLACEHOLDER: Explain your schema design decisions]
4. **API Structure**: [PLACEHOLDER: Explain your REST API design choices]
5. **[PLACEHOLDER: Add more items you designed]**

---

## Decisions After Reviewing AI-Generated Code

| AI Suggestion | My Decision | Reasoning |
|---------------|-------------|-----------|
| [PLACEHOLDER] | [PLACEHOLDER] | [PLACEHOLDER] |
| [PLACEHOLDER] | [PLACEHOLDER] | [PLACEHOLDER] |
| [PLACEHOLDER] | [PLACEHOLDER] | [PLACEHOLDER] |

---

## Code I Wrote vs AI-Assisted

### Primarily My Code
- [PLACEHOLDER: List files/modules you wrote mostly yourself]

### AI-Assisted Then Modified
- [PLACEHOLDER: List files/modules where AI helped but you made significant changes]

### AI-Generated With Minimal Changes
- [PLACEHOLDER: List files/modules that AI generated and you used mostly as-is]

---

## Lessons Learned

1. [PLACEHOLDER: What did you learn about working with AI tools?]
2. [PLACEHOLDER: What would you do differently next time?]
3. [PLACEHOLDER: Where was AI most/least helpful?]

---

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

**Purpose**: Convert text to 1536-dimensional vectors for semantic similarity search.

**Usage**:
1. **Memory Storage**: Each memory's content is embedded and stored in the `memories` table
2. **Query Embedding**: User messages are embedded for similarity search against stored memories
3. **Duplicate Detection**: New memories are compared against existing ones to detect duplicates

### Configuration

- Dimensions: 1536 (configurable via `EMBEDDING_DIMENSIONS`)
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

## Security Considerations

1. **API Key Protection**: OpenAI key stored in environment variables, never exposed to client
2. **User Isolation**: All memory operations are scoped to the authenticated user
3. **Content Filtering**: Input length limits prevent abuse (default: 4000 chars)
4. **No PII Logging**: Memory content is not logged in production
