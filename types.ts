
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  imageUrl?: string;
}

export enum GameState {
  IDLE = 'IDLE',
  PLAYING = 'PLAYING',
  FINISHED = 'FINISHED',
}

export interface ChatConfig {
  apiKey: string;
}
