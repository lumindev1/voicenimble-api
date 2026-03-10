import mongoose, { Document, Schema } from 'mongoose';

export interface IDailyAnalytics extends Document {
  _id: mongoose.Types.ObjectId;
  shopId: mongoose.Types.ObjectId;
  shopDomain: string;
  date: string; // YYYY-MM-DD

  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  transferredCalls: number;

  totalDuration: number; // seconds
  averageDuration: number; // seconds

  positiveSentiment: number;
  neutralSentiment: number;
  negativeSentiment: number;

  resolvedCalls: number;
  unresolvedCalls: number;

  minutesBilled: number;
  totalCost: number;

  topIntents: Array<{ intent: string; count: number }>;

  createdAt: Date;
  updatedAt: Date;
}

const dailyAnalyticsSchema = new Schema<IDailyAnalytics>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    shopDomain: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },

    totalCalls: { type: Number, default: 0 },
    completedCalls: { type: Number, default: 0 },
    failedCalls: { type: Number, default: 0 },
    transferredCalls: { type: Number, default: 0 },

    totalDuration: { type: Number, default: 0 },
    averageDuration: { type: Number, default: 0 },

    positiveSentiment: { type: Number, default: 0 },
    neutralSentiment: { type: Number, default: 0 },
    negativeSentiment: { type: Number, default: 0 },

    resolvedCalls: { type: Number, default: 0 },
    unresolvedCalls: { type: Number, default: 0 },

    minutesBilled: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },

    topIntents: [
      {
        intent: { type: String },
        count: { type: Number, default: 0 },
        _id: false,
      },
    ],
  },
  { timestamps: true },
);

dailyAnalyticsSchema.index({ shopId: 1, date: 1 }, { unique: true });

export default mongoose.model<IDailyAnalytics>('Analytics', dailyAnalyticsSchema);
