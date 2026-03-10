import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { BillingService } from '../services/billing.service';
import Subscription from '../models/subscription.model';
import { PLANS } from '../models/subscription.model';
import { AppError } from '../middlewares/error.middleware';

const billingService = new BillingService();

export class BillingController {
  async getPlans(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, plans: Object.values(PLANS) });
    } catch (error) {
      next(error);
    }
  }

  async getSubscription(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const subscription = await Subscription.findOne({ shopDomain: req.shopDomain });
      if (!subscription) throw new AppError('Subscription not found', 404);
      res.json({ success: true, subscription });
    } catch (error) {
      next(error);
    }
  }

  async subscribe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { planName } = req.body;
      if (!planName || !PLANS[planName as keyof typeof PLANS]) {
        throw new AppError('Invalid plan name', 400);
      }

      const result = await billingService.createSubscription(
        req.shopDomain!,
        req.accessToken!,
        planName,
      );

      res.json({ success: true, confirmationUrl: result.confirmationUrl });
    } catch (error) {
      next(error);
    }
  }

  async handleBillingCallback(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { charge_id } = req.query;
      if (!charge_id) throw new AppError('Missing charge_id', 400);

      await billingService.activateSubscription(
        req.shopDomain!,
        req.accessToken!,
        String(charge_id),
      );

      res.redirect(`${process.env.APP_URL}/?shop=${req.shopDomain}&billing=success`);
    } catch (error) {
      next(error);
    }
  }

  async cancelSubscription(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await billingService.cancelSubscription(req.shopDomain!, req.accessToken!);
      res.json({ success: true, message: 'Subscription cancelled' });
    } catch (error) {
      next(error);
    }
  }

  async getUsage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const subscription = await Subscription.findOne({ shopDomain: req.shopDomain });
      if (!subscription) throw new AppError('Subscription not found', 404);

      const plan = PLANS[subscription.planName];
      res.json({
        success: true,
        usage: {
          minutesUsed: subscription.minutesUsed,
          minutesIncluded: subscription.minutesIncluded,
          minutesRemaining: Math.max(0, subscription.minutesIncluded - subscription.minutesUsed),
          overageMinutes: subscription.overageMinutes,
          overageCost: subscription.overageCost,
          simultaneousCalls: subscription.simultaneousCalls,
          plan: plan?.displayName,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
