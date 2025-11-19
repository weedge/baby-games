
import React, { useState, useEffect, useRef } from 'react';
import { Message, GameState } from './types';
import { startNewGameStream, sendMessageStream, stopAudio, playTTS, getAudioEndTime, getCurrentTime } from './services/geminiService';
import ChatMessage from './components/ChatMessage';
import InputArea from './components/InputArea';
import Celebration from './components/Celebration';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Increments on every interruption to invalidate old stream processing loops in App.tsx
  const streamSequenceId = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Timer to hide celebration
  useEffect(() => {
    if (showCelebration) {
      const timer = setTimeout(() => setShowCelebration(false), 4500);
      return () => clearTimeout(timer);
    }
  }, [showCelebration]);

  const processStream = async (stream: AsyncGenerator<string>, messageId: string) => {
    // 1. Reset state for new turn
    streamSequenceId.current++; 
    const mySeqId = streamSequenceId.current;
    
    let fullText = "";
    let buffer = "";
    let isFirstSentence = true;
    let isCorrectFound = false;

    // Track all TTS scheduling promises for this turn
    const ttsPromises: Promise<void>[] = [];

    try {
      for await (const chunk of stream) {
        if (mySeqId !== streamSequenceId.current) break;

        fullText += chunk;

        // UI Update Logic (stripping [CORRECT])
        let displayText = fullText;
        if (displayText.includes('[CORRECT]')) {
            isCorrectFound = true;
            displayText = displayText.replace('[CORRECT]', '').trimStart();
        }
        
        setMessages((prev) => prev.map(m => 
          m.id === messageId ? { ...m, text: displayText } : m
        ));
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
            
            const ttsText = sentence.replace('[CORRECT]', '').trim();
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
      const remainder = buffer.replace('[CORRECT]', '').trim();
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
        role: 'model',
        text: '',
        timestamp: Date.now(),
      };
      setMessages([initialMessage]);

      const stream = startNewGameStream();
      await processStream(stream, msgId);
      
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { id: 'err', role: 'model', text: '哎呀，点点老师好像掉线了，请检查网络设置哦！', timestamp: Date.now() }]);
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    // Interruption
    stopAudio();
    setIsSpeaking(false);
    streamSequenceId.current++;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const aiMsgId = (Date.now() + 1).toString();
    const aiMsg: Message = {
      id: aiMsgId,
      role: 'model',
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

  return (
    <div className="flex flex-col h-full bg-[#FFFDF5]">
      {showCelebration && <Celebration />}
      
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-orange-100 py-4 px-4 sticky top-0 z-30 shadow-sm flex-shrink-0">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-3xl">🕵️‍♀️</span>
            <h1 className="text-2xl font-black text-orange-500 tracking-wide">
              单词小侦探
            </h1>
          </div>
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
                你好呀！<br/>我是<span className="text-orange-500">点点老师</span>
              </h2>
              <p className="text-lg text-gray-600 mb-10 max-w-md">
                我们一起来玩一个有趣的猜词游戏吧！我会描述一个东西，看看你能不能猜到它是谁！✨
              </p>
              <button
                onClick={handleStartGame}
                disabled={isLoading}
                className="bg-gradient-to-r from-orange-400 to-pink-500 text-white text-2xl font-black py-4 px-12 rounded-full shadow-xl hover:scale-105 hover:shadow-2xl transition-all duration-300 active:scale-95"
              >
                {isLoading ? '准备中...' : '开始游戏 🚀'}
              </button>
            </div>
          )}

          {gameState === GameState.PLAYING && (
            <div className="flex flex-col justify-end min-h-0">
              {messages.map((msg, index) => (
                <ChatMessage 
                  key={msg.id} 
                  message={msg} 
                  isLatest={index === messages.length - 1}
                  isSpeaking={index === messages.length - 1 && isSpeaking}
                />
              ))}
              {isLoading && messages[messages.length - 1]?.text === "" && (
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
          <InputArea onSend={handleSendMessage} disabled={isLoading && !isSpeaking} />
        </div>
      )}
    </div>
  );
};

export default App;
