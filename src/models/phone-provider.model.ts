import mongoose, { Schema, Document } from 'mongoose';

export interface IPhoneProvider extends Document {
  shopId: mongoose.Types.ObjectId;
  shopDomain: string;
  provider: 'twilio' | 'telnyx' | 'vonage';
  accountSid: string;
  authToken: string;
  isConnected: boolean;
  connectedAt?: Date;
  phoneNumbers: Array<{
    number: string;
    sid: string;
    friendlyName: string;
    isDefault: boolean;
    capabilities: {
      voice: boolean;
      sms: boolean;
    };
    purchasedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const phoneProviderSchema = new Schema<IPhoneProvider>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    shopDomain: { type: String, required: true },
    provider: { type: String, enum: ['twilio', 'telnyx', 'vonage'], required: true },
    accountSid: { type: String, required: true },
    authToken: { type: String, required: true },
    isConnected: { type: Boolean, default: false },
    connectedAt: { type: Date },
    phoneNumbers: [
      {
        number: { type: String, required: true },
        sid: { type: String, required: true },
        friendlyName: { type: String, default: '' },
        isDefault: { type: Boolean, default: false },
        capabilities: {
          voice: { type: Boolean, default: true },
          sms: { type: Boolean, default: false },
        },
        purchasedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

phoneProviderSchema.index({ shopId: 1, provider: 1 }, { unique: true });

export default mongoose.model<IPhoneProvider>('PhoneProvider', phoneProviderSchema);
