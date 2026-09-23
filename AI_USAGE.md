# AI Usage Documentation

This document describes how AI (specifically OpenAI's GPT-4o-mini and text-embedding-3-small) is used in this application.

## Overview

The application uses AI in two ways:
1. **Chat Completion**: Generating conversational responses with optional memory extraction
2. **Text Embeddings**: Converting text to vectors for semantic similarity search

## Chat Completion

### Model: gpt-4o-mini

**Purpose**: Generate helpful responses to user messages while optionally extracting and managing long-term memories.

**Configuration**:
- Temperature: 0.4 (balanced creativity/consistency)
- Response format: JSON mode (`response_format: { type: "json_object" }`)
- Max tokens: 1024 (configurable via `LLM_MAX_TOKENS`)
- Timeout: 30000ms (configurable via `LLM_TIMEOUT_MS`)

### Prompt Structure

The system prompt follows this structure:

```
You are a helpful AI assistant. Be concise, friendly, and helpful.

You respond in JSON format. Always include a "reply" field with your response to the user.

Known facts about the user (use only if relevant, never mention that you have a memory system unless asked):
- [primary_language] User primarily works with JavaScript/TypeScript
- [company] User works at Acme Corp

[If memory gate is true, memory extraction instructions are appended]

Response format (JSON):
{
  "reply": "Your response to the user",
  "memory_ops": [...]
}
```

### Memory Extraction Instructions

When the memory gate triggers (see below), the prompt includes these instructions:

- Save only stable, long-term facts about the user
- Never save questions, one-off tasks, or general knowledge
- Use preferred keys: `name`, `profession`, `primary_language`, `primary_database`, etc.
- Write content in third person
- Return `memory_ops: []` if nothing worth saving

### Memory Operations Format

```json
{
  "action": "upsert" | "remove",
  "key": "primary_database",
  "content": "User primarily works with PostgreSQL",
  "category": "technical"
}
```

## Memory Gate

The memory gate is a **heuristic filter** that determines whether a message might contain personal information worth saving. It runs **before** the LLM call.

### Why It Exists

- Reduces unnecessary token usage by ~60-80%
- Avoids asking the LLM to extract memories from messages like "What's 2+2?"
- Simple regex matching is much faster than LLM inference

### Trigger Keywords

The gate matches on word boundaries (case-insensitive):

**English personal pronouns and phrases**:
- i, i'm, im, i've, ive, i'd
- my, me, mine, myself
- we, we're, our, us
- name's

**Memory-related terms**:
- remember
- actually, now, currently
- migrated, switched, prefer

**Hindi personal pronouns**:
- mera, meri, mujhe, main

### Gate Behavior

| Gate Result | Memory Instructions in Prompt | Memory Processing |
|-------------|-------------------------------|-------------------|
| `true` | Included | Process any `memory_ops` from response |
| `false` | Not included | Skip memory processing |

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
