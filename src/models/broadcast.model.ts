import mongoose, { Document, Schema } from 'mongoose';

export type BroadcastStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface IBroadcast extends Document {
  _id: mongoose.Types.ObjectId;
  shopId: mongoose.Types.ObjectId;
  shopDomain: string;
  title: string;
  templateId: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  contactIds: mongoose.Types.ObjectId[];
  tags: string[];           // filter contacts by tags
  scheduledAt?: Date;
  timezone: string;
  status: BroadcastStatus;
  totalContacts: number;
  calledCount: number;
  successCount: number;
  failedCount: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const broadcastSchema = new Schema<IBroadcast>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    shopDomain: { type: String, required: true },
    title: { type: String, required: true },
    templateId: { type: Schema.Types.ObjectId, ref: 'CallTemplate', required: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent' },
    contactIds: [{ type: Schema.Types.ObjectId, ref: 'Contact' }],
    tags: [{ type: String }],
    scheduledAt: { type: Date },
    timezone: { type: String, default: 'UTC' },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
      default: 'pending',
    },
    totalContacts: { type: Number, default: 0 },
    calledCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

broadcastSchema.index({ shopId: 1, createdAt: -1 });
broadcastSchema.index({ shopId: 1, status: 1 });

export default mongoose.model<IBroadcast>('Broadcast', broadcastSchema);
