
import React, { useState, useEffect, useRef } from 'react';
import { Message, GameState } from './types';
import { startNewGame, sendMessageToGemini, stopAudio } from './services/geminiService';
import ChatMessage from './components/ChatMessage';
import InputArea from './components/InputArea';
import Celebration from './components/Celebration';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Timer to hide celebration
  useEffect(() => {
    if (showCelebration) {
      const timer = setTimeout(() => setShowCelebration(false), 4500);
      return () => clearTimeout(timer);
    }
  }, [showCelebration]);

  const handleStartGame = async () => {
    setGameState(GameState.PLAYING);
    setIsLoading(true);
    setMessages([]); // Clear history
    setShowCelebration(false);

    try {
      const introText = await startNewGame();
      const newMessage: Message = {
        id: Date.now().toString(),
        role: 'model',
        text: introText, // Intro usually doesn't have [CORRECT]
        timestamp: Date.now(),
      };
      setMessages([newMessage]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    // 1. Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // 2. Get AI response
    try {
      let responseText = await sendMessageToGemini(text);
      
      // Check for [CORRECT] marker
      let isCorrect = false;
      if (responseText.includes('[CORRECT]')) {
        isCorrect = true;
        responseText = responseText.replace('[CORRECT]', '').trim();
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      
      // Trigger celebration after adding message
      if (isCorrect) {
        setShowCelebration(true);
        // Optional: Play a sound effect here if desired
      }
      
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#FFFDF5]">
      {showCelebration && <Celebration />}
      
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-orange-100 py-4 px-4 sticky top-0 z-20 shadow-sm">
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
                setGameState(GameState.IDLE);
              }}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-500 px-3 py-1.5 rounded-full transition-colors font-bold"
            >
              重新开始
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto scrollbar-hide p-4 pb-32 relative">
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
                />
              ))}
              {isLoading && (
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

      {/* Input Area (Sticky Bottom) */}
      {gameState === GameState.PLAYING && (
        <div className="fixed bottom-0 left-0 right-0 z-20">
          <InputArea onSend={handleSendMessage} disabled={isLoading} />
        </div>
      )}
    </div>
  );
};

export default App;