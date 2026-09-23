import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .transform((val) => val.trim().toLowerCase()),
  name: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val === '' ? undefined : val)),
});
