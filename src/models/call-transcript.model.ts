import mongoose, { Document, Schema } from 'mongoose';

export interface ITranscriptMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  confidence?: number;
}

export interface ICallTranscript extends Document {
  _id: mongoose.Types.ObjectId;
  shopId: mongoose.Types.ObjectId;
  callId: mongoose.Types.ObjectId;
  callSid: string;
  messages: ITranscriptMessage[];
  fullText: string;
  summary?: string;
  keyPoints?: string[];
  detectedIntent?: string[];
  customerName?: string;
  orderNumbersMentioned?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const transcriptMessageSchema = new Schema<ITranscriptMessage>(
  {
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    confidence: { type: Number, min: 0, max: 1 },
  },
  { _id: false },
);

const callTranscriptSchema = new Schema<ICallTranscript>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    callId: { type: Schema.Types.ObjectId, ref: 'Call', required: true, index: true },
    callSid: { type: String, required: true, index: true },
    messages: [transcriptMessageSchema],
    fullText: { type: String, default: '' },
    summary: { type: String },
    keyPoints: [{ type: String }],
    detectedIntent: [{ type: String }],
    customerName: { type: String },
    orderNumbersMentioned: [{ type: String }],
  },
  { timestamps: true },
);

export default mongoose.model<ICallTranscript>('CallTranscript', callTranscriptSchema);
