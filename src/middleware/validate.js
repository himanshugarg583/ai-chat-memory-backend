import { AppError } from '../utils/AppError.js';

/**
 * Generic validation middleware factory using Zod schemas
 * @param {Object} schemas - Object containing body, params, and/or query Zod schemas
 */
export const validate = (schemas) => {
  return (req, res, next) => {
    const errors = {};

    // Validate request body
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        errors.body = result.error.flatten().fieldErrors;
      } else {
        req.body = result.data;
      }
    }

    // Validate URL parameters
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        errors.params = result.error.flatten().fieldErrors;
      } else {
        req.params = result.data;
      }
    }

    // Validate query string
    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        errors.query = result.error.flatten().fieldErrors;
      } else {
        req.query = result.data;
      }
    }

    // If any validation errors, throw
    if (Object.keys(errors).length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Validation failed', errors);
    }

    next();
  };
};
