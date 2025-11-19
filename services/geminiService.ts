
import { GoogleGenAI, Chat, Modality } from "@google/genai";
import { VOCABULARY_POOL, generateSystemInstruction } from '../constants';

let chatSession: Chat | null = null;
let ai: GoogleGenAI | null = null;

// API Key Management
const STORAGE_KEY = 'gemini_api_key_v1';
let currentApiKey = localStorage.getItem(STORAGE_KEY) || process.env.API_KEY || '';

export const setApiKey = (key: string) => {
  currentApiKey = key;
  localStorage.setItem(STORAGE_KEY, key);
  ai = null; // Force re-initialization
};

export const getApiKey = () => currentApiKey;

export const hasApiKey = () => !!currentApiKey && currentApiKey.length > 0;

// Audio Context & State
let audioContext: AudioContext | null = null;
// Track all active sources to stop them all at once
const activeSources = new Set<AudioBufferSourceNode>();
// Track the time when the next audio chunk should play to ensure gapless playback
let nextStartTime = 0;
// ID to invalidate old stream processes if interrupted
let latestTTSId = 0;
// Promise chain to ensure audio chunks are scheduled in order, even if fetched in parallel
let audioQueue = Promise.resolve();

export const initializeGemini = () => {
  if (!currentApiKey) {
      console.warn("No API Key found");
      return;
  }
  ai = new GoogleGenAI({ apiKey: currentApiKey });
};

const getRandomWords = (count: number) => {
    // Fisher-Yates shuffle
    const array = [...VOCABULARY_POOL];
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array.slice(0, count);
};

export const startNewGameStream = async function* (): AsyncGenerator<string> {
  if (!ai) initializeGemini();
  if (!ai) {
      yield "请先设置 API Key 哦！(点击右上角齿轮图标)";
      return;
  }

  try {
    const selectedWords = getRandomWords(5);
    const dynamicInstruction = generateSystemInstruction(selectedWords);

    chatSession = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: dynamicInstruction,
        temperature: 1.0,
      },
    });

    const result = await chatSession.sendMessageStream({ message: "开始游戏" });
    for await (const chunk of result) {
        const text = chunk.text;
        if (text) yield text;
    }
  } catch (error) {
    console.error("Error starting game:", error);
    yield "哎呀，点点老师好像掉线了，请检查网络设置或 API Key 哦！";
  }
};

export const sendMessageStream = async function* (userMessage: string) {
  if (!chatSession) throw new Error("Game not started");
  
  try {
    const result = await chatSession.sendMessageStream({ message: userMessage });
    for await (const chunk of result) {
        const text = chunk.text;
        if (text) yield text;
    }
  } catch (error) {
    console.error("Error in stream:", error);
    yield "哎呀，网络好像有点卡！";
  }
};

// --- Image Generation ---
export const generateImage = async (prompt: string): Promise<string | null> => {
  if (!ai) initializeGemini();
  if (!ai) return null;

  try {
    // Remove emojis from prompt for better image generation results
    const cleanPrompt = prompt.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').trim();
    const finalPrompt = `A cute, simple, cartoon illustration of a ${cleanPrompt} for a toddler learning game. White background, bright colors.`;

    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: finalPrompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '1:1',
      },
    });
    
    const base64ImageBytes = response.generatedImages?.[0]?.image?.imageBytes;
    if (base64ImageBytes) {
      return `data:image/jpeg;base64,${base64ImageBytes}`;
    }
    return null;
  } catch (error) {
    console.error("Image generation error:", error);
    return null;
  }
};

// --- Audio / TTS Logic ---

export const stopAudio = () => {
  latestTTSId++; // Increment ID to invalidate any running stream loops
  
  // Reset the queue so new tasks don't wait for cancelled ones
  audioQueue = Promise.resolve();

  // Stop all currently scheduled sources
  for (const source of activeSources) {
    try {
      source.stop();
      source.disconnect();
    } catch (e) {
      // Ignore if already stopped
    }
  }
  activeSources.clear();
  
  // Reset scheduling cursor
  if (audioContext) {
    nextStartTime = 0;
  }
};

export const getAudioEndTime = (): number => {
    if (!audioContext) return 0;
    return nextStartTime;
};

export const getCurrentTime = (): number => {
    if (!audioContext) return 0;
    return audioContext.currentTime;
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

/**
 * Plays TTS. 
 * 1. Starts fetching audio immediately (async).
 * 2. Queues the *scheduling* of that audio to ensure correct playback order.
 */
export const playTTS = (
  text: string, 
  onStart?: () => void, 
  shouldInterrupt: boolean = true
): Promise<void> => {
  if (shouldInterrupt) {
    stopAudio(); 
  }
  
  const myId = latestTTSId;

  if (!ai) initializeGemini();
  if (!ai) return Promise.resolve();

  // 1. Start Network Request IMMEDIATELY
  // This happens outside the queue, so it runs in parallel with previous audio playing.
  const responsePromise = ai.models.generateContentStream({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  // 2. Queue the Processing
  // We chain the *processing* logic to audioQueue. 
  // This ensures that we only decode/schedule THIS audio after the PREVIOUS audio has finished scheduling.
  const processTask = audioQueue.then(async () => {
    // If the global ID changed (user clicked stop/interrupted), abort this task entirely.
    if (myId !== latestTTSId) return;

    try {
        // Initialize AudioContext on demand (must be done inside user interaction flow usually)
        if (!audioContext) {
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        // If we interrupted, or if queue was empty, reset time.
        // Note: audioContext.currentTime progresses constantly.
        // If nextStartTime fell behind (gap in speech), reset it to now.
        if (shouldInterrupt || nextStartTime < audioContext.currentTime) {
            nextStartTime = audioContext.currentTime;
        }

        const responseStream = await responsePromise;
        let isFirstChunk = true;

        for await (const chunk of responseStream) {
            if (myId !== latestTTSId) break;

            const base64Audio = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                const audioBytes = decode(base64Audio);
                const audioBuffer = await decodeAudioData(audioBytes, audioContext);

                if (myId !== latestTTSId) break;

                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContext.destination);

                const startTime = Math.max(nextStartTime, audioContext.currentTime);
                source.start(startTime);
                
                nextStartTime = startTime + audioBuffer.duration;
                activeSources.add(source);

                source.onended = () => {
                    activeSources.delete(source);
                };

                if (isFirstChunk) {
                    if (onStart) onStart();
                    isFirstChunk = false;
                }
            }
        }

    } catch (error) {
        console.error("TTS Streaming Error:", error);
    }
  });

  // Update the global queue reference so the next call waits for this one.
  audioQueue = processTask;
  
  return processTask;
};
