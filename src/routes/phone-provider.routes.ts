import { Router } from 'express';
import { PhoneProviderController } from '../controllers/phone-provider.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const controller = new PhoneProviderController();

router.use(authenticate);

router.get('/', controller.get);
router.post('/connect', controller.connect);
router.delete('/:providerId', controller.disconnect);
router.get('/:providerId/search-numbers', controller.searchNumbers);
router.post('/:providerId/buy-number', controller.buyNumber);
router.post('/:providerId/release-number', controller.releaseNumber);
router.post('/:providerId/set-default', controller.setDefaultNumber);

export default router;
