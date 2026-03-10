import mongoose, { Document, Schema } from 'mongoose';

export type TemplateType = 'static' | 'ai';
export type AIContentType = 'text' | 'audio';

export interface ICallTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  shopId: mongoose.Types.ObjectId;
  shopDomain: string;
  name: string;
  type: TemplateType;           // static | ai
  aiContentType?: AIContentType; // text | audio (only for ai)
  text?: string;                 // TTS text or AI prompt
  audioUrl?: string;             // pre-recorded audio URL (static)
  createdAt: Date;
  updatedAt: Date;
}

const callTemplateSchema = new Schema<ICallTemplate>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    shopDomain: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['static', 'ai'], default: 'ai' },
    aiContentType: { type: String, enum: ['text', 'audio'] },
    text: { type: String },
    audioUrl: { type: String },
  },
  { timestamps: true },
);

callTemplateSchema.index({ shopId: 1, createdAt: -1 });

export default mongoose.model<ICallTemplate>('CallTemplate', callTemplateSchema);
