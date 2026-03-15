let currentAudio: HTMLAudioElement | null = null;
let currentBlobUrl: string | null = null;

export function playAudio(wavBlob: Blob, onEnded: () => void): void {
  stop();

  currentBlobUrl = URL.createObjectURL(wavBlob);
  currentAudio = new Audio(currentBlobUrl);
  currentAudio.addEventListener('ended', () => {
    cleanup();
    onEnded();
  });
  currentAudio.addEventListener('error', () => {
    cleanup();
    onEnded();
  });
  currentAudio.play();
}

export function stop(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    cleanup();
  }
}

function cleanup(): void {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
  currentAudio = null;
}

export function isPlaying(): boolean {
  return currentAudio !== null && !currentAudio.paused;
}
