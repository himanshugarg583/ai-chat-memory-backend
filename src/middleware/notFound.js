import { AppError } from '../utils/AppError.js';

/**
 * 404 handler for undefined routes
 */
export const notFound = (req, res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
};
