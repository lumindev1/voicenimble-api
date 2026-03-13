/**
 * Test ElevenLabs outbound call
 * Run: npx ts-node test-elevenlabs-call.ts
 */
import 'dotenv/config';
import axios from 'axios';
import mongoose from 'mongoose';
import Agent from './src/models/agent.model';
import { VoiceNimbleService } from './src/services/voicenimble.service';

const TO_NUMBER = process.argv[2] || '01767517978';

async function main() {
  // Connect DB
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('MongoDB connected');

  // Register ElevenLabs credentials
  const voiceNimble = new VoiceNimbleService();
  try {
    const credSid = await voiceNimble.addElevenLabsSpeechCredential();
    console.log(`ElevenLabs credential registered: ${credSid}`);
  } catch (err: any) {
    console.log(`ElevenLabs credential registration: ${err.message}`);
  }

  // Find active agent and update to ElevenLabs
  const agent = await Agent.findOne({ isActive: true });
  if (!agent) {
    console.log('No active agent found');
    process.exit(1);
  }

  // Update agent to use ElevenLabs with "Sarah" voice
  agent.ttsVendor = 'elevenlabs';
  agent.voiceId = 'EXAVITQu4vr4xnSDxMaL'; // Sarah
  await agent.save();
  console.log(`Agent "${agent.agentName}" updated to ElevenLabs (Sarah voice)`);

  // Place outbound call
  const baseUrl = process.env.VOICENIMBLE_BASE_URL!;
  const apiKey = process.env.VOICENIMBLE_API_KEY!;
  const accountSid = process.env.VOICENIMBLE_ACCOUNT_SID!;
  const appUrl = process.env.APP_URL!;
  const from = agent.byonPhoneNumber || agent.phoneNumber || process.env.DEFAULT_FROM_NUMBER || '';

  const callPayload = {
    application_sid: process.env.VOICENIMBLE_APPLICATION_SID,
    from,
    to: { type: 'phone', number: TO_NUMBER },
    tag: {
      agentId: agent._id.toString(),
      shopDomain: agent.shopDomain,
      direction: 'outbound',
    },
    call_hook: {
      url: `${appUrl}/voicenimble/call-event`,
      method: 'POST',
    },
    call_status_hook: {
      url: `${appUrl}/voicenimble/call-status`,
      method: 'POST',
    },
  };

  console.log(`\nPlacing call to ${TO_NUMBER} from ${from}...`);

  try {
    const res = await axios.post(
      `${baseUrl}/v1/Accounts/${accountSid}/Calls`,
      callPayload,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    console.log(`Call initiated! SID: ${res.data.sid}`);
  } catch (err: any) {
    console.log(`Call failed: ${err.response?.data?.message || err.response?.data || err.message}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
