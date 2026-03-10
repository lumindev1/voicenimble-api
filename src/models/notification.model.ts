import mongoose, { Document, Schema } from 'mongoose';

export interface INotificationSettings extends Document {
  _id: mongoose.Types.ObjectId;
  shopId: mongoose.Types.ObjectId;
  shopDomain: string;

  // Email config
  notificationEmail: string;
  isEmailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;

  // Per-call notifications
  sendPerCallNotification: boolean;

  // Summary reports
  sendDailySummary: boolean;
  dailySummaryTime: string; // HH:MM format

  sendWeeklyReport: boolean;
  weeklyReportDay: number; // 0=Sunday, 1=Monday...

  sendMonthlyReport: boolean;
  monthlyReportDay: number; // 1-28

  // Email template preferences
  includeTranscript: boolean;
  includeRecordingLink: boolean;
  includeSentimentAnalysis: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotificationSettings>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    shopDomain: { type: String, required: true, unique: true },

    notificationEmail: { type: String, default: '' },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String },
    emailVerificationExpires: { type: Date },

    sendPerCallNotification: { type: Boolean, default: true },

    sendDailySummary: { type: Boolean, default: false },
    dailySummaryTime: { type: String, default: '08:00' },

    sendWeeklyReport: { type: Boolean, default: false },
    weeklyReportDay: { type: Number, default: 1, min: 0, max: 6 },

    sendMonthlyReport: { type: Boolean, default: false },
    monthlyReportDay: { type: Number, default: 1, min: 1, max: 28 },

    includeTranscript: { type: Boolean, default: true },
    includeRecordingLink: { type: Boolean, default: false },
    includeSentimentAnalysis: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model<INotificationSettings>('Notification', notificationSchema);
