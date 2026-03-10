import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const controller = new AnalyticsController();

router.use(authenticate);

router.get('/dashboard', controller.getDashboard);
router.get('/daily', controller.getDailyStats);
router.get('/weekly', controller.getWeeklyReport);
router.get('/monthly', controller.getMonthlyReport);

export default router;
