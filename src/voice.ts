/**
 * Speech to text on the device. The headset's browser has no speech
 * recognition of its own and this site has no server, so the recogniser is
 * Vosk compiled to WebAssembly with a small English model, both served from
 * public/voice/. Nothing spoken leaves the headset.
 *
 * Nothing here loads until start() is first called. The recogniser runs in a
 * worker and the microphone is read on the audio thread, so the page that
 * draws the frames only passes a tenth of a second of sound along, ten times
 * a second, and only during a request.
 *
 * What this cannot do: hear a word the model does not know. With a word list
 * such a word comes back as "[unk]"; without one it comes back as the nearest
 * word the model has.
 */

export type VoiceState = 'idle' | 'loading' | 'listening' | 'thinking' | 'error';

export type VoiceOptions = {
  onState(state: VoiceState, detail?: string): void;
  /** How much of the model has arrived, 0 to 1. Only called while it downloads. */
  onProgress?(fraction: number): void;
  /** What has been heard so far, and once more with `final` when the listening is over. */
  onText(text: string, final: boolean): void;
  /**
   * The only words to listen for. With a fixed set of names this is both
   * faster and far more accurate than open dictation. Leave it out to hear anything.
   */
  words?: string[];
};

/**
 * A gzipped tar of the model folder. It is named .bin so that no host serves it
 * with a gzip content encoding: the browser would unpack it on the way in, and
 * the byte count the progress is worked out from would no longer match.
 */
const MODEL_FILE = 'voice/vosk-model-small-en-us-0.15.bin';
const WORKER_FILE = 'voice/recogniser.js';
const CAPTURE_NAME = 'setpiece-capture';
/** The model was trained on 16 kHz sound; asking the browser for that rate saves resampling in the worker. */
const MODEL_RATE = 16000;
/** A sample this far from zero counts as sound for `lastSoundAt`. */
const LOUD = 0.02;
/** After the recogniser hears a pause, wait this long for the sentence to go on before calling it done. */
const GRACE_MS = 500;
/** Give up when nothing at all has been heard for this long. */
const NO_SPEECH_MS = 8000;
/** The longest one request may run. */
const MAX_LISTEN_MS = 30000;
/** How long to wait for the last words after stop(). */
const FLUSH_MS = 4000;
/** Sound kept while the model loads, in tenths of a second. Older sound is let go. */
const KEPT_CHUNKS = 150;

/**
 * Runs on the audio thread. Gathers a tenth of a second of microphone sound,
 * scaled to the 16-bit range the recogniser expects, and posts it with the
 * place of its last loud sample. Any message to it empties what it has
 * gathered, so a new request does not begin with the tail of the last one.
 */
const CAPTURE_SOURCE = `
class SetpieceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.round(sampleRate / 10);
    this.chunk = new Float32Array(this.size);
    this.filled = 0;
    this.loud = -1;
    this.port.onmessage = () => {
      this.filled = 0;
      this.loud = -1;
    };
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      const value = input[i];
      if (value > ${LOUD} || value < -${LOUD}) this.loud = this.filled;
      this.chunk[this.filled++] = value * 32768;
      if (this.filled === this.size) {
        this.port.postMessage({ samples: this.chunk, loud: this.loud }, [this.chunk.buffer]);
        this.chunk = new Float32Array(this.size);
        this.filled = 0;
        this.loud = -1;
      }
    }
    return true;
  }
}
registerProcessor('${CAPTURE_NAME}', SetpieceCapture);
`;

type Chunk = { samples: Float32Array; loud: number };

/** What the worker sends back. Every sound chunk and every request for the last words is answered once, in order. */
type WorkerMessage =
  | { event: 'progress'; loaded: number; total: number }
  | { event: 'load'; result: boolean }
  | { event: 'error'; recognizerId?: string; error: string }
  | { event: 'partialresult'; recognizerId: string; result: { partial: string } }
  | { event: 'result'; recognizerId: string; result: { text: string } };

const join = (a: string, b: string): string => (a && b ? `${a} ${b}` : a || b);

const fileUrl = (path: string): string => new URL(`${import.meta.env.BASE_URL}${path}`, location.href).href;

function microphoneSentence(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'The microphone is blocked for this site. Allow it in the browser, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found.';
  if (name === 'NotReadableError') return 'The microphone is in use by something else.';
  return 'The microphone could not be started.';
}

export class Voice {
  /**
   * When the microphone last carried sound loud enough to be speech, on the
   * performance.now() clock; 0 until then. Good for a "hearing you" light, and
   * for timing how long the words take to arrive after the talking stops.
   */
  lastSoundAt = 0;

  private readonly options: VoiceOptions;
  private state: VoiceState = 'idle';
  private disposed = false;
  /** Goes up whenever a start is abandoned, so work still in flight for it knows to drop out. */
  private run = 0;

  private worker: Worker | null = null;
  private loaded: Promise<void> | null = null;
  private settleLoad: { resolve(): void; reject(reason: Error): void } | null = null;

  private context: AudioContext | null = null;
  private captureReady: Promise<void> | null = null;
  /** One capture node for the life of the audio context. A node per request would never be let go by the audio thread. */
  private capture: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private rate = MODEL_RATE;
  /** Sound that arrived while the model was still loading, oldest first. */
  private kept: Float32Array[] = [];

  /** The recogniser of the request being heard; each request gets its own, so late answers to an old one are told apart. */
  private recogniser: string | null = null;
  private recognisers = 0;
  /** Chunks sent and not yet answered. */
  private unanswered = 0;
  private flushing = false;
  private heard = '';
  private reported = '';

  /** Timers, 0 when not running. */
  private graceTimer = 0;
  private quietTimer = 0;
  private limitTimer = 0;
  private flushTimer = 0;

  constructor(options: VoiceOptions) {
    this.options = options;
  }

  /** Whether this browser has what listening needs. It does not ask for the microphone. */
  static supported(): boolean {
    return (
      typeof window !== 'undefined' &&
      window.isSecureContext &&
      typeof Worker === 'function' &&
      typeof WebAssembly === 'object' &&
      typeof AudioWorkletNode === 'function' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function'
    );
  }

  /**
   * Asks for the microphone, loads the model the first time, then listens
   * until the speaker pauses or stop() is called. The words arrive through
   * onText; the last call has `final` set, just after the state returns to idle.
   *
   * The microphone is open from the moment it is allowed, so what is said
   * while the model is still loading is kept and heard once it is ready.
   */
  async start(): Promise<void> {
    if (this.disposed || this.state === 'loading' || this.state === 'listening' || this.state === 'thinking') return;
    if (!Voice.supported()) {
      this.fail('This browser cannot listen: it has no microphone access here.');
      return;
    }
    const run = ++this.run;
    this.lastSoundAt = 0;
    this.setState('loading');

    let context: AudioContext;
    let stream: MediaStream;
    try {
      // Made inside the press that called start(), while the browser still allows sound to begin.
      context = this.context ?? this.openContext();
      context.resume().catch(() => undefined);
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      if (run !== this.run) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      this.stream = stream;
    } catch (error) {
      if (run === this.run) this.fail(microphoneSentence(error));
      return;
    }

    try {
      const model = this.loadModel();
      await this.addCapture(context);
      if (run !== this.run) return;
      this.openMicrophone(context, stream);
      await model;
    } catch {
      if (run === this.run) this.fail('The voice model did not load. Check the connection and try again.');
      return;
    }
    if (run !== this.run) return;
    this.listen();
  }

  /** Stops listening and reports what was heard up to now. During loading it cancels the start. */
  stop(): void {
    if (this.state === 'loading') {
      this.run++;
      this.closeMicrophone();
      this.setState('idle');
      return;
    }
    if (this.state !== 'listening' || this.worker == null || this.recogniser == null) return;
    this.closeMicrophone();
    this.clearTimers();
    this.flushing = true;
    this.setState('thinking');
    this.worker.postMessage({ action: 'retrieveFinalResult', recognizerId: this.recogniser });
    this.flushTimer = window.setTimeout(() => this.finish(), FLUSH_MS);
  }

  /** Lets go of the microphone, the worker and the model. The object is not to be used afterwards. */
  dispose(): void {
    this.disposed = true;
    this.run++;
    this.clearTimers();
    this.closeMicrophone();
    this.recogniser = null;
    this.dropWorker();
    this.context?.close().catch(() => undefined);
    this.context = null;
    this.capture = null;
    this.captureReady = null;
    this.state = 'idle';
  }

  private setState(state: VoiceState, detail?: string): void {
    if (this.disposed) return;
    this.state = state;
    this.options.onState(state, detail);
  }

  private fail(sentence: string): void {
    this.clearTimers();
    this.closeMicrophone();
    this.dropRecogniser();
    this.setState('error', sentence);
  }

  private openContext(): AudioContext {
    try {
      this.context = new AudioContext({ sampleRate: MODEL_RATE, latencyHint: 'interactive' });
    } catch {
      // A browser that will not run at the model's rate: take its own, and the worker resamples.
      this.context = new AudioContext();
    }
    return this.context;
  }

  /** Puts the capture code on the audio thread, once. A failure is forgotten so the next start() tries again. */
  private addCapture(context: AudioContext): Promise<void> {
    if (this.captureReady) return this.captureReady;
    const url = URL.createObjectURL(new Blob([CAPTURE_SOURCE], { type: 'application/javascript' }));
    const ready = context.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    this.captureReady = ready;
    ready.catch(() => {
      if (this.captureReady === ready) this.captureReady = null;
    });
    return ready;
  }

  private loadModel(): Promise<void> {
    if (this.loaded) return this.loaded;
    const worker = new Worker(fileUrl(WORKER_FILE));
    this.worker = worker;
    const loaded = new Promise<void>((resolve, reject) => {
      this.settleLoad = { resolve, reject };
    });
    this.loaded = loaded;
    worker.onmessage = (event: MessageEvent<WorkerMessage | undefined>) => {
      // Making a recogniser is answered with an empty message. There is nothing in it to read.
      if (event.data != null) this.onWorker(event.data);
    };
    worker.onerror = (event) => this.onWorker({ event: 'error', error: event.message });
    // Errors only. Otherwise the recogniser logs every step of its loading, and
    // a warning for each listed word its model does not have; such a word is
    // simply never heard.
    worker.postMessage({ action: 'set', key: 'logLevel', value: -2 });
    worker.postMessage({ action: 'load', modelUrl: fileUrl(MODEL_FILE) });
    // A failed load is forgotten, so the next start() tries again from the top.
    loaded.catch(() => {
      if (this.worker === worker) this.dropWorker();
    });
    return loaded;
  }

  private dropWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.loaded = null;
    this.settleLoad = null;
  }

  private openMicrophone(context: AudioContext, stream: MediaStream): void {
    const capture =
      this.capture ??
      new AudioWorkletNode(context, CAPTURE_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
      });
    this.capture = capture;
    this.rate = context.sampleRate;
    this.kept.length = 0;
    capture.port.postMessage(0);
    capture.port.onmessage = (event: MessageEvent<Chunk>) => this.onSound(event.data);
    this.source = context.createMediaStreamSource(stream);
    this.source.connect(capture);
  }

  /** A tenth of a second from the microphone. Runs ten times a second during a request, never per frame. */
  private onSound(chunk: Chunk): void {
    const { samples, loud } = chunk;
    if (loud >= 0) this.lastSoundAt = performance.now() - ((samples.length - 1 - loud) / this.rate) * 1000;
    if (this.state === 'listening') {
      this.send(samples);
    } else if (this.state === 'loading') {
      this.kept.push(samples);
      if (this.kept.length > KEPT_CHUNKS) this.kept.shift();
    }
  }

  private send(samples: Float32Array): void {
    if (this.worker == null || this.recogniser == null) return;
    this.unanswered++;
    this.worker.postMessage(
      { action: 'audioChunk', recognizerId: this.recogniser, data: samples, sampleRate: this.rate },
      [samples.buffer],
    );
  }

  private listen(): void {
    if (this.worker == null) return;
    const id = `request-${++this.recognisers}`;
    this.recogniser = id;
    this.unanswered = 0;
    this.flushing = false;
    this.heard = '';
    this.reported = '';
    const words = this.options.words;
    this.worker.postMessage({
      action: 'create',
      recognizerId: id,
      sampleRate: this.rate,
      grammar: words != null && words.length > 0 ? JSON.stringify([...words, '[unk]']) : undefined,
    });
    this.setState('listening');
    if (this.state !== 'listening') return;
    for (const samples of this.kept) this.send(samples);
    this.kept.length = 0;
    this.quietTimer = window.setTimeout(() => this.finish(), NO_SPEECH_MS);
    this.limitTimer = window.setTimeout(() => this.stop(), MAX_LISTEN_MS);
  }

  private onWorker(message: WorkerMessage): void {
    if (this.disposed) return;
    switch (message.event) {
      case 'progress':
        if (message.total > 0) this.options.onProgress?.(Math.min(1, message.loaded / message.total));
        return;
      case 'load':
        if (message.result) this.settleLoad?.resolve();
        else this.settleLoad?.reject(new Error('The model did not load.'));
        this.settleLoad = null;
        return;
      case 'error':
        if (this.settleLoad) {
          this.settleLoad.reject(new Error(message.error));
          this.settleLoad = null;
        } else if (message.recognizerId == null) {
          // The worker itself broke. Start a fresh one next time.
          this.dropWorker();
          if (this.state === 'listening' || this.state === 'thinking') this.fail('The recogniser stopped. Try again.');
        } else if (message.recognizerId === this.recogniser) {
          this.fail('The recogniser stopped. Try again.');
        }
        return;
      case 'partialresult':
        if (message.recognizerId !== this.recogniser) return;
        this.unanswered--;
        this.onPartial(message.result.partial);
        return;
      case 'result':
        if (message.recognizerId !== this.recogniser) return;
        // After stop(), the answer that comes once every chunk is answered is the one that was asked for.
        if (this.flushing && this.unanswered <= 0) {
          this.heard = join(this.heard, message.result.text);
          this.finish();
          return;
        }
        this.unanswered--;
        this.onSegment(message.result.text);
        return;
    }
  }

  /** Words still being worked out. They may change. */
  private onPartial(partial: string): void {
    if (partial === '' || this.flushing) return;
    // Someone is talking: neither the quiet nor the pause is running out.
    window.clearTimeout(this.quietTimer);
    window.clearTimeout(this.graceTimer);
    this.quietTimer = 0;
    this.graceTimer = 0;
    this.report(join(this.heard, partial));
  }

  /** The recogniser heard a pause and settled the words before it. */
  private onSegment(text: string): void {
    if (this.flushing) {
      this.heard = join(this.heard, text);
      return;
    }
    if (text === '') {
      // A pause with no words in it. If words were on their way and came to
      // nothing, no timer is running any more: start one, so the request ends.
      if (this.graceTimer === 0 && this.quietTimer === 0) {
        this.quietTimer = window.setTimeout(() => this.finish(), this.heard === '' ? NO_SPEECH_MS : GRACE_MS);
      }
      return;
    }
    window.clearTimeout(this.quietTimer);
    window.clearTimeout(this.graceTimer);
    this.quietTimer = 0;
    this.heard = join(this.heard, text);
    this.report(this.heard);
    this.graceTimer = window.setTimeout(() => this.finish(), GRACE_MS);
  }

  private report(text: string): void {
    if (text === this.reported || this.state !== 'listening') return;
    this.reported = text;
    this.options.onText(text, false);
  }

  private finish(): void {
    if (this.state !== 'listening' && this.state !== 'thinking') return;
    const text = this.heard;
    this.clearTimers();
    this.closeMicrophone();
    this.dropRecogniser();
    this.setState('idle');
    if (!this.disposed) this.options.onText(text, true);
  }

  private dropRecogniser(): void {
    if (this.recogniser != null) this.worker?.postMessage({ action: 'remove', recognizerId: this.recogniser });
    this.recogniser = null;
    this.flushing = false;
  }

  private closeMicrophone(): void {
    if (this.capture) this.capture.port.onmessage = null;
    this.source?.disconnect();
    this.source = null;
    if (this.stream) for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
    this.kept.length = 0;
    // Between requests the audio thread has nothing to do.
    this.context?.suspend().catch(() => undefined);
  }

  private clearTimers(): void {
    window.clearTimeout(this.graceTimer);
    window.clearTimeout(this.quietTimer);
    window.clearTimeout(this.limitTimer);
    window.clearTimeout(this.flushTimer);
    this.graceTimer = 0;
    this.quietTimer = 0;
  }
}
