import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { shopify } from '../config/shopify';
import Shop from '../models/shop.model';
import Agent from '../models/agent.model';
import Subscription from '../models/subscription.model';
import NotificationSettings from '../models/notification.model';
import SkillsConfig from '../models/skills-config.model';
import { DEFAULT_SKILLS } from '../models/skills-config.model';
import { PLANS } from '../models/subscription.model';
import { ShopifyService } from './shopify.service';
import logger from '../utils/logger';

export class AuthService {
  async generateAuthUrl(shop: string, req: Request, res: Response): Promise<void> {
    const sanitizedShop = shopify.utils.sanitizeShop(shop, true);
    if (!sanitizedShop) throw new Error('Invalid shop domain');

    await shopify.auth.begin({
      shop: sanitizedShop,
      callbackPath: '/api/auth/callback',
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });
  }

  async handleCallback(
    req: Request,
    res: Response,
  ): Promise<{ shop: string; token: string }> {
    const callbackResponse = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    const { session } = callbackResponse;
    const shopDomain = session.shop;
    const accessToken = session.accessToken!;

    // Upsert shop
    let shop = await Shop.findOne({ shopDomain });
    if (!shop) {
      shop = new Shop({
        shopDomain,
        accessToken,
        isActive: true,
        installedAt: new Date(),
      });
    } else {
      shop.accessToken = accessToken;
      shop.isActive = true;
      shop.uninstalledAt = undefined;
    }
    await shop.save();

    // Initialize related documents for new shops
    await this.initializeShopDefaults(shop._id.toString(), shopDomain);

    // Sync shop data from Shopify
    try {
      const shopifyService = new ShopifyService(shopDomain, accessToken);
      await shopifyService.syncShopData(shop._id.toString());
    } catch (err) {
      logger.warn('Failed to sync shop data on install:', err);
    }

    // Register webhooks
    try {
      await this.registerWebhooks(shopDomain, accessToken);
    } catch (err) {
      logger.warn('Failed to register webhooks on install:', err);
    }

    const token = this.generateJwt(shopDomain, shop._id.toString());
    return { shop: shopDomain, token };
  }

  async exchangeSessionToken(sessionToken: string, shopDomain: string): Promise<string> {
    // Verify Shopify session token (App Bridge 2.x)
    const decoded = jwt.decode(sessionToken) as { dest?: string; sub?: string } | null;
    if (!decoded?.dest) throw new Error('Invalid session token');

    const shop = await Shop.findOne({ shopDomain });
    if (!shop || !shop.isActive) throw new Error('Shop not found');

    return this.generateJwt(shopDomain, shop._id.toString());
  }

  private generateJwt(shopDomain: string, shopId: string): string {
    return jwt.sign(
      { shopDomain, shopId },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' },
    );
  }

  private async initializeShopDefaults(shopId: string, shopDomain: string): Promise<void> {
    // Create agent if not exists
    const existingAgent = await Agent.findOne({ shopId });
    if (!existingAgent) {
      await Agent.create({ shopId, shopDomain });
    }

    // Create subscription if not exists
    const existingSubscription = await Subscription.findOne({ shopDomain });
    if (!existingSubscription) {
      const plan = PLANS.basic;
      await Subscription.create({
        shopId,
        shopDomain,
        planName: 'basic',
        status: 'pending',
        minutesIncluded: plan.includedMinutes,
        simultaneousCalls: plan.simultaneousCalls,
        overageRatePerMinute: plan.overageRatePerMinute,
        hasAdvancedAnalytics: plan.hasAdvancedAnalytics,
        hasCallRecording: plan.hasCallRecording,
        recordingRetentionDays: plan.recordingRetentionDays,
      });
    }

    // Create notification settings if not exists
    const existingNotifications = await NotificationSettings.findOne({ shopDomain });
    if (!existingNotifications) {
      await NotificationSettings.create({ shopId, shopDomain });
    }

    // Create skills config if not exists
    const existingSkills = await SkillsConfig.findOne({ shopDomain });
    if (!existingSkills) {
      await SkillsConfig.create({ shopId, shopDomain, skills: DEFAULT_SKILLS });
    }
  }

  private async registerWebhooks(shop: string, accessToken: string): Promise<void> {
    const webhookTopics = [
      'APP_UNINSTALLED',
      'SHOP_UPDATE',
      'ORDERS_CREATE',
      'ORDERS_UPDATED',
      'PRODUCTS_UPDATE',
    ];

    const baseUrl = process.env.APP_URL;

    for (const topic of webhookTopics) {
      try {
        const client = new shopify.clients.Graphql({ session: { shop, accessToken } as any });
        await client.request(`
          mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
            webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
              userErrors { field message }
              webhookSubscription { id }
            }
          }
        `, {
          variables: {
            topic,
            webhookSubscription: {
              callbackUrl: `${baseUrl}/webhooks/${topic.toLowerCase().replace(/_/g, '-')}`,
              format: 'JSON',
            },
          },
        });
      } catch (err) {
        logger.warn(`Failed to register webhook for ${topic}:`, err);
      }
    }
  }
}
