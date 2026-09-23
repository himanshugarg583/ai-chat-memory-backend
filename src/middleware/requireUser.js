import { z } from 'zod';
import { AppError } from '../utils/AppError.js';
import { userRepository } from '../repositories/user.repository.js';

const uuidSchema = z.string().uuid();

/**
 * Middleware that requires X-User-Id header and loads the user
 */
export const requireUser = async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];

    // Check if header is present
    if (!userId) {
      throw new AppError(401, 'UNAUTHORIZED', 'X-User-Id header is required');
    }

    // Validate UUID format
    const parseResult = uuidSchema.safeParse(userId);
    if (!parseResult.success) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid user ID format');
    }

    // Load user from database
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not found');
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
