import { AppError } from '../utils/AppError.js';
import { config } from '../config/env.js';

/**
 * Central error handler middleware
 */
export const errorHandler = (err, req, res, next) => {
  // Log the error server-side (but never expose stack traces to clients)
  if (config.NODE_ENV === 'development') {
    console.error('Error:', err);
  } else {
    console.error('Error:', err.message);
  }

  // Handle known operational errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Handle JSON parse errors (malformed request body)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid JSON in request body',
      },
    });
  }

  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.flatten().fieldErrors,
      },
    });
  }

  // Unknown error - don't leak details
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
};
