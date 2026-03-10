import { Router } from 'express';
import { BillingController } from '../controllers/billing.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const controller = new BillingController();

// Public — no auth needed to see plans
router.get('/plans', controller.getPlans);

router.use(authenticate);
router.get('/subscription', controller.getSubscription);
router.post('/subscribe', controller.subscribe);
router.get('/callback', controller.handleBillingCallback);
router.post('/cancel', controller.cancelSubscription);
router.get('/usage', controller.getUsage);

export default router;
