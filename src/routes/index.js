import { Router } from 'express';
import multer from 'multer';
import { healthController } from '../controllers/health.controller.js';
import { userController } from '../controllers/user.controller.js';
import { chatController } from '../controllers/chat.controller.js';
import { memoryController } from '../controllers/memory.controller.js';
import { validate } from '../middleware/validate.js';
import { requireUser } from '../middleware/requireUser.js';
import { startSessionSchema } from '../validators/user.validators.js';
import { chatMessageSchema } from '../validators/chat.validators.js';
import {
  createMemorySchema,
  updateMemorySchema,
  memoryIdParamSchema,
  memoryQuerySchema,
} from '../validators/memory.validators.js';

// Multer config for PDF uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

const router = Router();

// Health check (no auth)
router.get('/health', healthController.healthCheck);

// User routes
router.post(
  '/users/start-session',
  validate({ body: startSessionSchema }),
  userController.startSession
);

router.post(
  '/users/me/new-session',
  requireUser,
  userController.newSession
);

// Chat routes (all require auth)
router.get(
  '/messages',
  requireUser,
  chatController.getMessages
);

router.post(
  '/chat',
  requireUser,
  validate({ body: chatMessageSchema }),
  chatController.sendMessage
);

// Memory routes (all require auth)
router.get(
  '/memories',
  requireUser,
  validate({ query: memoryQuerySchema }),
  memoryController.getMemories
);

router.post(
  '/memories',
  requireUser,
  validate({ body: createMemorySchema }),
  memoryController.createMemory
);

router.put(
  '/memories/:id',
  requireUser,
  validate({ params: memoryIdParamSchema, body: updateMemorySchema }),
  memoryController.updateMemory
);

router.delete(
  '/memories/:id',
  requireUser,
  validate({ params: memoryIdParamSchema }),
  memoryController.deleteMemory
);

// PDF upload route
router.post(
  '/memories/upload-pdf',
  requireUser,
  upload.single('pdf'),
  memoryController.uploadPdf
);

export default router;
