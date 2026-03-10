import mongoose, { Document, Schema } from 'mongoose';

export type TriggerEvent =
  | 'order_placed'
  | 'order_fulfilled'
  | 'order_cancelled'
  | 'payment_received'
  | 'custom_webhook';

export interface IEventDriven extends Document {
  _id: mongoose.Types.ObjectId;
  shopId: mongoose.Types.ObjectId;
  shopDomain: string;
  name: string;
  triggerEvent: TriggerEvent;
  templateId: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  fromNumber?: string;
  isActive: boolean;
  callCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const eventDrivenSchema = new Schema<IEventDriven>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    shopDomain: { type: String, required: true },
    name: { type: String, required: true },
    triggerEvent: {
      type: String,
      enum: ['order_placed', 'order_fulfilled', 'order_cancelled', 'payment_received', 'custom_webhook'],
      required: true,
    },
    templateId: { type: Schema.Types.ObjectId, ref: 'CallTemplate', required: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent' },
    fromNumber: { type: String },
    isActive: { type: Boolean, default: true },
    callCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

eventDrivenSchema.index({ shopId: 1, triggerEvent: 1 });

export default mongoose.model<IEventDriven>('EventDriven', eventDrivenSchema);
