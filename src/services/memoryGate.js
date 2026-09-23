/**
 * Memory gate - pure function to determine if a message likely contains
 * personal/long-term information worth saving as a memory.
 * 
 * This is a heuristic check that avoids unnecessary LLM calls.
 * Case-insensitive word-boundary matching.
 */

// Keywords that suggest personal/memorable content
const PERSONAL_KEYWORDS = [
  'i', "i'm", 'im', "i've", 'ive', "i'd", 'my', 'me', 'mine',
  'we', "we're", 'our', 'us', 'myself',
  "name's",
  'remember',
  'actually', 'now', 'currently',
  'migrated', 'switched', 'prefer',
  // Hindi keywords for personal references
  'mera', 'meri', 'mujhe', 'main'
];

// Build regex pattern for word-boundary matching
const keywordPattern = new RegExp(
  '\\b(' + PERSONAL_KEYWORDS.map(k => k.replace(/'/g, "'?")).join('|') + ')\\b',
  'i'
);

/**
 * Determine if a message should trigger memory extraction
 * @param {string} message - The user's message
 * @returns {boolean} - True if the message likely contains personal info
 */
export const shouldExtractMemory = (message) => {
  if (!message || typeof message !== 'string') {
    return false;
  }

  const normalized = message.trim();
  if (!normalized) {
    return false;
  }

  // Check for personal keyword matches
  return keywordPattern.test(normalized);
};

// Export for testing
export const _testExports = {
  PERSONAL_KEYWORDS,
  keywordPattern,
};
