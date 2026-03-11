import { Request, Response, NextFunction } from 'express';
import Shop from '../models/shop.model';
import Agent from '../models/agent.model';
import EventDriven from '../models/event-driven.model';
import { eventDrivenQueue } from '../jobs/queues';
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
      const shopDomain = req.headers['x-shopify-shop-domain'] as string;
      const order = JSON.parse(req.body.toString());

      logger.info(`Order created webhook for ${shopDomain}: order ${order.name}`);

      // Find active event-driven config for order_placed
      const shop = await Shop.findOne({ shopDomain });
      if (!shop) {
        res.status(200).send('OK');
        return;
      }

      const config = await EventDriven.findOne({
        shopId: shop._id,
        triggerEvent: 'order_placed',
        isActive: true,
      });

      if (!config) {
        logger.info(`No active event-driven config for order_placed on ${shopDomain}`);
        res.status(200).send('OK');
        return;
      }

      // Extract customer phone number
      const customerPhone =
        order.phone ||
        order.customer?.phone ||
        order.shipping_address?.phone ||
        order.billing_address?.phone;

      if (!customerPhone) {
        logger.warn(`Order ${order.name}: no customer phone number found, skipping auto-call`);
        res.status(200).send('OK');
        return;
      }

      // Build order context for AI
      const orderContext = {
        orderName: order.name,
        customerName: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim(),
        customerPhone,
        items: (order.line_items || []).map((item: { title: string; quantity: number; price: string }) => ({
          title: item.title,
          quantity: item.quantity,
          price: item.price,
        })),
        totalPrice: order.total_price,
        currency: order.currency,
        shippingAddress: order.shipping_address
          ? `${order.shipping_address.address1 || ''}, ${order.shipping_address.city || ''}`
          : '',
      };

      // Enqueue event-driven call job
      await eventDrivenQueue.add('event-driven-call', {
        shopId: shop._id.toString(),
        shopDomain,
        configId: config._id.toString(),
        agentId: config.agentId?.toString(),
        templateId: config.templateId.toString(),
        fromNumber: config.fromNumber,
        customerPhone,
        eventType: 'order_placed',
        orderContext,
      });

      // Increment call count
      await EventDriven.findByIdAndUpdate(config._id, { $inc: { callCount: 1 } });

      logger.info(`Event-driven call queued for order ${order.name} → ${customerPhone}`);
      res.status(200).send('OK');
    } catch (error) {
      next(error);
    }
  }

  async handleOrderUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopDomain = req.headers['x-shopify-shop-domain'] as string;
      const order = JSON.parse(req.body.toString());

      // Check if order was just fulfilled
      if (order.fulfillment_status !== 'fulfilled') {
        res.status(200).send('OK');
        return;
      }

      const shop = await Shop.findOne({ shopDomain });
      if (!shop) {
        res.status(200).send('OK');
        return;
      }

      const config = await EventDriven.findOne({
        shopId: shop._id,
        triggerEvent: 'order_fulfilled',
        isActive: true,
      });

      if (!config) {
        res.status(200).send('OK');
        return;
      }

      const customerPhone =
        order.phone ||
        order.customer?.phone ||
        order.shipping_address?.phone ||
        order.billing_address?.phone;

      if (!customerPhone) {
        logger.warn(`Order ${order.name} fulfilled: no customer phone, skipping auto-call`);
        res.status(200).send('OK');
        return;
      }

      const orderContext = {
        orderName: order.name,
        customerName: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim(),
        customerPhone,
        items: (order.line_items || []).map((item: { title: string; quantity: number; price: string }) => ({
          title: item.title,
          quantity: item.quantity,
          price: item.price,
        })),
        totalPrice: order.total_price,
        currency: order.currency,
        fulfillmentStatus: 'fulfilled',
      };

      await eventDrivenQueue.add('event-driven-call', {
        shopId: shop._id.toString(),
        shopDomain,
        configId: config._id.toString(),
        agentId: config.agentId?.toString(),
        templateId: config.templateId.toString(),
        fromNumber: config.fromNumber,
        customerPhone,
        eventType: 'order_fulfilled',
        orderContext,
      });

      await EventDriven.findByIdAndUpdate(config._id, { $inc: { callCount: 1 } });
      logger.info(`Event-driven call queued for fulfilled order ${order.name} → ${customerPhone}`);

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
