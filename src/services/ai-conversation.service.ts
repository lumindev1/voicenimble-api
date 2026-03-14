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
      return { text: 'Sorry, our conversation was lost. Please call again.' };
    }

    state.messages.push({ role: 'user', content: userInput });

    const systemPrompt = await this.buildSystemPrompt(state);

    let responseText = '';
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 200,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          ...state.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ],
      });

      responseText = response.choices[0]?.message?.content || '';
    } catch (err) {
      logger.error('OpenAI API error:', err);
      responseText = 'Sorry, there was an issue processing your request. Let me transfer you to a team member.';
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
    if (!state) return 'Hello! How can I help you today?';
    const agent = await Agent.findById(state.agentId);
    if (!agent) return 'Hello! How can I help you today?';

    // If language is not English, translate the greeting
    const lang = agent.primaryLanguage || 'en-US';
    if (!lang.startsWith('en')) {
      return this.translateGreeting(agent.greetingMessage, lang);
    }
    return agent.greetingMessage;
  }

  async translateGreeting(greeting: string, langCode: string): Promise<string> {
    const langName = this.getLanguageName(langCode);
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content: `Translate the following greeting to ${langName}. Return ONLY the translated text, nothing else.`,
          },
          { role: 'user', content: greeting },
        ],
      });
      return response.choices[0]?.message?.content?.trim() || greeting;
    } catch (err) {
      logger.error('Greeting translation error:', err);
      return greeting;
    }
  }

  private async buildSystemPrompt(state: ConversationState): Promise<string> {
    const [agent, shop, skillsConfig] = await Promise.all([
      Agent.findById(state.agentId),
      Shop.findOne({ shopDomain: state.shopDomain }),
      SkillsConfig.findOne({ shopDomain: state.shopDomain }),
    ]);

    if (!agent || !shop) {
      return 'You are a helpful customer service agent. This is a phone call — keep every response under 50 words. Be concise and natural.';
    }

    const enabledSkills = skillsConfig?.skills.filter((s) => s.isEnabled).map((s) => s.name) || [];
    const shopContext = await this.getShopContext(state.shopDomain, state.accessToken);

    // Skip template text for event-driven calls — the order context provides all needed info
    const templateSection = state.templateText && !state.orderContext
      ? `\nCALL SCRIPT / TEMPLATE:\n${state.templateText}\n`
      : '';

    // Build order context section for event-driven calls
    let orderSection = '';
    if (state.orderContext) {
      const oc = state.orderContext;
      const allOrders = (oc as Record<string, unknown>).allOrders as Array<Record<string, unknown>> | undefined;
      const hasMultipleOrders = allOrders && allOrders.length > 1;

      if (hasMultipleOrders) {
        // Multiple orders — AI asks which order to discuss
        const orderList = allOrders.map((o: Record<string, unknown>) => {
          const items = (o.items as Array<{title: string; quantity: number; price: string}>) || [];
          const itemStr = items.map(i => `${i.title} x${i.quantity} ($${i.price})`).join(', ');
          return `Order ${o.orderName}: ${itemStr} — Total: $${o.totalPrice} — Ship to: ${o.shippingAddress}`;
        }).join('\n');

        orderSection = `
CUSTOMER: ${oc.customerName || 'N/A'}
YOU HAVE ${allOrders.length} ORDERS ON FILE:
${orderList}

CONVERSATION FLOW (follow step by step, ONE STEP PER RESPONSE):
CRITICAL: You MUST speak ENTIRELY in ${this.getLanguageName(agent.primaryLanguage)}. Translate all example sentences.

STEP 1 - WAIT FOR CUSTOMER:
The greeting already asked for ${oc.customerName || 'the customer'} by name. Wait for them to confirm.

STEP 2 - ASK WHICH ORDER:
"Thank you ${oc.customerName || ''}. I can see you have ${allOrders.length} recent orders with us. Could you tell me which order number you would like to discuss? Your orders are: ${allOrders.map((o: Record<string, unknown>) => o.orderName).join(', ')}."

STEP 3 - READ ORDER DETAILS:
Once they tell you the order number, find it from the list above and read the items, total, and delivery address for that specific order. Ask: "Does that all look correct?"

STEP 4 - VERIFY ADDRESS:
Confirm the delivery address for that order.

STEP 5 - FINAL CONFIRMATION:
"Shall I confirm this order for you?"

STEP 6 - HANDLE DECISION:
- CONFIRMED: "Your order is confirmed. You will receive a confirmation shortly. Would you like to discuss another order?"
- CANCELLED: "No problem, I have cancelled that for you. Would you like to check another order?"
- If they want another order → go back to Step 3 with the new order.

STEP 7 - CLOSING:
"Thank you for your time ${oc.customerName || ''}. Have a great day!" Then append {"action": "end_call"}

IMPORTANT RULES:
- Do ONE step per response. Wait for customer to answer.
- Speak naturally, not robotic.
- Keep each response under 3 sentences.
- If customer asks about a specific order by number, jump to that order's details.`;
      } else {
        // Single order flow
        const itemsList = oc.items?.map(i => `${i.title}, quantity ${i.quantity}, priced at ${oc.currency || '$'}${i.price}`).join('; ') || '';
        orderSection = `
ORDER DATA (use this to drive the conversation):
- Order Number: ${oc.orderName || 'N/A'}
- Customer Name: ${oc.customerName || 'N/A'}
- Items: ${itemsList || 'N/A'}
- Total Amount: ${oc.currency || '$'}${oc.totalPrice || 'N/A'}
- Delivery Address: ${oc.shippingAddress || 'N/A'}

${state.eventType === 'order_placed' ? `CONVERSATION FLOW (follow this step by step, ONE STEP PER RESPONSE):
CRITICAL: You MUST speak ENTIRELY in ${this.getLanguageName(agent.primaryLanguage)}. Translate all example sentences into ${this.getLanguageName(agent.primaryLanguage)}.

You are a customer care officer making an OUTBOUND call to confirm an order. Follow these steps one at a time.

STEP 1 - WAIT FOR CUSTOMER:
The greeting already asked for ${oc.customerName || 'the customer'} by name. Wait for them to respond.
- If they confirm → move to Step 2.
- If wrong person → ask to pass the phone or say you will call back.
- If they ask "who is this?" → "This is ${agent.agentName} from Voice Nimble, calling about a recent order."

STEP 2 - STATE PURPOSE:
"Thank you ${oc.customerName || ''}. I am calling about your order ${oc.orderName || ''}. I just need a couple of minutes to confirm the details. Is now a good time?"

STEP 3 - READ ORDER ITEMS:
"You have ordered: ${itemsList}. Total: ${oc.currency || '$'}${oc.totalPrice || 'N/A'}. Does that look correct?"

STEP 4 - VERIFY ADDRESS:
"Your delivery address is ${oc.shippingAddress || 'on file'}. Is that correct?"

STEP 5 - FINAL CONFIRMATION:
"Shall I confirm this order for you?"

STEP 6 - HANDLE DECISION:
- CONFIRMED: "Your order ${oc.orderName || ''} is confirmed. Is there anything else?"
- CANCELLED: "No problem, cancelled for you. Is there anything else?"
- CHANGES: "What changes would you like?"

STEP 7 - CLOSING:
"Thank you ${oc.customerName || ''}. Have a great day!" Then append {"action": "end_call"}

IMPORTANT RULES:
- ONE step per response. Wait for customer reply.
- Keep each response under 3 sentences.
- Speak naturally.` : ''}
${state.eventType === 'order_fulfilled' ? `
CONVERSATION FLOW (follow this step by step, ONE STEP PER RESPONSE):
CRITICAL: You MUST speak ENTIRELY in ${this.getLanguageName(agent.primaryLanguage)}. Translate all example sentences.

STEP 1 - WAIT FOR CUSTOMER: Wait for customer to confirm identity.
STEP 2 - DELIVERY NOTIFICATION: "Your order ${oc.orderName || ''} has been delivered."
STEP 3 - DELIVERY CHECK: "Have you received the package? Is everything in good condition?"
STEP 4 - SATISFACTION CHECK: "Anything to report or any questions?"
STEP 5 - CLOSING: "Thank you ${oc.customerName || ''}. Have a great day!" Then append {"action": "end_call"}

RULES: ONE step per response. Keep under 3 sentences.` : ''}`;
      }
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
- This is a PHONE CALL. Keep each response short and clear — maximum 2-3 sentences per turn.
- Be warm, professional, and human-like. Never sound robotic or scripted.
- ${state.orderContext ? 'Follow the CONVERSATION FLOW steps above one at a time. Do NOT skip ahead.' : `Opening greeting: "${agent.greetingMessage}"`}
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
- You MUST respond ONLY in ${this.getLanguageName(agent.primaryLanguage)}. Every single word of your response MUST be in ${this.getLanguageName(agent.primaryLanguage)}.
- Even if the caller speaks a different language, you MUST still reply in ${this.getLanguageName(agent.primaryLanguage)}.
- Keep responses clear, concise, and professional.

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

  private getLanguageName(langCode: string): string {
    const languageMap: Record<string, string> = {
      'en-US': 'English',
      'en-GB': 'English',
      'en-AU': 'English',
      'es-ES': 'Spanish',
      'es-MX': 'Spanish',
      'fr-FR': 'French',
      'fr-CA': 'French',
      'de-DE': 'German',
      'it-IT': 'Italian',
      'pt-BR': 'Portuguese',
      'pt-PT': 'Portuguese',
      'nl-NL': 'Dutch',
      'ja-JP': 'Japanese',
      'ko-KR': 'Korean',
      'zh-CN': 'Mandarin Chinese',
      'zh-TW': 'Mandarin Chinese',
      'hi-IN': 'Hindi',
      'bn-IN': 'Bengali',
      'ar-SA': 'Arabic',
      'ru-RU': 'Russian',
      'tr-TR': 'Turkish',
      'pl-PL': 'Polish',
      'sv-SE': 'Swedish',
      'da-DK': 'Danish',
      'fi-FI': 'Finnish',
      'nb-NO': 'Norwegian',
      'th-TH': 'Thai',
      'vi-VN': 'Vietnamese',
      'id-ID': 'Indonesian',
      'ms-MY': 'Malay',
      'tl-PH': 'Filipino',
      'uk-UA': 'Ukrainian',
      'cs-CZ': 'Czech',
      'ro-RO': 'Romanian',
      'hu-HU': 'Hungarian',
      'el-GR': 'Greek',
      'he-IL': 'Hebrew',
      'ta-IN': 'Tamil',
      'te-IN': 'Telugu',
      'mr-IN': 'Marathi',
      'gu-IN': 'Gujarati',
      'kn-IN': 'Kannada',
      'ml-IN': 'Malayalam',
      'pa-IN': 'Punjabi',
      'ur-PK': 'Urdu',
    };
    return languageMap[langCode] || langCode;
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
