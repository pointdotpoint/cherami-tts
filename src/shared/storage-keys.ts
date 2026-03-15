import { DEFAULT_VOICE, SPEED_DEFAULT } from './constants.js';

export const STORAGE_KEYS = {
  SELECTED_VOICE: 'selectedVoice',
  SPEED: 'speed',
} as const;

export const STORAGE_DEFAULTS = {
  [STORAGE_KEYS.SELECTED_VOICE]: DEFAULT_VOICE,
  [STORAGE_KEYS.SPEED]: SPEED_DEFAULT,
} as const;

export async function getSettings(): Promise<{
  selectedVoice: string;
  speed: number;
}> {
  const result = await chrome.storage.sync.get(STORAGE_DEFAULTS);
  return {
    selectedVoice: result[STORAGE_KEYS.SELECTED_VOICE] as string,
    speed: result[STORAGE_KEYS.SPEED] as number,
  };
}
