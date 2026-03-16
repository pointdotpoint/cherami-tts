export enum MessageType {
  // Content script → Service worker → Offscreen
  SPEAK = 'SPEAK',
  STOP = 'STOP',

  // Offscreen → Service worker → Content script
  TTS_STATE = 'TTS_STATE',

  // Options ↔ Service worker ↔ Offscreen (voice management)
  DOWNLOAD_VOICE = 'DOWNLOAD_VOICE',
  DOWNLOAD_PROGRESS = 'DOWNLOAD_PROGRESS',
  REMOVE_VOICE = 'REMOVE_VOICE',
  LIST_CACHED_VOICES = 'LIST_CACHED_VOICES',
  LIST_CACHED_VOICES_RESULT = 'LIST_CACHED_VOICES_RESULT',

  // Content script → Service worker
  OPEN_OPTIONS = 'OPEN_OPTIONS',

  // Service worker → Offscreen (lifecycle)
  INIT_ENGINE = 'INIT_ENGINE',
  ENGINE_READY = 'ENGINE_READY',
}

export enum TtsState {
  LOADING = 'LOADING',
  SPEAKING = 'SPEAKING',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR',
  IDLE = 'IDLE',
}

export interface SpeakMessage {
  type: MessageType.SPEAK;
  text: string;
  voiceId: string;
  speed: number;
  noiseScale?: number;
  noiseW?: number;
}

export interface StopMessage {
  type: MessageType.STOP;
}

export interface TtsStateMessage {
  type: MessageType.TTS_STATE;
  state: TtsState;
  error?: string;
}

export interface DownloadVoiceMessage {
  type: MessageType.DOWNLOAD_VOICE;
  voiceId: string;
}

export interface DownloadProgressMessage {
  type: MessageType.DOWNLOAD_PROGRESS;
  voiceId: string;
  progress: number; // 0-100
  done: boolean;
  error?: string;
}

export interface RemoveVoiceMessage {
  type: MessageType.REMOVE_VOICE;
  voiceId: string;
}

export interface ListCachedVoicesMessage {
  type: MessageType.LIST_CACHED_VOICES;
}

export interface ListCachedVoicesResultMessage {
  type: MessageType.LIST_CACHED_VOICES_RESULT;
  voices: string[];
}

export interface OpenOptionsMessage {
  type: MessageType.OPEN_OPTIONS;
}

export interface InitEngineMessage {
  type: MessageType.INIT_ENGINE;
}

export interface EngineReadyMessage {
  type: MessageType.ENGINE_READY;
}

export type ExtensionMessage =
  | SpeakMessage
  | StopMessage
  | TtsStateMessage
  | DownloadVoiceMessage
  | DownloadProgressMessage
  | RemoveVoiceMessage
  | ListCachedVoicesMessage
  | ListCachedVoicesResultMessage
  | OpenOptionsMessage
  | InitEngineMessage
  | EngineReadyMessage;
