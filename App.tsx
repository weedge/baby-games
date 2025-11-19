import React, { useState, useEffect, useRef } from "react";
import { Message, GameState } from "./types";
import {
  startNewGameStream,
  sendMessageStream,
  stopAudio,
  playTTS,
  getAudioEndTime,
  getCurrentTime,
  setApiKey,
  getApiKey,
  hasApiKey,
  generateImage,
  unlockAudioContext,
} from "./services/geminiService";
import ChatMessage from "./components/ChatMessage";
import InputArea from "./components/InputArea";
import Celebration from "./components/Celebration";

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");

  // Increments on every interruption to invalidate old stream processing loops in App.tsx
  const streamSequenceId = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Load API Key on mount
  useEffect(() => {
    setApiKeyInput(getApiKey());
  }, []);

  // Timer to hide celebration
  useEffect(() => {
    if (showCelebration) {
      const timer = setTimeout(() => setShowCelebration(false), 4500);
      return () => clearTimeout(timer);
    }
  }, [showCelebration]);

  const processStream = async (
    stream: AsyncGenerator<string>,
    messageId: string
  ) => {
    // 1. Reset state for new turn
    streamSequenceId.current++;
    const mySeqId = streamSequenceId.current;

    let fullText = "";
    let buffer = "";
    let isFirstSentence = true;
    let isCorrectFound = false;
    let imageTriggered = false;

    // Track all TTS scheduling promises for this turn
    const ttsPromises: Promise<void>[] = [];

    try {
      for await (const chunk of stream) {
        if (mySeqId !== streamSequenceId.current) break;

        fullText += chunk;

        // UI Update Logic (stripping [CORRECT] and [IMAGE:...])
        let displayText = fullText;

        // Handle [IMAGE: ...] tag
        const imageRegex = /\[IMAGE:\s*(.*?)\]/;
        const imageMatch = displayText.match(imageRegex);

        if (imageMatch) {
          // Only trigger image generation once per message if tag is found
          if (!imageTriggered) {
            imageTriggered = true;
            const wordToGen = imageMatch[1];
            // Run generation in background
            generateImage(wordToGen).then((url) => {
              if (url && mySeqId === streamSequenceId.current) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === messageId ? { ...m, imageUrl: url } : m
                  )
                );
              }
            });
          }
          // Remove the tag from display
          displayText = displayText.replace(imageRegex, "");
        }

        if (displayText.includes("[CORRECT]")) {
          isCorrectFound = true;
          displayText = displayText.replace("[CORRECT]", "").trimStart();
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, text: displayText } : m
          )
        );
        setIsLoading(false);

        // TTS Buffering Logic
        buffer += chunk;
        const delimiters = /([。！？!?.])/g;
        let match;
        let lastIndex = -1;

        // Find all sentence boundaries
        while ((match = delimiters.exec(buffer)) !== null) {
          lastIndex = match.index;
        }

        if (lastIndex !== -1) {
          const sentence = buffer.substring(0, lastIndex + 1);
          buffer = buffer.substring(lastIndex + 1);

          // Clean text for TTS (remove tags)
          const ttsText = sentence
            .replace("[CORRECT]", "")
            .replace(/\[IMAGE:.*?\]/, "")
            .trim();
          if (ttsText) {
            // Fire TTS request immediately.
            // The service handles the queueing of playback order.
            const p = playTTS(
              ttsText,
              () => {
                if (mySeqId === streamSequenceId.current) setIsSpeaking(true);
              },
              isFirstSentence // Only interrupt on the very first sentence of the turn
            );
            ttsPromises.push(p);
            isFirstSentence = false;
          }
        }
      }

      // Flush remaining text in buffer
      const remainder = buffer
        .replace("[CORRECT]", "")
        .replace(/\[IMAGE:.*?\]/, "")
        .trim();
      if (remainder && mySeqId === streamSequenceId.current) {
        const p = playTTS(
          remainder,
          () => {
            if (mySeqId === streamSequenceId.current) setIsSpeaking(true);
          },
          isFirstSentence
        );
        ttsPromises.push(p);
      }

      // Logic to turn OFF isSpeaking when audio finishes
      // We wait for all TTS *scheduling* to complete (meaning we know the audio duration)
      Promise.all(ttsPromises).then(() => {
        if (mySeqId !== streamSequenceId.current) return;

        const endTime = getAudioEndTime();
        const currentTime = getCurrentTime();
        const timeRemaining = Math.max(0, (endTime - currentTime) * 1000);

        // Add a small buffer to ensure we don't stop visual before audio ends
        const delay = timeRemaining + 200;

        setTimeout(() => {
          if (mySeqId === streamSequenceId.current) {
            setIsSpeaking(false);
          }
        }, delay);
      });
    } catch (e) {
      console.error("Stream processing error", e);
    }

    return isCorrectFound;
  };

  const handleStartGame = async () => {
    // CRITICAL FOR MOBILE: Unlock audio immediately on user interaction
    await unlockAudioContext();

    if (!hasApiKey()) {
      setShowSettings(true);
      return;
    }

    setGameState(GameState.PLAYING);
    setIsLoading(true);
    setMessages([]);
    setShowCelebration(false);
    setIsSpeaking(false);

    // Cancel any existing audio immediately
    stopAudio();
    streamSequenceId.current++;

    try {
      const msgId = Date.now().toString();
      const initialMessage: Message = {
        id: msgId,
        role: "model",
        text: "",
        timestamp: Date.now(),
      };
      setMessages([initialMessage]);

      const stream = startNewGameStream();
      await processStream(stream, msgId);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          id: "err",
          role: "model",
          text: "哎呀，点点老师好像掉线了，请检查网络设置哦！",
          timestamp: Date.now(),
        },
      ]);
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    // CRITICAL FOR MOBILE: Unlock audio immediately on user interaction
    await unlockAudioContext();

    if (!text.trim()) return;

    // Interruption
    stopAudio();
    setIsSpeaking(false);
    streamSequenceId.current++;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const aiMsgId = (Date.now() + 1).toString();
    const aiMsg: Message = {
      id: aiMsgId,
      role: "model",
      text: "",
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, aiMsg]);

    try {
      const stream = sendMessageStream(text);
      const isCorrect = await processStream(stream, aiMsgId);

      if (isCorrect && !showCelebration) {
        setShowCelebration(true);
      }
    } catch (error) {
      console.error(error);
      setIsLoading(false);
    }
  };

  const handleSaveSettings = () => {
    setApiKey(apiKeyInput.trim());
    setShowSettings(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#FFFDF5]">
      {showCelebration && <Celebration />}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 md:p-8 transform transition-all scale-100">
            <h3 className="text-2xl font-black text-orange-500 mb-4 flex items-center gap-2">
              ⚙️ 设置 (Settings)
            </h3>
            <p className="text-gray-600 mb-4">
              为了让点点老师和你说话，需要填入 Google Gemini API Key 哦！
            </p>

            <label className="block text-sm font-bold text-gray-700 mb-2">
              API Key
            </label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="AIza..."
              className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-lg rounded-xl focus:ring-orange-500 focus:border-orange-500 block p-3 mb-2"
            />
            <div className="text-right mb-6">
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-sm text-orange-500 hover:underline"
              >
                获取 API Key &rarr;
              </a>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowSettings(false)}
                className="px-5 py-2.5 rounded-xl text-gray-500 hover:bg-gray-100 font-bold transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-md transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-orange-100 py-4 px-4 sticky top-0 z-30 shadow-sm flex-shrink-0">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-3xl">🕵️‍♀️</span>
            <h1 className="text-2xl font-black text-orange-500 tracking-wide">
              单词小侦探
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {gameState === GameState.PLAYING && (
              <button
                onClick={() => {
                  stopAudio();
                  streamSequenceId.current++;
                  setGameState(GameState.IDLE);
                  setIsSpeaking(false);
                }}
                className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-500 px-3 py-1.5 rounded-full transition-colors font-bold"
              >
                重新开始
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="设置 API Key"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto scrollbar-hide p-4 relative">
        <div className="max-w-3xl mx-auto h-full">
          {gameState === GameState.IDLE && (
            <div className="h-full flex flex-col items-center justify-center text-center animate-fade-in p-6">
              <div className="w-32 h-32 bg-orange-100 rounded-full flex items-center justify-center text-6xl mb-8 animate-bounce shadow-lg">
                👩‍🏫
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-gray-800 mb-6 leading-tight">
                你好呀！
                <br />
                我是<span className="text-orange-500">点点老师</span>
              </h2>
              <p className="text-lg text-gray-600 mb-10 max-w-md">
                我们一起来玩一个有趣的猜词游戏吧！我会描述一个东西，看看你能不能猜到它是谁！✨
              </p>
              <button
                onClick={handleStartGame}
                disabled={isLoading}
                className="bg-gradient-to-r from-orange-400 to-pink-500 text-white text-2xl font-black py-4 px-12 rounded-full shadow-xl hover:scale-105 hover:shadow-2xl transition-all duration-300 active:scale-95"
              >
                {isLoading ? "准备中..." : "开始游戏 🚀"}
              </button>
            </div>
          )}

          {gameState === GameState.PLAYING && (
            <div className="flex flex-col justify-end min-h-0">
              {messages.map((msg, index) => {
                // Logic to hide empty placeholder during loading state
                if (
                  isLoading &&
                  msg.role === "model" &&
                  !msg.text &&
                  !msg.imageUrl &&
                  index === messages.length - 1
                ) {
                  return null;
                }
                return (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    isLatest={index === messages.length - 1}
                    isSpeaking={index === messages.length - 1 && isSpeaking}
                  />
                );
              })}
              {isLoading &&
                (!messages.length ||
                  messages[messages.length - 1]?.text === "") && (
                  <div className="flex w-full mb-6 justify-start animate-pulse">
                    <div className="flex max-w-[70%] flex-row items-end gap-2">
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-orange-400 flex items-center justify-center text-2xl border-2 border-white">
                        👩‍🏫
                      </div>
                      <div className="bg-white px-5 py-3 rounded-2xl rounded-bl-none text-gray-400 text-lg shadow-sm border border-orange-100">
                        正在想... 🤔
                      </div>
                    </div>
                  </div>
                )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* Input Area */}
      {gameState === GameState.PLAYING && (
        <div className="w-full z-20 bg-[#FFFDF5] flex-shrink-0 pb-safe">
          <InputArea
            onSend={handleSendMessage}
            disabled={isLoading && !isSpeaking}
          />
        </div>
      )}
    </div>
  );
};

export default App;
