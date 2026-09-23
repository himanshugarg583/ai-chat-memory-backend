import { z } from 'zod';

export const createMemorySchema = z.object({
  content: z.string().trim().min(1, 'Content is required'),
  category: z.string().trim().optional().default('general'),
  memoryKey: z.string().trim().optional(),
  replaceMemoryId: z.string().uuid().optional(),
});

export const updateMemorySchema = z
  .object({
    content: z.string().trim().min(1).optional(),
    category: z.string().trim().optional(),
  })
  .refine((data) => data.content || data.category, {
    message: 'At least one of content or category must be provided',
  });

export const memoryIdParamSchema = z.object({
  id: z.string().uuid('Invalid memory ID format'),
});

export const memoryQuerySchema = z.object({
  status: z.enum(['active', 'all']).optional().default('active'),
});
