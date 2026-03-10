import axios from 'axios';
import Subscription from '../models/subscription.model';
import { PLANS, PlanName } from '../models/subscription.model';
import Shop from '../models/shop.model';
import logger from '../utils/logger';

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

export class BillingService {
  async createSubscription(
    shopDomain: string,
    accessToken: string,
    planName: string,
  ): Promise<{ confirmationUrl: string; chargeId: string }> {
    const plan = PLANS[planName as PlanName];
    if (!plan) throw new Error(`Invalid plan: ${planName}`);

    const returnUrl = `${process.env.APP_URL}/api/billing/callback?shop=${shopDomain}`;

    const body = {
      recurring_application_charge: {
        name: `Voice Nimble ${plan.displayName}`,
        price: plan.priceMonthly,
        return_url: returnUrl,
        trial_days: 7,
        test: process.env.NODE_ENV !== 'production',
      },
    };

    const res = await axios.post(
      `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/recurring_application_charges.json`,
      body,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      },
    );

    const charge = res.data.recurring_application_charge;

    // Store pending subscription
    await Subscription.findOneAndUpdate(
      { shopDomain },
      {
        planName: planName as PlanName,
        status: 'pending',
        shopifyChargeId: String(charge.id),
        shopifyChargeStatus: charge.status,
        confirmationUrl: charge.confirmation_url,
        minutesIncluded: plan.includedMinutes,
        simultaneousCalls: plan.simultaneousCalls,
        overageRatePerMinute: plan.overageRatePerMinute,
        hasAdvancedAnalytics: plan.hasAdvancedAnalytics,
        hasCallRecording: plan.hasCallRecording,
        recordingRetentionDays: plan.recordingRetentionDays,
      },
      { upsert: true, new: true },
    );

    return { confirmationUrl: charge.confirmation_url, chargeId: String(charge.id) };
  }

  async activateSubscription(
    shopDomain: string,
    accessToken: string,
    chargeId: string,
  ): Promise<void> {
    // Verify charge with Shopify
    const res = await axios.get(
      `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/recurring_application_charges/${chargeId}.json`,
      {
        headers: { 'X-Shopify-Access-Token': accessToken },
      },
    );

    const charge = res.data.recurring_application_charge;
    logger.info(`Billing callback for ${shopDomain}: charge status = ${charge.status}`);

    if (charge.status === 'accepted') {
      // Activate the charge
      await axios.post(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/recurring_application_charges/${chargeId}/activate.json`,
        {},
        { headers: { 'X-Shopify-Access-Token': accessToken } },
      );

      const now = new Date();
      const cycleEnd = new Date(now);
      cycleEnd.setDate(cycleEnd.getDate() + 30);

      await Subscription.findOneAndUpdate(
        { shopDomain },
        {
          status: 'active',
          shopifyChargeStatus: 'active',
          activatedAt: now,
          billingCycleStart: now,
          billingCycleEnd: cycleEnd,
          minutesUsed: 0,
          overageMinutes: 0,
          overageCost: 0,
        },
      );

      // Update shop plan
      const subscription = await Subscription.findOne({ shopDomain });
      if (subscription) {
        await Shop.findOneAndUpdate({ shopDomain }, { planName: subscription.planName });
      }
    } else if (charge.status === 'declined') {
      await Subscription.findOneAndUpdate({ shopDomain }, { status: 'declined' });
    }
  }

  async cancelSubscription(shopDomain: string, accessToken: string): Promise<void> {
    const subscription = await Subscription.findOne({ shopDomain });
    if (!subscription || !subscription.shopifyChargeId) return;

    try {
      await axios.delete(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/recurring_application_charges/${subscription.shopifyChargeId}.json`,
        { headers: { 'X-Shopify-Access-Token': accessToken } },
      );
    } catch (err) {
      logger.warn('Failed to cancel Shopify charge:', err);
    }

    await Subscription.findOneAndUpdate(
      { shopDomain },
      { status: 'cancelled', cancelledAt: new Date() },
    );
  }

  async checkAndBillOverage(shopDomain: string): Promise<void> {
    const subscription = await Subscription.findOne({ shopDomain, status: 'active' });
    if (!subscription) return;

    const overageMinutes = Math.max(
      0,
      subscription.minutesUsed - subscription.minutesIncluded,
    );

    if (overageMinutes > 0) {
      const overageCost = overageMinutes * subscription.overageRatePerMinute;
      await Subscription.findOneAndUpdate(
        { shopDomain },
        { overageMinutes, overageCost },
      );
    }
  }
}
