import React from 'react';
import { Message } from '../types';

interface ChatMessageProps {
  message: Message;
  isLatest: boolean;
  isSpeaking?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isLatest, isSpeaking = false }) => {
  const isUser = message.role === 'user';
  const showSpeakingVisuals = !isUser && isLatest && isSpeaking;

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] md:max-w-[70%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
        
        {/* Avatar */}
        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center flex-shrink-0 text-2xl shadow-md border-2 border-white transition-transform duration-300 ease-in-out
          ${isUser ? 'bg-blue-400' : 'bg-orange-400'} 
          ${showSpeakingVisuals ? 'scale-110 ring-2 ring-orange-200' : ''}`}>
          {isUser ? '👶' : '👩‍🏫'}
        </div>

        {/* Bubble */}
        <div
          className={`relative px-5 py-3 md:px-6 md:py-4 text-lg md:text-xl rounded-2xl shadow-sm leading-relaxed transition-all duration-300 border
          ${isUser 
            ? 'bg-blue-500 text-white rounded-br-none border-blue-500' 
            : `bg-white text-gray-800 rounded-bl-none ${showSpeakingVisuals ? 'speaking-active' : 'border-orange-100'}`
          }`}
        >
          {message.text}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;