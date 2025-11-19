import React, { useState, useEffect } from 'react';
import { stopAudio } from '../services/geminiService';

interface InputAreaProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

const InputArea: React.FC<InputAreaProps> = ({ onSend, disabled }) => {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    // Setup Speech Recognition if available
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.lang = 'zh-CN';
      rec.continuous = false;
      rec.interimResults = false;

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(transcript);
        setIsListening(false);
        // Optional: Auto-send on voice result
        // onSend(transcript);
      };

      rec.onerror = () => {
        setIsListening(false);
      };
      
      rec.onend = () => {
        setIsListening(false);
      };

      setRecognition(rec);
    }
  }, []);

  const handleSend = () => {
    if (inputText.trim()) {
      stopAudio(); // Stop teacher speaking when user sends text
      onSend(inputText);
      setInputText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const toggleListening = () => {
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      stopAudio(); // Stop teacher speaking when user starts microphone
      recognition.start();
      setIsListening(true);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-4 bg-white/80 backdrop-blur-sm rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)] border-t border-orange-100">
      <div className="flex items-center gap-3">
        {/* Microphone Button */}
        {recognition && (
          <button
            onClick={toggleListening}
            disabled={disabled}
            className={`p-4 rounded-full transition-all duration-300 shadow-sm flex-shrink-0
              ${isListening 
                ? 'bg-red-500 text-white animate-pulse scale-110' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } disabled:opacity-50`}
            title="按住说话"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 1.5a3 3 0 013 3v1.5a3 3 0 01-6 0v-1.5a3 3 0 013-3z" />
            </svg>
          </button>
        )}

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "点点老师正在说话..." : "猜猜是什么？(输入或说话)"}
          disabled={disabled}
          className="flex-1 bg-gray-50 text-gray-800 rounded-full px-6 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-orange-300 border-2 border-transparent focus:border-orange-300 transition-all shadow-inner"
        />

        <button
          onClick={handleSend}
          disabled={disabled || !inputText.trim()}
          className={`p-4 rounded-full bg-orange-500 text-white shadow-lg shadow-orange-200 transition-all duration-200 hover:bg-orange-600 active:scale-95 disabled:opacity-50 disabled:scale-100 flex-shrink-0`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default InputArea;