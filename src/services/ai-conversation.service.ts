import OpenAI from 'openai';
import { ShopifyService } from './shopify.service';
import Agent from '../models/agent.model';
import Shop from '../models/shop.model';
import SkillsConfig from '../models/skills-config.model';
import KnowledgeBase from '../models/knowledge-base.model';
import { getRedisClient } from '../config/redis';
import logger from '../utils/logger';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface OrderContext {
  orderName?: string;
  customerName?: string;
  customerPhone?: string;
  items?: Array<{ title: string; quantity: number; price: string }>;
  totalPrice?: string;
  currency?: string;
  shippingAddress?: string;
  fulfillmentStatus?: string;
}

interface ConversationState {
  shopDomain: string;
  agentId: string;
  callSid: string;
  messages: ConversationMessage[];
  collectedInfo: Record<string, string>;
  currentIntent?: string;
  customerName?: string;
  orderNumberMentioned?: string;
  transferRequested?: boolean;
  endCallRequested?: boolean;
  accessToken: string;
  templateText?: string;
  eventType?: string;
  orderContext?: OrderContext;
}

interface AIResponse {
  text: string;
  shouldTransfer?: boolean;
  shouldEndCall?: boolean;
  transferTo?: string;
  intent?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class AIConversationService {
  private readonly conversationTTL = 3600;

  async initializeConversation(
    callSid: string,
    shopDomain: string,
    agentId: string,
    accessToken: string,
    templateText?: string,
    eventType?: string,
    orderContext?: OrderContext,
  ): Promise<void> {
    const state: ConversationState = {
      shopDomain,
      agentId,
      callSid,
      messages: [],
      collectedInfo: {},
      accessToken,
      templateText,
      eventType,
      orderContext,
    };
    const redis = getRedisClient();
    await redis.setex(`conversation:${callSid}`, this.conversationTTL, JSON.stringify(state));
  }

  async getConversationState(callSid: string): Promise<ConversationState | null> {
    const redis = getRedisClient();
    const data = await redis.get(`conversation:${callSid}`);
    if (!data) return null;
    return JSON.parse(data) as ConversationState;
  }

  async saveConversationState(state: ConversationState): Promise<void> {
    const redis = getRedisClient();
    await redis.setex(`conversation:${state.callSid}`, this.conversationTTL, JSON.stringify(state));
  }

  async deleteConversationState(callSid: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`conversation:${callSid}`);
  }

  async processUserInput(callSid: string, userInput: string): Promise<AIResponse> {
    const state = await this.getConversationState(callSid);
    if (!state) {
      return { text: 'দুঃখিত, আমাদের কথোপকথন হারিয়ে গেছে। অনুগ্রহ করে আবার কল করুন।' };
    }

    state.messages.push({ role: 'user', content: userInput });

    const systemPrompt = await this.buildSystemPrompt(state);

    let responseText = '';
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 500,
        messages: [
          { role: 'system', content: systemPrompt },
          ...state.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ],
      });

      responseText = response.choices[0]?.message?.content || '';
    } catch (err) {
      logger.error('OpenAI API error:', err);
      responseText = 'দুঃখিত, আপনার অনুরোধ প্রক্রিয়া করতে সমস্যা হচ্ছে। আমি আপনাকে একজন দলের সদস্যের কাছে ট্রান্সফার করছি।';
      state.transferRequested = true;
    }

    const parsed = this.parseAIResponse(responseText, state);

    state.messages.push({ role: 'assistant', content: parsed.cleanText });

    if (parsed.intent) state.currentIntent = parsed.intent;
    if (parsed.customerName) state.customerName = parsed.customerName;
    if (parsed.orderNumber) state.orderNumberMentioned = parsed.orderNumber;
    if (parsed.shouldTransfer) state.transferRequested = true;
    if (parsed.shouldEndCall) state.endCallRequested = true;

    await this.saveConversationState(state);

    return {
      text: parsed.cleanText,
      shouldTransfer: parsed.shouldTransfer,
      shouldEndCall: parsed.shouldEndCall,
      intent: parsed.intent,
      sentiment: this.detectSentiment(state.messages),
    };
  }

  async getGreeting(callSid: string): Promise<string> {
    const state = await this.getConversationState(callSid);
    if (!state) return 'আসসালামু আলাইকুম! আজ আমি আপনাকে কিভাবে সাহায্য করতে পারি?';
    const agent = await Agent.findById(state.agentId);
    if (!agent) return 'আসসালামু আলাইকুম! আজ আমি আপনাকে কিভাবে সাহায্য করতে পারি?';
    return agent.greetingMessage;
  }

  private async buildSystemPrompt(state: ConversationState): Promise<string> {
    const [agent, shop, skillsConfig] = await Promise.all([
      Agent.findById(state.agentId),
      Shop.findOne({ shopDomain: state.shopDomain }),
      SkillsConfig.findOne({ shopDomain: state.shopDomain }),
    ]);

    if (!agent || !shop) {
      return 'You are a helpful customer service agent. This is a phone call — keep every response under 50 words. Be concise and natural. ALWAYS respond in Bangla (Bengali) language.';
    }

    const enabledSkills = skillsConfig?.skills.filter((s) => s.isEnabled).map((s) => s.name) || [];
    const shopContext = await this.getShopContext(state.shopDomain, state.accessToken);

    const templateSection = state.templateText
      ? `\nCALL SCRIPT / TEMPLATE:\n${state.templateText}\n`
      : '';

    // Build order context section for event-driven calls
    let orderSection = '';
    if (state.orderContext) {
      const oc = state.orderContext;
      const itemsList = oc.items?.map(i => `${i.title} (x${i.quantity}) - ${oc.currency || '৳'}${i.price}`).join(', ') || '';
      const eventLabel = state.eventType === 'order_fulfilled' ? 'অর্ডার ডেলিভারি হয়েছে' : 'নতুন অর্ডার';
      orderSection = `
CALL CONTEXT (EVENT-DRIVEN):
This is an automated call triggered by: ${eventLabel}
Order Number: ${oc.orderName || 'N/A'}
Customer Name: ${oc.customerName || 'N/A'}
Items: ${itemsList || 'N/A'}
Total: ${oc.currency || '৳'}${oc.totalPrice || 'N/A'}
${oc.shippingAddress ? `Shipping Address: ${oc.shippingAddress}` : ''}
${state.eventType === 'order_placed' ? 'Your goal: Call the customer, confirm the order details, verify the delivery address, and answer any questions about the order.' : ''}
${state.eventType === 'order_fulfilled' ? 'Your goal: Inform the customer that their order has been shipped/delivered and ask if they have any questions.' : ''}
`;
    }

    // Build knowledge base section
    const kbSection = await this.getKnowledgeBaseContent(shop._id.toString());

    return `You are ${agent.agentName}, an AI voice assistant for ${shop.shopName}.

YOUR ROLE: ${agent.agentRole}
${templateSection}${orderSection}${kbSection}
BUSINESS INFORMATION:
${shopContext}

ENABLED SKILLS:
${enabledSkills.length > 0 ? enabledSkills.join('\n') : 'General customer support'}

BEHAVIOR GUIDELINES:
- This is a PHONE CALL. Keep every response under 50 words. Be natural and conversational.
- Opening greeting: "${agent.greetingMessage}"
- Goal: ${agent.goalDescription || 'Help the customer effectively'}
- Collect from customer: ${(agent.informationToCollect || []).join(', ') || 'name, query details'}
- Extra info to share: ${agent.extraInformationToShare || 'None'}
- Topics to NEVER discuss: ${(agent.topicsToAvoid || []).join(', ') || 'competitor products'}

SPECIAL COMMANDS (append JSON at the END of your response when needed):
- Transfer to human: {"action": "transfer", "to": "${agent.humanHandoffNumber || 'default'}"}
- End call: {"action": "end_call"}
- Tag intent: {"intent": "order_status|product_inquiry|policy_question|refund_request|other"}
- Tag customer name: {"customer_name": "name"}
- Tag order number: {"order_number": "#XXXX"}

LANGUAGE:
- You MUST respond ONLY in Bangla (Bengali) language. Every word of your response must be in Bangla.
- Do NOT use English at all in your responses.

RULES:
1. You can ONLY provide information — never modify store data.
2. For refund/cancellation requests: collect details, say a human will follow up.
3. If customer frustrated after 2 attempts: offer human transfer.
4. Keep all responses SHORT — phone conversation only.
5. Current collected info: ${JSON.stringify(state.collectedInfo)}`;
  }

  private async getKnowledgeBaseContent(shopId: string): Promise<string> {
    const redis = getRedisClient();
    const cacheKey = `kb:${shopId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    try {
      const knowledgeBases = await KnowledgeBase.find({ shopId });
      if (!knowledgeBases.length) return '';

      const docs = knowledgeBases.flatMap(kb => kb.documents || []);
      if (!docs.length) return '';

      const content = docs
        .filter(d => d.content)
        .map(d => `### ${d.title}\n${d.content}`)
        .join('\n\n');

      if (!content) return '';

      const section = `\nBUSINESS KNOWLEDGE BASE:\nUse this information to answer customer questions accurately:\n${content}\n`;
      await redis.setex(cacheKey, 300, section); // 5 min cache
      return section;
    } catch (err) {
      logger.error('Failed to load knowledge base:', err);
      return '';
    }
  }

  private async getShopContext(shopDomain: string, accessToken: string): Promise<string> {
    const redis = getRedisClient();
    const cacheKey = `shop-context:${shopDomain}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    try {
      const shopifyService = new ShopifyService(shopDomain, accessToken);
      const context = await shopifyService.getShopSummaryForAI();
      await redis.setex(cacheKey, 1800, context);
      return context;
    } catch (err) {
      logger.error('Failed to get shop context:', err);
      return 'Store information temporarily unavailable.';
    }
  }

  private parseAIResponse(rawText: string, state: ConversationState): {
    cleanText: string;
    shouldTransfer?: boolean;
    shouldEndCall?: boolean;
    intent?: string;
    customerName?: string;
    orderNumber?: string;
  } {
    const jsonMatches = rawText.match(/\{[^}]+\}/g);
    let shouldTransfer = false;
    let shouldEndCall = false;
    let intent: string | undefined;
    let customerName: string | undefined;
    let orderNumber: string | undefined;

    if (jsonMatches) {
      for (const jsonStr of jsonMatches) {
        try {
          const cmd = JSON.parse(jsonStr) as Record<string, string>;
          if (cmd.action === 'transfer') shouldTransfer = true;
          if (cmd.action === 'end_call') shouldEndCall = true;
          if (cmd.intent) intent = cmd.intent;
          if (cmd.customer_name) customerName = cmd.customer_name;
          if (cmd.order_number) orderNumber = cmd.order_number;
          if (cmd.collected_info) {
            try { Object.assign(state.collectedInfo, JSON.parse(cmd.collected_info)); } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }
    }

    const cleanText = rawText.replace(/\{[^}]+\}/g, '').trim().replace(/\s+/g, ' ');
    return { cleanText, shouldTransfer, shouldEndCall, intent, customerName, orderNumber };
  }

  private detectSentiment(messages: ConversationMessage[]): 'positive' | 'neutral' | 'negative' {
    const userMessages = messages.filter((m) => m.role === 'user').map((m) => m.content.toLowerCase()).join(' ');
    const positiveWords = ['thank', 'great', 'wonderful', 'perfect', 'happy', 'love', 'excellent', 'awesome'];
    const negativeWords = ['angry', 'frustrated', 'terrible', 'awful', 'worst', 'horrible', 'unacceptable', 'refund', 'cancel'];
    const pos = positiveWords.filter((w) => userMessages.includes(w)).length;
    const neg = negativeWords.filter((w) => userMessages.includes(w)).length;
    if (neg > pos) return 'negative';
    if (pos > neg) return 'positive';
    return 'neutral';
  }

  async getConversationMessages(callSid: string): Promise<ConversationMessage[]> {
    const state = await this.getConversationState(callSid);
    return state?.messages || [];
  }
}
