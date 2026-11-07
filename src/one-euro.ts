/**
 * The One Euro filter (Casiez, Roussel and Vogel, CHI 2012), the usual answer to
 * hand tracking: heavy smoothing while a hand moves slowly, where noise is what
 * you see, and almost none while it moves fast, where lag is what you feel.
 */
const alpha = (cutoff: number, seconds: number): number => 1 / (1 + 1 / (2 * Math.PI * cutoff * seconds));

export class OneEuro {
  private value = 0;
  private speed = 0;
  private started = false;

  /** Cutoffs in hertz. `beta` is how much a faster signal opens the filter up. */
  constructor(
    private readonly minCutoff: number,
    private readonly beta: number,
    private readonly speedCutoff = 1,
  ) {}

  reset(): void {
    this.started = false;
    this.speed = 0;
  }

  next(raw: number, seconds: number): number {
    if (!this.started || seconds <= 0) {
      this.started = true;
      this.value = raw;
      return raw;
    }
    const rawSpeed = (raw - this.value) / seconds;
    this.speed += alpha(this.speedCutoff, seconds) * (rawSpeed - this.speed);
    this.value += alpha(this.minCutoff + this.beta * Math.abs(this.speed), seconds) * (raw - this.value);
    return this.value;
  }
}
