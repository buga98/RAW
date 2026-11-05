import path from 'node:path';

const AUDIO_EXTENSIONS = new Set(['.wav', '.wave', '.aif', '.aiff', '.mp3']);

export function safeFolderName(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) {
    throw new Error('Neispravan userId ili sessionId.');
  }
  return value;
}

export function safeAudioFilename(value) {
  if (typeof value !== 'string') throw new Error('Nedostaje ime datoteke.');
  const basename = path.win32.basename(value.replaceAll('/', '\\'));
  const extension = path.extname(basename).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(extension)) {
    throw new Error('Dopušteni su samo WAV, AIFF i MP3 formati.');
  }
  const cleaned = basename.replace(/[^a-zA-Z0-9. _-]/g, '_').slice(-140);
  if (!cleaned || cleaned === '.' || cleaned === '..') throw new Error('Neispravno ime datoteke.');
  return cleaned;
}
