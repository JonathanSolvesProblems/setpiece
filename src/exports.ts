/**
 * What the director walks away with: the board as a picture, the shot list as a
 * spreadsheet, and the take as a moving animatic. All three are made here in the
 * browser from the frames and poses on the set; nothing leaves the machine until
 * the file is saved.
 */
import type { Shot, ViewfinderSystem } from './viewfinder.js';

const ANIMATIC_RATE = 24;

function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function downloadBoard(viewfinder: ViewfinderSystem): void {
  viewfinder.boardPicture().toBlob((blob) => {
    if (blob) save(blob, 'setpiece-board.png');
  }, 'image/png');
}

const field = (value: string | number): string => `"${String(value).replace(/"/g, '""')}"`;

export function downloadShotList(shots: readonly Shot[]): void {
  const head = ['Frame', 'Lens mm', 'Format', 'Camera height m', 'Distance to creature m', 'Eyelines', 'Printed as'];
  const rows = shots.map((shot) =>
    [
      shot.index,
      shot.lensMm,
      shot.format ?? 'FF',
      shot.cameraHeightM.toFixed(2),
      shot.distanceToCreatureM.toFixed(2),
      shot.eyelines,
      shot.printed ?? '',
    ]
      .map(field)
      .join(','),
  );
  save(new Blob([[head.map(field).join(','), ...rows].join('\r\n') + '\r\n'], { type: 'text/csv' }), 'setpiece-shot-list.csv');
}

/** The first video type this browser can record. */
function videoType(): string | null {
  for (const type of ['video/webm;codecs=vp9', 'video/webm', 'video/mp4']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

export const canRecordVideo = (): boolean => videoType() != null;

/**
 * Plays the take once and films the monitor. `play` starts playback; the take
 * runs in real time, so this resolves when it has played through.
 */
export async function downloadAnimatic(viewfinder: ViewfinderSystem, seconds: number, play: () => void, stop: () => void): Promise<void> {
  const type = videoType();
  if (type == null) return;
  const canvas = document.createElement('canvas');
  const stream = canvas.captureStream(ANIMATIC_RATE);
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4_000_000 });
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const finished = new Promise<void>((done) => {
    recorder.onstop = () => done();
  });
  viewfinder.copyMonitor(canvas);
  play();
  recorder.start();
  const end = performance.now() + seconds * 1000;
  await new Promise<void>((done) => {
    const tick = (): void => {
      viewfinder.copyMonitor(canvas);
      if (performance.now() < end) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await finished;
  stop();
  save(new Blob(chunks, { type }), `setpiece-animatic.${type.includes('mp4') ? 'mp4' : 'webm'}`);
}
