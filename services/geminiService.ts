import { GoogleGenAI, Chat, Modality } from "@google/genai";
import { SYSTEM_INSTRUCTION } from '../constants';

let chatSession: Chat | null = null;
let ai: GoogleGenAI | null = null;

// Audio Context & State
let audioContext: AudioContext | null = null;
let currentAudioSource: AudioBufferSourceNode | null = null;
let latestTTSId = 0;

export const initializeGemini = () => {
  // The API key must be obtained exclusively from the environment variable process.env.API_KEY.
  // Assume this variable is pre-configured, valid, and accessible.
  ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const startNewGame = async (): Promise<string> => {
  if (!ai) initializeGemini();
  if (!ai) throw new Error("AI not initialized");

  try {
    chatSession = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 1.0, // High creativity for persona
      },
    });

    const response = await chatSession.sendMessage({ message: "开始游戏" });
    return response.text || "游戏启动失败，请重试。";
  } catch (error) {
    console.error("Error starting game:", error);
    return "哎呀，点点老师好像掉线了，请检查网络设置哦！(API Error)";
  }
};

export const sendMessageToGemini = async (userMessage: string): Promise<string> => {
  if (!chatSession) {
     // If session lost, try to restart or error
     return "游戏还没开始呢，请刷新页面重新开始！";
  }

  try {
    const response = await chatSession.sendMessage({ message: userMessage });
    return response.text || "点点老师正在思考...";
  } catch (error) {
    console.error("Error sending message:", error);
    return "哎呀，点点老师没有听清楚，再说一遍好吗？(Network Error)";
  }
};

// --- Audio / TTS Logic ---

export const stopAudio = () => {
  latestTTSId++; // Invalidate any pending TTS operations
  if (currentAudioSource) {
    try {
      currentAudioSource.stop();
    } catch (e) {
      // Ignore errors if already stopped
    }
    currentAudioSource.disconnect();
    currentAudioSource = null;
  }
};

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const playTTS = async (text: string, onStart: () => void, onEnd: () => void) => {
  stopAudio(); // Stop any currently playing audio
  const myId = ++latestTTSId;

  if (!ai) initializeGemini();
  if (!ai) {
    onEnd();
    return;
  }

  try {
    // Use Gemini 2.5 Flash TTS
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // 'Kore' is a standard female-sounding voice suitable for a teacher
          },
        },
      },
    });

    // Check if we were cancelled while waiting for network
    if (myId !== latestTTSId) return;

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      console.warn("No audio generated");
      onEnd();
      return;
    }

    // Initialize AudioContext on demand (must be after user interaction in some browsers, but usually fine here)
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const audioBytes = decode(base64Audio);
    const audioBuffer = await decodeAudioData(audioBytes, audioContext);

    // Check cancellation again before playing
    if (myId !== latestTTSId) return;

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    
    source.onended = () => {
      if (myId === latestTTSId) {
        onEnd();
        currentAudioSource = null;
      }
    };

    currentAudioSource = source;
    onStart();
    source.start();

  } catch (error) {
    console.error("TTS Error:", error);
    if (myId === latestTTSId) {
      onEnd();
    }
  }
};