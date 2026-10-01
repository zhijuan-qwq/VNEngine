import type { TypewriterHint } from '@/types/text';

export interface TypewriterOptions {
  totalChars: number;
  hints: TypewriterHint[];
  speed: number;
}

export class TypewriterState {
  private readonly totalChars: number;
  private readonly hints: TypewriterHint[];
  private currentSpeed: number;
  private revealedChars = 0;
  private carry = 0;
  private pauseRemainingMs = 0;
  private hintIndex = 0;
  private done = false;

  constructor(options: TypewriterOptions) {
    this.totalChars = options.totalChars;
    this.hints = options.hints;
    this.currentSpeed = options.speed;
  }

  get revealed(): number {
    return this.revealedChars;
  }

  get isComplete(): boolean {
    return this.done;
  }

  get isPaused(): boolean {
    return this.pauseRemainingMs > 0;
  }

  public update(dtMs: number): void {
    if (this.done || dtMs <= 0) {
      return;
    }

    if (this.pauseRemainingMs > 0) {
      this.pauseRemainingMs = Math.max(0, this.pauseRemainingMs - dtMs);
      return;
    }

    this.carry += (dtMs / 1000) * this.currentSpeed;
    const advance = Math.floor(this.carry);
    this.carry -= advance;
    const target = Math.min(this.revealedChars + advance, this.totalChars);

    const pauseIndex = this.findPauseHint(this.revealedChars, target);
    if (pauseIndex !== -1) {
      const hint = this.hints[pauseIndex];
      this.consumeUpTo(hint.pos);
      this.revealedChars = hint.pos;
      this.pauseRemainingMs = hint.pauseMs ?? 0;
      return;
    }

    this.revealedChars = target;
    this.consumeUpTo(target);
    if (this.revealedChars >= this.totalChars) {
      this.done = true;
    }
  }

  public revealAll(): void {
    this.revealedChars = this.totalChars;
    this.carry = 0;
    this.pauseRemainingMs = 0;
    this.done = true;
  }

  private findPauseHint(from: number, to: number): number {
    for (let h = this.hintIndex; h < this.hints.length; h += 1) {
      const hint = this.hints[h];
      if (hint.pos > to) {
        break;
      }
      if (hint.pauseMs !== undefined && hint.pauseMs > 0 && hint.pos >= from) {
        return h;
      }
    }
    return -1;
  }

  private consumeUpTo(pos: number): void {
    while (
      this.hintIndex < this.hints.length &&
      this.hints[this.hintIndex].pos <= pos
    ) {
      const hint = this.hints[this.hintIndex];
      this.hintIndex += 1;
      if (hint.speed !== undefined) {
        this.currentSpeed = hint.speed;
      }
    }
  }
}
