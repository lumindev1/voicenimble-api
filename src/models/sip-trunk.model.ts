import mongoose, { Document, Schema } from 'mongoose';

export interface ISipTrunk extends Document {
  _id: mongoose.Types.ObjectId;
  shopId: mongoose.Types.ObjectId;
  shopDomain: string;

  // Display
  name: string;
  description?: string;

  // SIP Trunk Config
  sipHost: string; // e.g., sip.carrier.com
  sipPort: number; // default 5060
  sipProtocol: 'udp' | 'tcp' | 'tls';
  sipUsername?: string;
  sipPassword?: string;
  sipRealm?: string;

  // Outbound Caller ID
  callerIdNumber: string; // The number shown to recipients
  callerIdName?: string;

  // VoiceNimble references (created via API)
  voiceNimbleCarrierSid?: string;
  voiceNimbleGatewaySid?: string;

  // Status
  isActive: boolean;
  isDefault: boolean; // Default trunk for this shop
  lastTestedAt?: Date;
  testStatus?: 'success' | 'failed' | 'pending';

  createdAt: Date;
  updatedAt: Date;
}

const sipTrunkSchema = new Schema<ISipTrunk>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    shopDomain: { type: String, required: true, index: true },

    name: { type: String, required: true },
    description: { type: String },

    sipHost: { type: String, required: true },
    sipPort: { type: Number, default: 5060 },
    sipProtocol: { type: String, enum: ['udp', 'tcp', 'tls'], default: 'udp' },
    sipUsername: { type: String },
    sipPassword: { type: String },
    sipRealm: { type: String },

    callerIdNumber: { type: String, required: true },
    callerIdName: { type: String },

    voiceNimbleCarrierSid: { type: String },
    voiceNimbleGatewaySid: { type: String },

    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    lastTestedAt: { type: Date },
    testStatus: { type: String, enum: ['success', 'failed', 'pending'] },
  },
  { timestamps: true },
);

sipTrunkSchema.index({ shopId: 1, isDefault: 1 });

export default mongoose.model<ISipTrunk>('SipTrunk', sipTrunkSchema);
