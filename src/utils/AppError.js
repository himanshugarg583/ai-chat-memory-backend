/**
 * Custom error class for API errors
 */
export class AppError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

// Common error factory functions
export const errors = {
  validation: (message, details) => 
    new AppError(400, 'VALIDATION_ERROR', message, details),
  
  unauthorized: (message = 'Unauthorized') => 
    new AppError(401, 'UNAUTHORIZED', message),
  
  notFound: (resource = 'Resource') => 
    new AppError(404, 'NOT_FOUND', `${resource} not found`),
  
  duplicateMemory: (existingMemory) => 
    new AppError(409, 'DUPLICATE_MEMORY', 'A similar memory already exists', { existingMemory }),
  
  memoryConflict: (existingMemory) => 
    new AppError(409, 'MEMORY_CONFLICT', 'A potentially conflicting memory exists', { existingMemory }),
  
  llmUnavailable: (message = 'LLM service unavailable') => 
    new AppError(502, 'LLM_UNAVAILABLE', message),
  
  databaseUnavailable: (message = 'Database service unavailable') => 
    new AppError(503, 'DATABASE_UNAVAILABLE', message),
  
  internal: (message = 'Internal server error') => 
    new AppError(500, 'INTERNAL_ERROR', message),
};
