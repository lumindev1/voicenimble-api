import mongoose, { Document, Schema } from 'mongoose';

export type PlanName = 'basic' | 'advanced' | 'pro';
export type SubscriptionStatus = 'pending' | 'active' | 'declined' | 'expired' | 'frozen' | 'cancelled';

export interface IPlan {
  name: PlanName;
  displayName: string;
  priceMonthly: number;
  includedMinutes: number;
  simultaneousCalls: number;
  overageRatePerMinute: number;
  hasAdvancedAnalytics: boolean;
  hasCallRecording: boolean;
  recordingRetentionDays: number;
  maxRecordingsPerMonth: number;
}

export interface ISubscription extends Document {
  _id: mongoose.Types.ObjectId;
  shopId: mongoose.Types.ObjectId;
  shopDomain: string;

  planName: PlanName;
  status: SubscriptionStatus;

  // Shopify Billing
  shopifyChargeId?: string;
  shopifyChargeStatus?: string;
  confirmationUrl?: string;

  // Usage
  minutesUsed: number;
  minutesIncluded: number;
  overageMinutes: number;
  overageCost: number;

  // Billing cycle
  billingCycleStart?: Date;
  billingCycleEnd?: Date;
  trialEndsAt?: Date;

  // Plan details snapshot
  simultaneousCalls: number;
  overageRatePerMinute: number;
  hasAdvancedAnalytics: boolean;
  hasCallRecording: boolean;
  recordingRetentionDays: number;

  activatedAt?: Date;
  cancelledAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    shopDomain: { type: String, required: true, unique: true, index: true },

    planName: { type: String, enum: ['basic', 'advanced', 'pro'], default: 'basic' },
    status: {
      type: String,
      enum: ['pending', 'active', 'declined', 'expired', 'frozen', 'cancelled'],
      default: 'pending',
    },

    shopifyChargeId: { type: String },
    shopifyChargeStatus: { type: String },
    confirmationUrl: { type: String },

    minutesUsed: { type: Number, default: 0 },
    minutesIncluded: { type: Number, default: 100 },
    overageMinutes: { type: Number, default: 0 },
    overageCost: { type: Number, default: 0 },

    billingCycleStart: { type: Date },
    billingCycleEnd: { type: Date },
    trialEndsAt: { type: Date },

    simultaneousCalls: { type: Number, default: 1 },
    overageRatePerMinute: { type: Number, default: 0.10 },
    hasAdvancedAnalytics: { type: Boolean, default: false },
    hasCallRecording: { type: Boolean, default: false },
    recordingRetentionDays: { type: Number, default: 7 },

    activatedAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { timestamps: true },
);

export const PLANS: Record<PlanName, IPlan> = {
  basic: {
    name: 'basic',
    displayName: 'Basic',
    priceMonthly: 29,
    includedMinutes: 100,
    simultaneousCalls: 1,
    overageRatePerMinute: 0.10,
    hasAdvancedAnalytics: false,
    hasCallRecording: false,
    recordingRetentionDays: 7,
    maxRecordingsPerMonth: 0,
  },
  advanced: {
    name: 'advanced',
    displayName: 'Advanced',
    priceMonthly: 79,
    includedMinutes: 500,
    simultaneousCalls: 3,
    overageRatePerMinute: 0.08,
    hasAdvancedAnalytics: true,
    hasCallRecording: true,
    recordingRetentionDays: 30,
    maxRecordingsPerMonth: 200,
  },
  pro: {
    name: 'pro',
    displayName: 'Pro',
    priceMonthly: 199,
    includedMinutes: 2000,
    simultaneousCalls: 10,
    overageRatePerMinute: 0.05,
    hasAdvancedAnalytics: true,
    hasCallRecording: true,
    recordingRetentionDays: 90,
    maxRecordingsPerMonth: 1000,
  },
};

export default mongoose.model<ISubscription>('Subscription', subscriptionSchema);
