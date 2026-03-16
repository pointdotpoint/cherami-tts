import { DEFAULT_VOICE, SPEED_DEFAULT } from './constants.js';

export const STORAGE_KEYS = {
  SELECTED_VOICE: 'selectedVoice',
  SPEED: 'speed',
  NOISE_SCALE: 'noiseScale',
  NOISE_W: 'noiseW',
  VOICE_PROSODY: 'voiceProsody',
} as const;

export interface VoiceProsodyOverrides {
  noiseScale?: number;
  noiseW?: number;
}

export const STORAGE_DEFAULTS = {
  [STORAGE_KEYS.SELECTED_VOICE]: DEFAULT_VOICE,
  [STORAGE_KEYS.SPEED]: SPEED_DEFAULT,
  [STORAGE_KEYS.NOISE_SCALE]: null as number | null,
  [STORAGE_KEYS.NOISE_W]: null as number | null,
  [STORAGE_KEYS.VOICE_PROSODY]: {} as Record<string, VoiceProsodyOverrides>,
};

export async function getSettings(): Promise<{
  selectedVoice: string;
  speed: number;
  noiseScale: number | null;
  noiseW: number | null;
  voiceProsody: Record<string, VoiceProsodyOverrides>;
}> {
  const result = await chrome.storage.sync.get(STORAGE_DEFAULTS);
  return {
    selectedVoice: result[STORAGE_KEYS.SELECTED_VOICE] as string,
    speed: result[STORAGE_KEYS.SPEED] as number,
    noiseScale: result[STORAGE_KEYS.NOISE_SCALE] as number | null,
    noiseW: result[STORAGE_KEYS.NOISE_W] as number | null,
    voiceProsody: (result[STORAGE_KEYS.VOICE_PROSODY] ?? {}) as Record<string, VoiceProsodyOverrides>,
  };
}
