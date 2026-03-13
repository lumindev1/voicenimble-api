import mongoose, { Document, Schema } from 'mongoose';

export type VoiceGender = 'male' | 'female' | 'neutral';
export type AgentLanguage = string;
export type AgentCallType = 'inbound' | 'outbound';
export type TtsVendor = 'google' | 'elevenlabs';
export type SttVendor = 'google';

export interface IAgent extends Document {
  _id: mongoose.Types.ObjectId;
  shopId: mongoose.Types.ObjectId;
  shopDomain: string;

  // Identity
  agentName: string;
  callType: AgentCallType;
  primaryLanguage: AgentLanguage;
  voiceGender: VoiceGender;
  voiceId: string;
  voiceSpeed: number; // 0.5 - 2.0
  ttsVendor: TtsVendor;
  sttVendor: SttVendor;

  // Phone number
  phoneNumber?: string;
  phoneNumberSid?: string; // VoiceNimble phone number SID
  bringYourOwnNumber: boolean;
  byonPhoneNumber?: string;
  countryCode: string;
  stateCode?: string;

  // Business info
  legalBusinessName: string;
  businessDomain: string;

  // Behavior
  agentRole: string;
  greetingMessage: string;
  goalDescription: string;
  informationToCollect: string[];
  extraInformationToShare: string;
  topicsToAvoid: string[];
  humanHandoffNumber?: string;

  // Status
  isActive: boolean;
  isConfigured: boolean;

  // VoiceNimble
  voiceNimbleApplicationId?: string;
  voiceNimbleCallRoutingRuleId?: string;

  createdAt: Date;
  updatedAt: Date;
}

const agentSchema = new Schema<IAgent>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    shopDomain: { type: String, required: true, index: true },

    agentName: { type: String, default: 'AI Assistant' },
    callType: { type: String, enum: ['inbound', 'outbound'], default: 'inbound' },
    primaryLanguage: { type: String, default: 'en-US' },
    voiceGender: { type: String, enum: ['male', 'female', 'neutral'], default: 'female' },
    voiceId: { type: String, default: 'en-US-Standard-F' },
    voiceSpeed: { type: Number, default: 1.0, min: 0.5, max: 2.0 },
    ttsVendor: { type: String, enum: ['google', 'elevenlabs'], default: 'google' },
    sttVendor: { type: String, enum: ['google'], default: 'google' },

    phoneNumber: { type: String },
    phoneNumberSid: { type: String },
    bringYourOwnNumber: { type: Boolean, default: false },
    byonPhoneNumber: { type: String },
    countryCode: { type: String, default: 'US' },
    stateCode: { type: String },

    legalBusinessName: { type: String, default: '' },
    businessDomain: { type: String, default: '' },

    agentRole: { type: String, default: 'customer support agent' },
    greetingMessage: {
      type: String,
      default: "Hello! Thank you for calling. How can I assist you today?",
    },
    goalDescription: {
      type: String,
      default: 'Help customers with their orders, products, and store policies.',
    },
    informationToCollect: [{ type: String }],
    extraInformationToShare: { type: String, default: '' },
    topicsToAvoid: [{ type: String }],
    humanHandoffNumber: { type: String },

    isActive: { type: Boolean, default: false },
    isConfigured: { type: Boolean, default: false },

    voiceNimbleApplicationId: { type: String },
    voiceNimbleCallRoutingRuleId: { type: String },
  },
  { timestamps: true },
);

agentSchema.index({ shopId: 1, isActive: 1 });

export default mongoose.model<IAgent>('Agent', agentSchema);
