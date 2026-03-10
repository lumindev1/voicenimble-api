import { Request, Response, NextFunction } from 'express';
import Shop from '../models/shop.model';
import Agent from '../models/agent.model';
import { getRedisClient } from '../config/redis';
import logger from '../utils/logger';

export class WebhookController {
  async handleAppUninstalled(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopDomain = req.headers['x-shopify-shop-domain'] as string;
      logger.info(`App uninstalled for: ${shopDomain}`);

      await Shop.findOneAndUpdate(
        { shopDomain },
        { isActive: false, uninstalledAt: new Date() },
      );

      await Agent.findOneAndUpdate({ shopDomain }, { isActive: false });

      // Invalidate shop context cache
      const redis = getRedisClient();
      await redis.del(`shop-context:${shopDomain}`);

      res.status(200).send('OK');
    } catch (error) {
      next(error);
    }
  }

  async handleShopUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopDomain = req.headers['x-shopify-shop-domain'] as string;
      const shopData = JSON.parse(req.body.toString());

      await Shop.findOneAndUpdate(
        { shopDomain },
        {
          shopName: shopData.name,
          shopEmail: shopData.email,
          shopPhone: shopData.phone,
          lastSyncedAt: new Date(),
        },
      );

      // Invalidate shop context cache
      const redis = getRedisClient();
      await redis.del(`shop-context:${shopDomain}`);

      res.status(200).send('OK');
    } catch (error) {
      next(error);
    }
  }

  async handleOrderCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Could trigger notifications or analytics
      res.status(200).send('OK');
    } catch (error) {
      next(error);
    }
  }

  async handleOrderUpdate(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).send('OK');
    } catch (error) {
      next(error);
    }
  }

  async handleProductUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopDomain = req.headers['x-shopify-shop-domain'] as string;
      // Invalidate product cache if any
      const redis = getRedisClient();
      await redis.del(`shop-context:${shopDomain}`);
      res.status(200).send('OK');
    } catch (error) {
      next(error);
    }
  }
}
