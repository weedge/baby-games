import React, { useEffect, useState } from 'react';
import { Message } from '../types';
import { playTTS, stopAudio } from '../services/geminiService';

interface ChatMessageProps {
  message: Message;
  isLatest: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isLatest }) => {
  const isUser = message.role === 'user';
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Auto-speak for Diandian teacher's messages if it's the latest one
  useEffect(() => {
    let isActive = true;

    if (!isUser && isLatest) {
      playTTS(
        message.text,
        () => {
          if (isActive) setIsSpeaking(true);
        },
        () => {
          if (isActive) setIsSpeaking(false);
        }
      );
    } else {
      setIsSpeaking(false);
    }

    return () => {
      isActive = false;
    };
  }, [isUser, isLatest, message.text]);

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] md:max-w-[70%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
        
        {/* Avatar */}
        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center flex-shrink-0 text-2xl shadow-md border-2 border-white
          ${isUser ? 'bg-blue-400' : 'bg-orange-400'}`}>
          {isUser ? '👶' : '👩‍🏫'}
        </div>

        {/* Bubble */}
        <div
          className={`relative px-5 py-3 md:px-6 md:py-4 text-lg md:text-xl rounded-2xl shadow-sm leading-relaxed transition-all duration-300
          ${isUser 
            ? 'bg-blue-500 text-white rounded-br-none' 
            : `bg-white text-gray-800 rounded-bl-none border border-orange-100 ${isSpeaking ? 'ring-4 ring-orange-200 border-orange-300 shadow-lg scale-[1.02]' : ''}`
          }`}
        >
          {message.text}
          
          {/* Speaking Indicator */}
          {!isUser && isSpeaking && (
            <div className="absolute -right-1 -top-1 w-3 h-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;