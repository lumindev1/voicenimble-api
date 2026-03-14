import { Router } from 'express';
import { TestCallController } from '../controllers/test-call.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const controller = new TestCallController();

router.use(authenticate);

router.post('/', controller.makeTestCall);
router.post('/event-driven', controller.makeEventDrivenTestCall);
router.get('/from-numbers', controller.getFromNumbers);

export default router;
