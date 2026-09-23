import { z } from 'zod';

export const startSessionSchema = z.object({
  name: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val === '' ? undefined : val)),
});
