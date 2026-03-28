import { FishjamClient } from '@fishjam-cloud/js-server-sdk';
import * as GeminiIntegration from '@fishjam-cloud/js-server-sdk/gemini';
import { Modality } from '@google/genai';
import 'dotenv/config';

const fishjam = new FishjamClient({
  fishjamId: 'process.env.FISHJAM_ID',
  managementToken: 'process.env.FISHJAM_TOKEN'
});

// GeminiIntegration.createClient wraps @google/genai with the right audio settings
const genAi = GeminiIntegration.createClient({
  apiKey: 'process.env.GEMINI_API_KEY',
});

const GEMINI_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

async function startStealthMode() {
  try {
    const room = await fishjam.createRoom();
    const roomId = room.id;
    console.log(`📡 Stealth Room Created: ${roomId}`);

    const { peerToken: scoutToken } = await fishjam.createPeer(roomId, {
      metadata: { device: "mac", role: "scout" }
    });

    const { peerToken: commanderToken } = await fishjam.createPeer(roomId, {
      metadata: { device: "windows", role: "commander" }
    });

    // createAgent takes subscribeMode, not output — output is set on the agent itself
    const { agent } = await fishjam.createAgent(roomId, {
      subscribeMode: 'auto',
      output: GeminiIntegration.geminiInputAudioSettings,  // 16kHz preset Fishjam→Gemini
    });

    // The track Gemini audio will come back on (24kHz preset Gemini→Fishjam)
    const agentTrack = agent.createTrack(GeminiIntegration.geminiOutputAudioSettings);

    // Connect to Gemini Live and wire up the two-way audio bridge
    const session = await genAi.live.connect({
      model: GEMINI_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: `You are the GHOST-WATT Stealth Assistant. 
          Listen for sounds and voices in the shelter. 
          Warn the user about noise discipline and thermal risk.
          Keep responses short and tactical.`,
      },
      callbacks: {
        // Gemini → Fishjam room
        onmessage: (msg) => {
          if (msg.data) {
            const pcmData = Buffer.from(msg.data, 'base64');
            agent.sendData(agentTrack.id, pcmData);
          }
          if (msg.serverContent?.interrupted) {
            agent.interruptTrack(agentTrack.id);
          }
        }
      }
    });

    // Fishjam room → Gemini
    agent.on('trackData', ({ data }) => {
      session.sendRealtimeInput({
        audio: {
          mimeType: GeminiIntegration.inputMimeType,
          data: Buffer.from(data).toString('base64'),
        }
      });
    });

    console.log(`\n--- ENTRY TOKENS ---`);
    console.log(`MAC (Scout):      ${scoutToken}`);
    console.log(`WINDOWS (Commander): ${commanderToken}`);
    console.log(`--------------------`);
    console.log(`Stealth agent is live and listening.\n`);

  } catch (error) {
    console.error("Critical Failure in Stealth Protocol:", error);
  }
}

startStealthMode();
