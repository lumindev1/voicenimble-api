import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const controller = new NotificationController();

router.use(authenticate);

router.get('/', controller.getSettings);
router.put('/', controller.updateSettings);
router.post('/send-verification', controller.sendVerification);
router.get('/verify-email', controller.verifyEmail);

export default router;
