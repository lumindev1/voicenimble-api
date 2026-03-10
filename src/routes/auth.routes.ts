import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

const router = Router();
const controller = new AuthController();

// Shopify OAuth flow
router.get('/install', controller.install);
router.get('/callback', controller.callback);

// Session token exchange (Shopify App Bridge)
router.post('/token', controller.exchangeToken);

// Logout
router.post('/logout', controller.logout);

export default router;
