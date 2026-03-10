import mongoose, { Document, Schema } from 'mongoose';

export type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'no-answer'
  | 'busy'
  | 'transferred';

export type CallSentiment = 'positive' | 'neutral' | 'negative' | 'unknown';
export type CallDirection = 'inbound' | 'outbound';

export interface ICall extends Document {
  _id: mongoose.Types.ObjectId;
  shopId: mongoose.Types.ObjectId;
  shopDomain: string;
  agentId: mongoose.Types.ObjectId;

  // Call details
  callSid: string; // Jambonz call SID
  direction: CallDirection;
  status: CallStatus;
  callerNumber: string;
  calledNumber: string;
  duration: number; // seconds
  startedAt?: Date;
  endedAt?: Date;
  answeredAt?: Date;

  // Recording
  hasRecording: boolean;
  recordingUrl?: string;
  recordingDuration?: number;
  recordingSid?: string;

  // Transcript
  hasTranscript: boolean;
  transcriptId?: mongoose.Types.ObjectId;

  // Transfer
  wasTransferred: boolean;
  transferredTo?: string;
  transferredAt?: Date;

  // AI metadata
  sentiment: CallSentiment;
  intentDetected?: string;
  resolutionStatus?: 'resolved' | 'unresolved' | 'transferred' | 'escalated';

  // Cost
  minutesBilled: number;

  // Raw Jambonz data
  jambonzData?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

const callSchema = new Schema<ICall>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    shopDomain: { type: String, required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true },

    callSid: { type: String, required: true, unique: true },
    direction: { type: String, enum: ['inbound', 'outbound'], default: 'inbound' },
    status: {
      type: String,
      enum: ['initiated', 'ringing', 'in-progress', 'completed', 'failed', 'no-answer', 'busy', 'transferred'],
      default: 'initiated',
      index: true,
    },
    callerNumber: { type: String, default: '' },
    calledNumber: { type: String, default: '' },
    duration: { type: Number, default: 0 },
    startedAt: { type: Date },
    endedAt: { type: Date },
    answeredAt: { type: Date },

    hasRecording: { type: Boolean, default: false },
    recordingUrl: { type: String },
    recordingDuration: { type: Number },
    recordingSid: { type: String },

    hasTranscript: { type: Boolean, default: false },
    transcriptId: { type: Schema.Types.ObjectId, ref: 'CallTranscript' },

    wasTransferred: { type: Boolean, default: false },
    transferredTo: { type: String },
    transferredAt: { type: Date },

    sentiment: { type: String, enum: ['positive', 'neutral', 'negative', 'unknown'], default: 'unknown' },
    intentDetected: { type: String },
    resolutionStatus: {
      type: String,
      enum: ['resolved', 'unresolved', 'transferred', 'escalated'],
    },

    minutesBilled: { type: Number, default: 0 },
    jambonzData: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

callSchema.index({ shopId: 1, createdAt: -1 });
callSchema.index({ shopId: 1, status: 1 });
callSchema.index({ callSid: 1 });

export default mongoose.model<ICall>('Call', callSchema);
