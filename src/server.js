import app from './app.js';
import { config } from './config/env.js';

const PORT = config.PORT;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`Chat model: ${config.OPENAI_CHAT_MODEL}`);
  console.log(`Embedding model: ${config.OPENAI_EMBEDDING_MODEL}`);
});
