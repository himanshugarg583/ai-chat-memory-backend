#!/usr/bin/env node
/**
 * Re-embed all memories using the new text format: "key name: content"
 * Run with: npm run reembed
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { config } from '../src/config/env.js';
import { formatMemoryForEmbedding } from '../src/utils/textExpander.js';

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY);
const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const BATCH_SIZE = 20;

async function embedBatch(texts) {
  const response = await openai.embeddings.create({
    model: config.OPENAI_EMBEDDING_MODEL,
    input: texts,
    dimensions: config.EMBEDDING_DIMENSIONS,
  });
  
  const sorted = response.data.sort((a, b) => a.index - b.index);
  return sorted.map(item => item.embedding);
}

async function main() {
  console.log('🔄 Re-embedding all memories with new format...\n');
  console.log(`   Embedding model: ${config.OPENAI_EMBEDDING_MODEL}`);
  console.log(`   Dimensions: ${config.EMBEDDING_DIMENSIONS}`);
  console.log(`   Format: "key name: content"\n`);

  // Fetch all memories
  const { data: memories, error } = await supabase
    .from('memories')
    .select('id, memory_key, content, status')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Failed to fetch memories:', error.message);
    process.exit(1);
  }

  if (!memories || memories.length === 0) {
    console.log('ℹ️  No memories found.');
    return;
  }

  console.log(`📦 Found ${memories.length} memories to re-embed\n`);

  let updated = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < memories.length; i += BATCH_SIZE) {
    const batch = memories.slice(i, i + BATCH_SIZE);
    
    // Format texts for embedding
    const texts = batch.map(m => formatMemoryForEmbedding(m.memory_key, m.content));
    
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(memories.length / BATCH_SIZE)}...`);

    try {
      const embeddings = await embedBatch(texts);

      // Update each memory with new embedding
      for (let j = 0; j < batch.length; j++) {
        const memory = batch[j];
        const embedding = embeddings[j];

        const { error: updateError } = await supabase
          .from('memories')
          .update({ embedding })
          .eq('id', memory.id);

        if (updateError) {
          console.error(`  ❌ Failed to update ${memory.memory_key}: ${updateError.message}`);
          failed++;
        } else {
          console.log(`  ✅ ${memory.memory_key}: "${memory.content.substring(0, 50)}..."`);
          updated++;
        }
      }
    } catch (err) {
      console.error(`  ❌ Batch embedding failed: ${err.message}`);
      failed += batch.length;
    }

    // Rate limiting - wait between batches
    if (i + BATCH_SIZE < memories.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📦 Total: ${memories.length}`);
  console.log('\n✨ Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
