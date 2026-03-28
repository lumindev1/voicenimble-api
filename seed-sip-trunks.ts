import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import SipTrunk from './src/models/sip-trunk.model';
import Shop from './src/models/shop.model';

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB');

  // Find the first shop
  const shop = await Shop.findOne();
  if (!shop) {
    console.error('No shop found. Please install the app on a Shopify store first.');
    process.exit(1);
  }

  console.log(`Using shop: ${shop.shopDomain} (${shop._id})`);

  // Remove existing demo trunks (optional - only removes ones created by this script)
  await SipTrunk.deleteMany({ shopId: shop._id, name: { $regex: /^Demo/ } });
  console.log('Cleared old demo trunks');

  const demoTrunks = [
    {
      shopId: shop._id,
      shopDomain: shop.shopDomain,
      name: 'Demo - Telnyx US Line',
      description: 'US toll-free number via Telnyx',
      sipHost: 'sip.telnyx.com',
      sipPort: 5060,
      sipProtocol: 'udp',
      sipUsername: 'telnyx_user_demo',
      sipPassword: 'telnyx_pass_demo',
      callerIdNumber: '+18001234567',
      callerIdName: 'My Store US',
      isActive: true,
      isDefault: true,
    },
    {
      shopId: shop._id,
      shopDomain: shop.shopDomain,
      name: 'Demo - Twilio UK Line',
      description: 'UK local number via Twilio',
      sipHost: 'sip.twilio.com',
      sipPort: 5060,
      sipProtocol: 'tcp',
      sipUsername: 'twilio_user_demo',
      sipPassword: 'twilio_pass_demo',
      callerIdNumber: '+442071234567',
      callerIdName: 'My Store UK',
      isActive: true,
      isDefault: false,
    },
    {
      shopId: shop._id,
      shopDomain: shop.shopDomain,
      name: 'Demo - BD Local Carrier',
      description: 'Bangladesh local carrier line',
      sipHost: '103.25.100.50',
      sipPort: 5060,
      sipProtocol: 'udp',
      callerIdNumber: '+8801712345678',
      callerIdName: 'My Store BD',
      isActive: true,
      isDefault: false,
    },
    {
      shopId: shop._id,
      shopDomain: shop.shopDomain,
      name: 'Demo - Vonage EU Line',
      description: 'EU number via Vonage for European customers',
      sipHost: 'sip.vonage.com',
      sipPort: 5061,
      sipProtocol: 'tls',
      sipUsername: 'vonage_user_demo',
      sipPassword: 'vonage_pass_demo',
      sipRealm: 'sip.vonage.com',
      callerIdNumber: '+4930123456789',
      callerIdName: 'My Store EU',
      isActive: true,
      isDefault: false,
    },
    {
      shopId: shop._id,
      shopDomain: shop.shopDomain,
      name: 'Demo - Backup Line',
      description: 'Backup line (inactive) for failover',
      sipHost: 'sip.backup-provider.com',
      sipPort: 5060,
      sipProtocol: 'udp',
      sipUsername: 'backup_user',
      sipPassword: 'backup_pass',
      callerIdNumber: '+12025551234',
      callerIdName: 'My Store Backup',
      isActive: false,
      isDefault: false,
    },
  ];

  const created = await SipTrunk.insertMany(demoTrunks);
  console.log(`\nCreated ${created.length} demo SIP trunks:\n`);

  created.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.name} | ${t.callerIdNumber} | ${t.isDefault ? 'DEFAULT' : ''} ${t.isActive ? 'Active' : 'Inactive'}`);
  });

  console.log('\nDone! Refresh your SIP Trunks page to see them.');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
