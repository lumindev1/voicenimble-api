import mongoose from 'mongoose';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

import Agent from './src/models/agent.model';
import KnowledgeBase from './src/models/knowledge-base.model';
import CallTemplate from './src/models/call-template.model';
import EventDriven from './src/models/event-driven.model';
import SipTrunk from './src/models/sip-trunk.model';
import Shop from './src/models/shop.model';

async function seedAndCall() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connected to MongoDB\n');

  // 1. Find the shop
  const shop = await Shop.findOne();
  if (!shop) {
    console.error('❌ No shop found');
    process.exit(1);
  }
  console.log(`🏪 Shop: ${shop.shopDomain} (${shop._id})\n`);

  // ─────────────────────────────────────────────
  // 2. CREATE VIRTUAL AGENT
  // ─────────────────────────────────────────────
  let agent = await Agent.findOne({ shopId: shop._id, agentName: 'Luminous Labs Support' });

  if (!agent) {
    agent = await Agent.create({
      shopId: shop._id,
      shopDomain: shop.shopDomain,
      agentName: 'Luminous Labs Support',
      callType: 'outbound',
      primaryLanguage: 'bn',
      voiceGender: 'female',
      voiceId: 'bn-IN-Standard-A',
      voiceSpeed: 1.0,
      ttsVendor: 'google',
      sttVendor: 'google',
      legalBusinessName: 'Luminous Labs',
      businessDomain: 'luminouslabs.com',
      agentRole: 'Customer Care Representative',
      greetingMessage: 'আসসালামু আলাইকুম, আমি লুমিনাস ল্যাবস থেকে কল করছি।',
      goalDescription: 'Confirm customer orders by calling them after order placement. Verify order details including items, quantity, price, delivery address. Be polite, professional, and helpful. Speak in Bangla.',
      informationToCollect: [
        'Order confirmation (yes/no)',
        'Delivery address verification',
        'Preferred delivery time',
        'Any special instructions',
      ],
      extraInformationToShare: 'Luminous Labs sells premium quality fans and electronics. We offer free delivery in Dhaka city. Delivery usually takes 2-3 business days. For any issues, customers can call our helpline.',
      topicsToAvoid: [
        'Competitor products',
        'Internal company matters',
        'Price negotiation beyond approved discounts',
      ],
      humanHandoffNumber: '+8801767517978',
      phoneNumber: process.env.DEFAULT_FROM_NUMBER || '01521206630',
      isActive: true,
      isConfigured: true,
    });
    console.log('🤖 Created Virtual Agent: Luminous Labs Support');
  } else {
    console.log('🤖 Agent already exists: Luminous Labs Support');
  }

  // ─────────────────────────────────────────────
  // 3. ADD KNOWLEDGE BASE
  // ─────────────────────────────────────────────
  let kb = await KnowledgeBase.findOne({ shopId: shop._id, name: 'Luminous Labs Product Knowledge' });

  if (!kb) {
    kb = await KnowledgeBase.create({
      shopId: shop._id,
      shopDomain: shop.shopDomain,
      name: 'Luminous Labs Product Knowledge',
      documents: [
        {
          title: 'Company Information',
          sourceType: 'text',
          content: `
Company: Luminous Labs
Location: Dhaka, Bangladesh
Business Type: Electronics & Home Appliances
Speciality: Premium quality ceiling fans, table fans, and exhaust fans

Contact:
- Phone: +8801767517978
- Email: support@luminouslabs.com
- Address: Mirpur, Dhaka, Bangladesh

Business Hours: Saturday - Thursday, 9 AM - 6 PM
          `.trim(),
        },
        {
          title: 'Product Catalog - Fans',
          sourceType: 'text',
          content: `
PRODUCT CATALOG:

1. Luminous Classic Ceiling Fan
   - Price: 200 BDT per piece
   - Colors: White, Brown, Black
   - Warranty: 2 years
   - Features: Energy efficient, noiseless operation, copper winding motor

2. Luminous Premium Ceiling Fan
   - Price: 350 BDT per piece
   - Colors: White, Silver, Gold
   - Warranty: 3 years
   - Features: Remote control, 5 speed settings, LED light included

3. Luminous Table Fan
   - Price: 150 BDT per piece
   - Warranty: 1 year
   - Features: 3 speed, oscillating, portable

4. Luminous Exhaust Fan
   - Price: 120 BDT per piece
   - Warranty: 1 year
          `.trim(),
        },
        {
          title: 'Delivery & Return Policy',
          sourceType: 'text',
          content: `
DELIVERY POLICY:
- Free delivery within Dhaka city
- Outside Dhaka: 100 BDT delivery charge
- Delivery time: 2-3 business days (Dhaka), 4-5 business days (outside Dhaka)
- Cash on Delivery (COD) available
- Online payment via bKash, Nagad, bank transfer

RETURN POLICY:
- 7-day return policy for manufacturing defects
- Product must be unused and in original packaging
- Refund processed within 3-5 business days

DISCOUNT POLICY:
- Bulk orders (5+ items): up to 20% discount
- Seasonal offers available during Eid and Puja
          `.trim(),
        },
        {
          title: 'FAQ - Common Questions',
          sourceType: 'text',
          content: `
FREQUENTLY ASKED QUESTIONS:

Q: Do you provide installation?
A: Yes, free installation for ceiling fans within Dhaka. Outside Dhaka, 200 BDT installation charge.

Q: Can I change my delivery address after ordering?
A: Yes, you can change the address before the product is dispatched. Call our support line.

Q: What payment methods do you accept?
A: Cash on Delivery (COD), bKash, Nagad, and bank transfer.

Q: Do you provide warranty service?
A: Yes, visit our service center in Mirpur, Dhaka or call our helpline for pickup service.

Q: Can I cancel my order?
A: Yes, orders can be cancelled before dispatch. No cancellation fee applies.
          `.trim(),
        },
      ],
    });
    console.log('📚 Created Knowledge Base: 4 documents added');
  } else {
    console.log('📚 Knowledge Base already exists');
  }

  // ─────────────────────────────────────────────
  // 4. CREATE CALL TEMPLATE
  // ─────────────────────────────────────────────
  let template = await CallTemplate.findOne({ shopId: shop._id, name: 'Order Confirmation Call' });

  if (!template) {
    template = await CallTemplate.create({
      shopId: shop._id,
      shopDomain: shop.shopDomain,
      name: 'Order Confirmation Call',
      type: 'ai',
      aiContentType: 'text',
      text: `You are a customer care representative from Luminous Labs. You are calling to confirm an order. Be polite, speak in Bangla, and follow these steps:
1. Greet the customer and introduce yourself
2. Mention the order number and items ordered
3. Confirm the delivery address
4. Ask if they have any questions
5. Thank them and end the call professionally`,
    });
    console.log('📋 Created Call Template: Order Confirmation Call');
  } else {
    console.log('📋 Call Template already exists');
  }

  // ─────────────────────────────────────────────
  // 5. CREATE EVENT-DRIVEN CONFIG
  // ─────────────────────────────────────────────
  let eventConfig = await EventDriven.findOne({ shopId: shop._id, triggerEvent: 'order_placed' });

  if (!eventConfig) {
    eventConfig = await EventDriven.create({
      shopId: shop._id,
      shopDomain: shop.shopDomain,
      name: 'Auto Call on New Order',
      triggerEvent: 'order_placed',
      templateId: template._id,
      agentId: agent._id,
      isActive: true,
      callCount: 0,
    });
    console.log('⚡ Created Event-Driven Config: order_placed → auto call');
  } else {
    console.log('⚡ Event-Driven Config already exists');
  }

  // ─────────────────────────────────────────────
  // 6. MAKE THE DEMO CALL
  // ─────────────────────────────────────────────
  console.log('\n────────────────────────────────────────');
  console.log('📞 MAKING DEMO CALL TO ALAMIN...');
  console.log('────────────────────────────────────────\n');

  const sipTrunk = await SipTrunk.findOne({ shopId: shop._id, isDefault: true, isActive: true });
  const from = sipTrunk?.callerIdNumber || agent.phoneNumber || process.env.DEFAULT_FROM_NUMBER || '';

  const orderContext = {
    orderName: '#LL-1001',
    customerName: 'Alamin',
    customerPhone: '+8801767517978',
    items: [
      { title: 'Luminous Classic Ceiling Fan', quantity: 5, price: '200' },
    ],
    totalPrice: '800',
    currency: 'BDT',
    originalPrice: '1000',
    discount: '20%',
    discountAmount: '200',
    shippingAddress: 'Mirpur, Dhaka, Bangladesh',
  };

  const tag = {
    agentId: agent._id.toString(),
    shopDomain: shop.shopDomain,
    direction: 'outbound',
    callType: 'event_driven',
    eventType: 'order_placed',
    templateId: template._id.toString(),
    orderContext: JSON.stringify(orderContext),
  };

  const callPayload: Record<string, unknown> = {
    application_sid: process.env.VOICENIMBLE_APPLICATION_SID,
    from,
    to: { type: 'phone', number: '+8801767517978' },
    tag,
    call_hook: {
      url: `${process.env.APP_URL}/voicenimble/call-event`,
      method: 'POST',
    },
    call_status_hook: {
      url: `${process.env.APP_URL}/voicenimble/call-status`,
      method: 'POST',
    },
  };

  if (sipTrunk?.voiceNimbleCarrierSid) {
    callPayload.sip_trunk = sipTrunk.voiceNimbleCarrierSid;
  }

  console.log('Call Details:');
  console.log(`  From: ${from}`);
  console.log(`  To: +8801767517978 (Alamin)`);
  console.log(`  Agent: ${agent.agentName}`);
  console.log(`  Order: #LL-1001`);
  console.log(`  Items: Luminous Classic Ceiling Fan x5`);
  console.log(`  Original: 1000 BDT → 20% off → Final: 800 BDT`);
  console.log(`  Delivery: Mirpur, Dhaka`);
  console.log(`  Company: Luminous Labs\n`);

  try {
    const baseUrl = process.env.VOICENIMBLE_BASE_URL!;
    const apiKey = process.env.VOICENIMBLE_API_KEY!;
    const accountSid = process.env.VOICENIMBLE_ACCOUNT_SID!;

    const response = await axios.post(
      `${baseUrl}/v1/Accounts/${accountSid}/Calls`,
      callPayload,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    console.log('✅ CALL INITIATED SUCCESSFULLY!');
    console.log(`   Call SID: ${response.data.sid}`);
    console.log('\n📱 Alamin\'s phone (+8801767517978) should ring now!');
    console.log('\nThe AI agent will:');
    console.log('  1. Greet Alamin in Bangla');
    console.log('  2. Mention order #LL-1001');
    console.log('  3. Confirm: 5 pcs Ceiling Fan = 1000 BDT, 20% discount = 800 BDT');
    console.log('  4. Verify delivery address: Mirpur, Dhaka');
    console.log('  5. Ask for confirmation');
    console.log('  6. Thank and end call');
  } catch (err: any) {
    console.error('❌ CALL FAILED!');
    console.error(`   Status: ${err.response?.status}`);
    console.error(`   Error: ${JSON.stringify(err.response?.data || err.message)}`);
    console.error('\n💡 Possible reasons:');
    console.error('   - No valid SIP trunk with real credentials');
    console.error('   - VoiceNimble/Jambonz server is not reachable');
    console.error('   - Invalid from number');
    console.error('   - API key expired');
  }

  await mongoose.disconnect();
  console.log('\n✅ Done!');
}

seedAndCall().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
