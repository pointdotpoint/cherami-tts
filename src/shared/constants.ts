export const DEFAULT_VOICE = 'en_US-lessac-medium';

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2.0;
export const SPEED_STEP = 0.1;
export const SPEED_DEFAULT = 1.0;

export const MIN_SELECTION_LENGTH = 3;

export const HUGGINGFACE_BASE_URL =
  'https://huggingface.co/rhasspy/piper-voices/resolve/main/';

export const CONTEXT_MENU_ID = 'cherami-tts-speak';

// Curated list of recommended English voices
export interface VoiceInfo {
  id: string;
  name: string;
  quality: string;
  language: string;
  sizeApprox: string;
}

export const AVAILABLE_VOICES: VoiceInfo[] = [
  {
    id: 'en_US-lessac-medium',
    name: 'Lessac (US)',
    quality: 'Medium',
    language: 'en_US',
    sizeApprox: '~63 MB',
  },
  {
    id: 'en_US-lessac-low',
    name: 'Lessac Low (US)',
    quality: 'Low',
    language: 'en_US',
    sizeApprox: '~16 MB',
  },
  {
    id: 'en_US-amy-medium',
    name: 'Amy (US)',
    quality: 'Medium',
    language: 'en_US',
    sizeApprox: '~63 MB',
  },
  {
    id: 'en_US-amy-low',
    name: 'Amy Low (US)',
    quality: 'Low',
    language: 'en_US',
    sizeApprox: '~16 MB',
  },
  {
    id: 'en_US-ryan-medium',
    name: 'Ryan (US)',
    quality: 'Medium',
    language: 'en_US',
    sizeApprox: '~63 MB',
  },
  {
    id: 'en_US-ryan-low',
    name: 'Ryan Low (US)',
    quality: 'Low',
    language: 'en_US',
    sizeApprox: '~16 MB',
  },
  {
    id: 'en_US-joe-medium',
    name: 'Joe (US)',
    quality: 'Medium',
    language: 'en_US',
    sizeApprox: '~63 MB',
  },
  {
    id: 'en_US-kusal-medium',
    name: 'Kusal (US)',
    quality: 'Medium',
    language: 'en_US',
    sizeApprox: '~63 MB',
  },
  {
    id: 'en_GB-alba-medium',
    name: 'Alba (GB)',
    quality: 'Medium',
    language: 'en_GB',
    sizeApprox: '~63 MB',
  },
  {
    id: 'en_GB-jenny_dioco-medium',
    name: 'Jenny Dioco (GB)',
    quality: 'Medium',
    language: 'en_GB',
    sizeApprox: '~63 MB',
  },
];
