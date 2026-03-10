import { Router } from 'express';
import { ShopController } from '../controllers/shop.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const controller = new ShopController();

router.use(authenticate);

router.get('/', controller.getShop);
router.get('/sync', controller.syncShopData);
router.get('/products', controller.getProducts);
router.get('/policies', controller.getPolicies);

export default router;
