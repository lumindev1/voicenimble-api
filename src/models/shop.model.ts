import mongoose, { Document, Schema } from 'mongoose';

export interface IShop extends Document {
  _id: mongoose.Types.ObjectId;
  shopDomain: string;
  accessToken: string;
  shopName: string;
  shopEmail: string;
  shopPhone: string;
  shopAddress: {
    address1: string;
    address2: string;
    city: string;
    province: string;
    country: string;
    zip: string;
  };
  currency: string;
  timezone: string;
  planName: string;
  isActive: boolean;
  installedAt: Date;
  uninstalledAt?: Date;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const shopSchema = new Schema<IShop>(
  {
    shopDomain: { type: String, required: true, unique: true, index: true },
    accessToken: { type: String, required: true },
    shopName: { type: String, default: '' },
    shopEmail: { type: String, default: '' },
    shopPhone: { type: String, default: '' },
    shopAddress: {
      address1: { type: String, default: '' },
      address2: { type: String, default: '' },
      city: { type: String, default: '' },
      province: { type: String, default: '' },
      country: { type: String, default: '' },
      zip: { type: String, default: '' },
    },
    currency: { type: String, default: 'USD' },
    timezone: { type: String, default: 'America/New_York' },
    planName: { type: String, default: 'basic' },
    isActive: { type: Boolean, default: true, index: true },
    installedAt: { type: Date, default: Date.now },
    uninstalledAt: { type: Date },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true },
);

export default mongoose.model<IShop>('Shop', shopSchema);
