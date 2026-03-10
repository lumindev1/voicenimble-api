import mongoose, { Document, Schema } from 'mongoose';

export interface ISkillConfig {
  skillId: string;
  name: string;
  isEnabled: boolean;
  isDefault: boolean;
  config?: Record<string, unknown>;
}

export interface ISkillsConfig extends Document {
  _id: mongoose.Types.ObjectId;
  shopId: mongoose.Types.ObjectId;
  shopDomain: string;
  skills: ISkillConfig[];
  createdAt: Date;
  updatedAt: Date;
}

const skillConfigSchema = new Schema<ISkillConfig>(
  {
    skillId: { type: String, required: true },
    name: { type: String, required: true },
    isEnabled: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    config: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const skillsConfigSchema = new Schema<ISkillsConfig>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    shopDomain: { type: String, required: true, unique: true },
    skills: [skillConfigSchema],
  },
  { timestamps: true },
);

export const DEFAULT_SKILLS: ISkillConfig[] = [
  { skillId: 'order_status', name: 'Order Status Check', isEnabled: true, isDefault: true },
  { skillId: 'product_browsing', name: 'Product Browsing', isEnabled: true, isDefault: true },
  { skillId: 'policies_info', name: 'Policies Information', isEnabled: true, isDefault: true },
  { skillId: 'refund_request', name: 'Refund Request', isEnabled: false, isDefault: false },
  { skillId: 'exchange_request', name: 'Exchange Request', isEnabled: false, isDefault: false },
  { skillId: 'modify_shipping', name: 'Modify Shipping Address', isEnabled: false, isDefault: false },
  { skillId: 'cancel_order', name: 'Cancel Order', isEnabled: false, isDefault: false },
  { skillId: 'place_order', name: 'Place Order by Phone', isEnabled: false, isDefault: false },
];

export default mongoose.model<ISkillsConfig>('SkillsConfig', skillsConfigSchema);
