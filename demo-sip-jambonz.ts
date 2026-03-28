import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import SipTrunk from './src/models/sip-trunk.model';
import Shop from './src/models/shop.model';
import { VoiceNimbleService } from './src/services/voicenimble.service';

const voiceNimble = new VoiceNimbleService();

async function createDemoSip() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB\n');

  const shop = await Shop.findOne();
  if (!shop) { console.error('No shop found'); process.exit(1); }

  console.log('=== STEP 1: Creating CARRIER in Jambonz ===\n');

  const carrierName = `VN-${shop.shopDomain}-Demo-Telnyx-Line`.replace(/[^a-zA-Z0-9-_]/g, '-');
  console.log(`  Carrier name: ${carrierName}`);

  const carrierSid = await voiceNimble.createCarrier(carrierName, 'Demo carrier created from Voice Nimble app');
  console.log(`  ✅ Carrier created!`);
  console.log(`  Carrier SID: ${carrierSid}\n`);

  console.log('=== STEP 2: Creating SIP GATEWAY under carrier ===\n');
  console.log(`  SIP Host: sip.demo-telnyx.com`);
  console.log(`  SIP Port: 5060`);
  console.log(`  Protocol: UDP`);

  const gatewaySid = await voiceNimble.createSipGateway(carrierSid, 'sip.demo-telnyx.com', 5060, 'udp');
  console.log(`  ✅ SIP Gateway created!`);
  console.log(`  Gateway SID: ${gatewaySid}\n`);

  console.log('=== STEP 3: Saving to MongoDB ===\n');

  const trunk = await SipTrunk.create({
    shopId: shop._id,
    shopDomain: shop.shopDomain,
    name: 'Demo - Telnyx Line (Jambonz Test)',
    description: 'Demo SIP trunk to show Jambonz carrier auto-creation',
    sipHost: 'sip.demo-telnyx.com',
    sipPort: 5060,
    sipProtocol: 'udp',
    callerIdNumber: '+8801521206630',
    callerIdName: 'Luminous Labs Demo',
    voiceNimbleCarrierSid: carrierSid,
    voiceNimbleGatewaySid: gatewaySid,
    isActive: true,
    isDefault: false,
  });

  console.log(`  ✅ Saved to MongoDB!`);
  console.log(`  Trunk ID: ${trunk._id}\n`);

  console.log('════════════════════════════════════════════════════');
  console.log('  DONE! Now go check your Jambonz Carriers page:');
  console.log('  https://manage.voicenimble.com/internal/carriers');
  console.log('');
  console.log('  You should see a NEW carrier:');
  console.log(`  Name: ${carrierName}`);
  console.log(`  Carrier SID: ${carrierSid}`);
  console.log(`  Gateway SID: ${gatewaySid}`);
  console.log('');
  console.log('  Before: 1 carrier (FreePBX)');
  console.log('  After:  2 carriers (FreePBX + Demo Telnyx)');
  console.log('════════════════════════════════════════════════════');

  await mongoose.disconnect();
}

createDemoSip().catch((err) => {
  console.error('Failed:', err.response?.data || err.message);
  process.exit(1);
});
