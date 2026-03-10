import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';
import { verifyShopifyWebhook } from '../middlewares/shopify-webhook.middleware';

const router = Router();
const controller = new WebhookController();

// All Shopify webhooks go through HMAC verification
router.post('/app-uninstalled', verifyShopifyWebhook, controller.handleAppUninstalled);
router.post('/shop-update', verifyShopifyWebhook, controller.handleShopUpdate);
router.post('/orders-create', verifyShopifyWebhook, controller.handleOrderCreate);
router.post('/orders-updated', verifyShopifyWebhook, controller.handleOrderUpdate);
router.post('/products-update', verifyShopifyWebhook, controller.handleProductUpdate);

export default router;
