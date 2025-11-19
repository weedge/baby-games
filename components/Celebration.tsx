
import React, { useEffect, useState } from 'react';

const EMOJIS = ['⭐', '🌟', '🎉', '🎈', '🏆', '✨', '🍭', '🌈', '😄'];

const Celebration: React.FC = () => {
  const [particles, setParticles] = useState<any[]>([]);

  useEffect(() => {
    // Create a batch of particles
    const count = 30;
    const newParticles = Array.from({ length: count }).map((_, i) => ({
      id: i,
      left: Math.random() * 100, // Random horizontal position
      emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      duration: 2 + Math.random() * 2, // Random duration between 2-4s
      delay: Math.random() * 1, // Random start delay
      size: 2 + Math.random() * 3, // Random size
    }));
    setParticles(newParticles);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute bottom-0 animate-float-up opacity-0"
          style={{
            left: `${p.left}%`,
            fontSize: `${p.size}rem`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        >
          {p.emoji}
        </div>
      ))}
      
      {/* Central Pop Effect */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none">
         <div className="animate-bounce text-6xl md:text-8xl filter drop-shadow-lg">
            🤩
         </div>
         <div className="text-4xl md:text-6xl font-black text-orange-500 mt-4 animate-pulse shadow-orange-200 drop-shadow-md bg-white/80 px-6 py-2 rounded-full backdrop-blur-sm">
            太棒了！
         </div>
      </div>
    </div>
  );
};

export default Celebration;
