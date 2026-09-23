import { z } from 'zod';
import { config } from '../config/env.js';

export const chatMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(config.MAX_MESSAGE_LENGTH, `Message cannot exceed ${config.MAX_MESSAGE_LENGTH} characters`),
});
