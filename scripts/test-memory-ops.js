/**
 * Test script for memory.service.processMemoryOps
 * Runs processMemoryOps logic inline without network/Supabase
 */

// Set env vars before any imports
process.env.SUPABASE_URL = 'https://dummy.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'dummy-secret-key';
process.env.OPENAI_API_KEY = 'sk-dummy-key';
process.env.NODE_ENV = 'test';
process.env.LLM_TEMPERATURE = '0.4';

import { z } from 'zod';

// Track embedding calls
let embeddingCallCount = 0;

// In-memory storage
let memories = [];
let nextId = 1;

// Config mock
const config = {
  MEMORY_DUPLICATE_SIMILARITY: 0.95,
};

// Deterministic fake embedding based on content (ignores key prefix for semantic similarity)
const fakeEmbedding = (text) => {
  // Extract content after "key: " to simulate semantic similarity on content only
  const content = text.includes(': ') ? text.split(': ').slice(1).join(': ') : text;
  // Create embedding using character positions to ensure very different strings are dissimilar
  const vec = new Array(512).fill(0);
  for (let i = 0; i < content.length && i < 512; i++) {
    vec[i] = content.charCodeAt(i) / 255;
  }
  // Normalize
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map(v => v / norm);
};

// Mock embedBatch
const embedBatch = async (texts) => {
  embeddingCallCount++;
  return texts.map(fakeEmbedding);
};

// Mock formatMemoryForEmbedding
const formatMemoryForEmbedding = (key, content) => `${key}: ${content}`;

// Mock cosineSimilarity
const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
};

// Mock memoryRepository
const memoryRepository = {
  async getActiveWithEmbeddings(userId) {
    return memories
      .filter((m) => m.user_id === userId && m.status === 'active')
      .map((m) => ({
        id: m.id,
        memory_key: m.memory_key,
        content: m.content,
        category: m.category,
        embedding: m.embedding,
      }));
  },

  async upsertMemory(userId, memoryKey, content, category, embedding, source, sourceMessageId) {
    const existingIdx = memories.findIndex(
      (m) => m.user_id === userId && m.memory_key === memoryKey && m.status === 'active'
    );

    if (existingIdx !== -1) {
      memories[existingIdx].status = 'superseded';
      memories[existingIdx].updated_at = new Date().toISOString();
    }

    const newMemory = {
      id: nextId++,
      user_id: userId,
      memory_key: memoryKey,
      content,
      category,
      embedding,
      source,
      source_message_id: sourceMessageId,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memories.push(newMemory);

    return {
      action: existingIdx !== -1 ? 'updated' : 'created',
      memory_key: memoryKey,
      content,
    };
  },

  async findActiveByUserAndKey(userId, memoryKey) {
    return memories.find(
      (m) => m.user_id === userId && m.memory_key === memoryKey && m.status === 'active'
    ) || null;
  },

  async supersede(id) {
    const mem = memories.find((m) => m.id === id);
    if (mem) {
      mem.status = 'superseded';
      mem.updated_at = new Date().toISOString();
    }
    return mem;
  },
};

// Schema for validating memory operations from LLM
const memoryOpSchema = z.object({
  action: z.enum(['upsert', 'remove']),
  key: z.string().min(1),
  content: z.string().optional(),
  category: z.string().optional().default('general'),
});

const normalizeContent = (content) => content.toLowerCase().trim().replace(/\s+/g, ' ');

// Copy of processMemoryOps with fixes applied (same as in memory.service.js)
const processMemoryOps = async (userId, memoryOps, userMessageId) => {
  const results = [];
  const validOps = [];

  for (const op of memoryOps) {
    const parsed = memoryOpSchema.safeParse(op);
    if (!parsed.success) {
      console.warn('Invalid memory op skipped:', op?.key, parsed.error.issues[0]?.message);
      continue;
    }
    validOps.push(parsed.data);
  }

  if (validOps.length === 0) return results;

  // Bug fix 1: Merge ops with same key before embedding
  const mergedOps = [];
  const opsByKey = new Map();
  for (const op of validOps) {
    const existing = opsByKey.get(op.key);
    if (!existing) {
      opsByKey.set(op.key, op);
      mergedOps.push(op);
    } else {
      if (op.action === 'remove' || existing.action === 'remove') {
        const idx = mergedOps.indexOf(existing);
        mergedOps[idx] = op;
        opsByKey.set(op.key, op);
      } else {
        existing.content = `${existing.content}; ${op.content}`;
      }
    }
  }

  const existingMemories = await memoryRepository.getActiveWithEmbeddings(userId);

  const upsertOps = mergedOps.filter((op) => op.action === 'upsert' && op.content);
  let embeddings = [];
  if (upsertOps.length > 0) {
    const textsForEmbedding = upsertOps.map((op) => formatMemoryForEmbedding(op.key, op.content));
    embeddings = await embedBatch(textsForEmbedding);
  }

  let embeddingIndex = 0;
  for (const op of mergedOps) {
    try {
      if (op.action === 'upsert' && op.content) {
        const embedding = embeddings[embeddingIndex++];
        if (!embedding) continue;

        const existingWithKey = existingMemories.find((m) => m.memory_key === op.key);
        if (existingWithKey) {
          if (normalizeContent(op.content) === normalizeContent(existingWithKey.content)) {
            results.push({ action: 'unchanged', memoryKey: op.key, content: op.content });
            continue;
          }
        }

        let isDuplicate = false;
        for (const existing of existingMemories) {
          if (existing.memory_key === op.key) continue;
          if (!existing.embedding) continue;
          const similarity = cosineSimilarity(embedding, existing.embedding);
          if (similarity >= config.MEMORY_DUPLICATE_SIMILARITY) {
            results.push({
              action: 'skipped_duplicate',
              memoryKey: op.key,
              content: op.content,
              existingKey: existing.memory_key,
            });
            isDuplicate = true;
            break;
          }
        }
        if (isDuplicate) continue;

        const result = await memoryRepository.upsertMemory(
          userId, op.key, op.content, op.category || 'general', embedding, 'auto', userMessageId
        );
        results.push({ action: result.action, memoryKey: result.memory_key, content: result.content });

        // Bug fix 2: Update existingMemories in place
        const existingIdx = existingMemories.findIndex((m) => m.memory_key === op.key);
        if (existingIdx !== -1) existingMemories.splice(existingIdx, 1);
        existingMemories.push({ memory_key: op.key, content: op.content, embedding });

      } else if (op.action === 'remove') {
        const existing = await memoryRepository.findActiveByUserAndKey(userId, op.key);
        if (existing) {
          await memoryRepository.supersede(existing.id);
          results.push({ action: 'removed', memoryKey: op.key, content: existing.content });
          const existingIdx = existingMemories.findIndex((m) => m.memory_key === op.key);
          if (existingIdx !== -1) existingMemories.splice(existingIdx, 1);
        }
      }
    } catch (error) {
      results.push({ action: 'failed', memoryKey: op.key, error: error.message });
    }
  }

  return results;
};

const memoryService = { processMemoryOps };

// Test utilities
const resetState = () => {
  memories = [];
  nextId = 1;
  embeddingCallCount = 0;
};

const getActiveMemories = (userId) => 
  memories.filter((m) => m.user_id === userId && m.status === 'active');

const getSupersededMemories = (userId) =>
  memories.filter((m) => m.user_id === userId && m.status === 'superseded');

// Test cases
const tests = [];
let passCount = 0;
let failCount = 0;

const test = (name, fn) => tests.push({ name, fn });

const assert = (condition, msg) => {
  if (!condition) throw new Error(msg);
};

// Case A: 5 different keys in one batch → 5 created, exactly 1 embedding call
test('A. 5 different keys → 5 created, 1 embedding call', async () => {
  resetState();
  const ops = [
    { action: 'upsert', key: 'name', content: 'John Smith is the username', category: 'personal' },
    { action: 'upsert', key: 'profession', content: 'Works as software engineer at BigCorp', category: 'professional' },
    { action: 'upsert', key: 'location', content: 'Lives in San Francisco California USA', category: 'personal' },
    { action: 'upsert', key: 'company', content: 'Acme Industries manufacturing division', category: 'professional' },
    { action: 'upsert', key: 'primary_language', content: 'JavaScript TypeScript frontend development', category: 'technical' },
  ];

  const results = await memoryService.processMemoryOps('user-1', ops, 'msg-1');
  
  const created = results.filter((r) => r.action === 'created');
  const active = getActiveMemories('user-1');

  assert(created.length === 5, `Expected 5 created, got ${created.length}`);
  assert(active.length === 5, `Expected 5 active memories, got ${active.length}`);
  assert(embeddingCallCount === 1, `Expected 1 embedding call, got ${embeddingCallCount}`);
});

// Case B: Same key twice (Node.js, Python) → 1 merged memory, status "created"
test('B. Same key twice → merged content, 1 active, status created', async () => {
  resetState();
  const ops = [
    { action: 'upsert', key: 'primary_language', content: 'User works with Node.js', category: 'technical' },
    { action: 'upsert', key: 'primary_language', content: 'User works with Python', category: 'technical' },
  ];

  const results = await memoryService.processMemoryOps('user-1', ops, 'msg-1');
  
  const active = getActiveMemories('user-1');
  const superseded = getSupersededMemories('user-1');

  assert(active.length === 1, `Expected 1 active memory, got ${active.length}`);
  assert(superseded.length === 0, `Expected 0 superseded, got ${superseded.length}`);
  assert(active[0].content.includes('Node.js'), 'Content should include Node.js');
  assert(active[0].content.includes('Python'), 'Content should include Python');
  assert(results[0].action === 'created', `Expected status created, got ${results[0].action}`);
});

// Case C: Same content under two different keys → second one skipped_duplicate
test('C. Same content, different keys → second skipped_duplicate', async () => {
  resetState();
  const ops = [
    { action: 'upsert', key: 'primary_db', content: 'User uses PostgreSQL', category: 'technical' },
    { action: 'upsert', key: 'database', content: 'User uses PostgreSQL', category: 'technical' },
  ];

  const results = await memoryService.processMemoryOps('user-1', ops, 'msg-1');
  
  const active = getActiveMemories('user-1');
  const skipped = results.filter((r) => r.action === 'skipped_duplicate');

  assert(active.length === 1, `Expected 1 active memory, got ${active.length}`);
  assert(skipped.length === 1, `Expected 1 skipped_duplicate, got ${skipped.length}`);
});

// Case D: One invalid op mixed with 2 valid ones → 2 created, no crash
test('D. Invalid op mixed with valid → 2 created, no crash', async () => {
  resetState();
  const ops = [
    { action: 'upsert', key: 'name', content: 'Alice Johnson full name registered', category: 'personal' },
    { action: 'invalid_action', key: '', content: null }, // Invalid
    { action: 'upsert', key: 'company', content: 'TechCorp Industries headquarters in Seattle', category: 'professional' },
  ];

  const results = await memoryService.processMemoryOps('user-1', ops, 'msg-1');
  
  const active = getActiveMemories('user-1');
  const created = results.filter((r) => r.action === 'created');

  assert(active.length === 2, `Expected 2 active memories, got ${active.length}`);
  assert(created.length === 2, `Expected 2 created, got ${created.length}`);
});

// Case E: Existing MySQL, batch updates + adds company → MySQL superseded, PostgreSQL active, company created
test('E. Existing memory updated + new memory added', async () => {
  resetState();
  
  // Pre-populate existing memory
  memories.push({
    id: nextId++,
    user_id: 'user-1',
    memory_key: 'primary_database',
    content: 'User uses MySQL',
    category: 'technical',
    embedding: fakeEmbedding('primary_database: User uses MySQL'),
    source: 'auto',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const ops = [
    { action: 'upsert', key: 'primary_database', content: 'User uses PostgreSQL', category: 'technical' },
    { action: 'upsert', key: 'company', content: 'User works at DataCorp', category: 'professional' },
  ];

  const results = await memoryService.processMemoryOps('user-1', ops, 'msg-1');
  
  const active = getActiveMemories('user-1');
  const superseded = getSupersededMemories('user-1');

  const activeDb = active.find((m) => m.memory_key === 'primary_database');
  const activeCompany = active.find((m) => m.memory_key === 'company');
  const supersededDb = superseded.find((m) => m.memory_key === 'primary_database');

  assert(superseded.length === 1, `Expected 1 superseded, got ${superseded.length}`);
  assert(supersededDb?.content === 'User uses MySQL', 'MySQL should be superseded');
  assert(activeDb?.content === 'User uses PostgreSQL', 'PostgreSQL should be active');
  assert(activeCompany?.content === 'User works at DataCorp', 'Company should be created');

  const dbResult = results.find((r) => r.memoryKey === 'primary_database');
  const companyResult = results.find((r) => r.memoryKey === 'company');
  
  assert(dbResult?.action === 'updated', `Expected db status updated, got ${dbResult?.action}`);
  assert(companyResult?.action === 'created', `Expected company status created, got ${companyResult?.action}`);
});

// Run all tests
const runTests = async () => {
  console.log('Running memory ops tests...\n');

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✓ PASS: ${name}`);
      passCount++;
    } catch (error) {
      console.log(`✗ FAIL: ${name}`);
      console.log(`  Error: ${error.message}`);
      failCount++;
    }
  }

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount > 0 ? 1 : 0);
};

runTests();
