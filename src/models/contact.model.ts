import mongoose, { Document, Schema } from 'mongoose';

export interface IContact extends Document {
  _id: mongoose.Types.ObjectId;
  shopId: mongoose.Types.ObjectId;
  shopDomain: string;
  name: string;
  phone: string;
  email?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const contactSchema = new Schema<IContact>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    shopDomain: { type: String, required: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String },
    tags: [{ type: String }],
  },
  { timestamps: true },
);

contactSchema.index({ shopId: 1, createdAt: -1 });
contactSchema.index({ shopId: 1, phone: 1 });

export default mongoose.model<IContact>('Contact', contactSchema);
