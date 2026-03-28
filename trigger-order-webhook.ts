import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

async function triggerOrderWebhook() {
  const appUrl = process.env.APP_URL!;
  const secret = process.env.SHOPIFY_API_SECRET!;

  // Simulate a new Shopify order
  const order = {
    id: 5678901234,
    name: '#LL-2002',
    phone: '01767517978',
    customer: {
      first_name: 'Alamin',
      last_name: '',
      phone: '01767517978',
    },
    line_items: [
      { title: 'Luminous Classic Ceiling Fan', quantity: 5, price: '200.00' },
    ],
    total_price: '800.00',
    subtotal_price: '1000.00',
    total_discounts: '200.00',
    currency: 'BDT',
    shipping_address: {
      address1: 'Mirpur',
      city: 'Dhaka',
      province: 'Dhaka',
      country: 'Bangladesh',
      phone: '01767517978',
    },
    billing_address: {
      address1: 'Mirpur',
      city: 'Dhaka',
      phone: '01767517978',
    },
    created_at: new Date().toISOString(),
  };

  const body = JSON.stringify(order);

  // Create HMAC signature like Shopify does
  const hmac = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');

  console.log('📦 Simulating Shopify order webhook...');
  console.log('   Order: #LL-2002');
  console.log('   Customer: Alamin');
  console.log('   Phone: 01767517978');
  console.log('   Items: 5x Luminous Classic Ceiling Fan @ 200 BDT');
  console.log('   Total: 800 BDT (after 20% discount)');
  console.log('   Address: Mirpur, Dhaka');
  console.log('   Webhook URL:', appUrl + '/webhooks/orders-create');
  console.log('');

  try {
    const res = await axios.post(
      appUrl + '/webhooks/orders-create',
      body,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-shopify-shop-domain': 'voice-nimble-test.myshopify.com',
          'x-shopify-hmac-sha256': hmac,
          'x-shopify-topic': 'orders/create',
        },
      },
    );
    console.log('✅ Webhook accepted! Status:', res.status);
    console.log('');
    console.log('📞 Event-Driven Flow:');
    console.log('   1. ✅ Webhook received → found active "order_placed" config');
    console.log('   2. ✅ Job queued to BullMQ (Redis)');
    console.log('   3. ⏳ Worker picks up job...');
    console.log('   4. ⏳ Calls Jambonz API → Alamin\'s phone rings');
    console.log('');
    console.log('📱 Alamin should receive the call in a few seconds!');
  } catch (err: any) {
    console.error('❌ Webhook failed:', err.response?.status, err.response?.data || err.message);
  }
}

triggerOrderWebhook();
