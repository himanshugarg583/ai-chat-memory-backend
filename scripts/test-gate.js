/**
 * Unit-test style script for the memory gate.
 * Run with: npm run test:gate
 */

import { shouldExtractMemory } from '../src/services/memoryGate.js';

const testCases = [
  { input: 'What is PostgreSQL?', expectedGate: false },
  { input: 'hii', expectedGate: false },
  { input: 'My name is Rahul', expectedGate: true },
  { input: 'Actually, I mostly work with Python now', expectedGate: true },
  { input: 'What is the main difference between SQL and NoSQL?', expectedGate: false },
  { input: 'Mera naam Rahul hai', expectedGate: true },
];

console.log('Memory Gate Test Results\n========================\n');

let passed = 0;
let failed = 0;

for (const { input, expectedGate } of testCases) {
  const result = shouldExtractMemory(input);
  const match = result === expectedGate;
  const status = match ? '✓ PASS' : '✗ FAIL';
  
  if (match) {
    passed++;
  } else {
    failed++;
  }
  
  console.log(`${status}: "${input}"`);
  console.log(`  Expected: ${expectedGate}, Got: ${result}`);
  console.log();
}

console.log('========================');
console.log(`Results: ${passed} passed, ${failed} failed`);

process.exit(failed > 0 ? 1 : 0);
