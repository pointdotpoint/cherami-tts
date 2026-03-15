import { TtsState } from '../shared/messages.js';
import popupStyles from './popup-styles.css?raw';

const SPEAK_ICON = `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8.5v7a4.47 4.47 0 0 0 2.5-3.5zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06A9 9 0 0 0 14 3.23z"/></svg>`;
const STOP_ICON = `<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;

export class FloatingPopup {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private container: HTMLElement | null = null;
  private state: TtsState = TtsState.IDLE;
  private onSpeak: (() => void) | null = null;
  private onStop: (() => void) | null = null;

  constructor() {
    this.host = document.createElement('cherami-tts-popup');
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = popupStyles;
    this.shadow.appendChild(style);

    this.container = document.createElement('div');
    this.container.className = 'popup';
    this.container.style.display = 'none';
    this.shadow.appendChild(this.container);

    document.body.appendChild(this.host);

    // Prevent clicks on popup from clearing selection
    this.host.addEventListener('mousedown', (e) => e.preventDefault());
  }

  show(rect: DOMRect, onSpeak: () => void, onStop: () => void) {
    this.onSpeak = onSpeak;
    this.onStop = onStop;
    this.state = TtsState.IDLE;

    this.position(rect);
    this.render();
    this.container!.style.display = 'flex';
  }

  hide() {
    this.container!.style.display = 'none';
    this.state = TtsState.IDLE;
    this.onSpeak = null;
    this.onStop = null;
  }

  updateState(state: TtsState, error?: string) {
    this.state = state;
    this.render();

    // Auto-hide after speech finishes or stops
    if (state === TtsState.IDLE || state === TtsState.STOPPED) {
      setTimeout(() => this.hide(), 300);
    }
    // Auto-hide errors after a delay
    if (state === TtsState.ERROR) {
      setTimeout(() => this.hide(), 3000);
    }
  }

  get isVisible(): boolean {
    return this.container!.style.display !== 'none';
  }

  private position(rect: DOMRect) {
    const popupWidth = 80;
    let left = rect.left + rect.width / 2 - popupWidth / 2 + window.scrollX;
    let top = rect.bottom + 8 + window.scrollY;

    // Keep within viewport horizontally
    const maxLeft = window.scrollX + window.innerWidth - popupWidth - 8;
    left = Math.max(window.scrollX + 8, Math.min(left, maxLeft));

    this.host.style.position = 'absolute';
    this.host.style.left = `${left}px`;
    this.host.style.top = `${top}px`;
    this.host.style.zIndex = '2147483647';
  }

  private render() {
    if (!this.container) return;

    switch (this.state) {
      case TtsState.IDLE:
        this.container.innerHTML = '';
        const speakBtn = document.createElement('button');
        speakBtn.title = 'Speak selected text';
        speakBtn.innerHTML = SPEAK_ICON;
        speakBtn.addEventListener('click', () => this.onSpeak?.());
        this.container.appendChild(speakBtn);
        break;

      case TtsState.LOADING:
        this.container.innerHTML = '';
        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        this.container.appendChild(spinner);
        const loadingStatus = document.createElement('span');
        loadingStatus.className = 'status';
        loadingStatus.textContent = 'Loading...';
        this.container.appendChild(loadingStatus);
        break;

      case TtsState.SPEAKING:
        this.container.innerHTML = '';
        const stopBtn = document.createElement('button');
        stopBtn.className = 'speaking';
        stopBtn.title = 'Stop speaking';
        stopBtn.innerHTML = STOP_ICON;
        stopBtn.addEventListener('click', () => this.onStop?.());
        this.container.appendChild(stopBtn);
        break;

      case TtsState.ERROR:
        this.container.innerHTML = '';
        const errSpan = document.createElement('span');
        errSpan.className = 'status error';
        errSpan.textContent = 'TTS error';
        this.container.appendChild(errSpan);
        break;
    }
  }
}
