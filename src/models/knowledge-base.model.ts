import mongoose, { Document, Schema } from 'mongoose';

export type DocumentSourceType = 'pdf' | 'text' | 'url';

export interface IKBDocument {
  _id?: mongoose.Types.ObjectId;
  title: string;
  sourceType: DocumentSourceType;
  content?: string;   // raw text or extracted text
  fileUrl?: string;   // uploaded PDF URL
  sourceUrl?: string; // scraped URL
  createdAt: Date;
}

export interface IKnowledgeBase extends Document {
  _id: mongoose.Types.ObjectId;
  shopId: mongoose.Types.ObjectId;
  shopDomain: string;
  name: string;
  documents: IKBDocument[];
  createdAt: Date;
  updatedAt: Date;
}

const kbDocumentSchema = new Schema<IKBDocument>(
  {
    title: { type: String, required: true },
    sourceType: { type: String, enum: ['pdf', 'text', 'url'], required: true },
    content: { type: String },
    fileUrl: { type: String },
    sourceUrl: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const knowledgeBaseSchema = new Schema<IKnowledgeBase>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    shopDomain: { type: String, required: true },
    name: { type: String, required: true },
    documents: [kbDocumentSchema],
  },
  { timestamps: true },
);

knowledgeBaseSchema.index({ shopId: 1, createdAt: -1 });

export default mongoose.model<IKnowledgeBase>('KnowledgeBase', knowledgeBaseSchema);
