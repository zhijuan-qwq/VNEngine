import { Container, Rectangle } from 'pixi.js';
import type { EventBus } from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import type { VarResolver } from '@/types/text';
import { DialogueBox } from './DialogueBox';
import type { DialogueBoxOptions } from './DialogueBox';
import { ChoicePanel } from './ChoicePanel';
import type { ChoicePanelOptions } from './ChoicePanel';

export interface UIManagerOptions {
  width: number;
  height: number;
  x?: number;
  y?: number;
  resolveVar?: VarResolver;
  dialogueBox?: Partial<DialogueBoxOptions>;
  choicePanel?: Partial<ChoicePanelOptions>;
  autoTick?: boolean;
}

const MAX_FRAME_MS = 100;

export class UIManager {
  readonly root: Container;
  readonly dialogueBox: DialogueBox;
  readonly choicePanel: ChoicePanel;

  private readonly bus: EventBus<EngineEvents>;
  private readonly hitTarget: Container;
  private rafId: number | null = null;
  private lastTime = 0;

  constructor(bus: EventBus<EngineEvents>, options: UIManagerOptions) {
    this.bus = bus;

    this.root = new Container();
    this.root.x = options.x ?? 0;
    this.root.y = options.y ?? 0;

    this.hitTarget = new Container();
    this.hitTarget.eventMode = 'static';
    this.hitTarget.hitArea = new Rectangle(0, 0, options.width, options.height);
    this.hitTarget.on('pointertap', (event) =>
      this.handleTap(event.global.x, event.global.y),
    );
    this.root.addChild(this.hitTarget);

    const dialogue = options.dialogueBox ?? {};
    this.dialogueBox = new DialogueBox({
      ...dialogue,
      width: dialogue.width ?? options.width,
      height: dialogue.height ?? options.height,
      eventBus: bus,
      resolveVar: options.resolveVar,
    });

    const choice = options.choicePanel ?? {};
    this.choicePanel = new ChoicePanel({
      ...choice,
      width: choice.width ?? options.width,
      onSelect: (label) => bus.emit('script:choice:selected', { label }),
    });
    this.root.addChild(this.dialogueBox, this.choicePanel);

    bus.on('script:say', this.handleSay);
    bus.on('script:clear', this.handleClear);
    bus.on('script:choice', this.handleChoice);
    bus.on('script:end', this.handleEnd);

    if (options.autoTick !== false) {
      this.startTicking();
    }
  }

  public update(dt: number): void {
    this.dialogueBox.update(dt);
  }

  public handleTap(x: number, y: number): void {
    if (this.dialogueBox.isBusy()) {
      this.bus.emit('input:skip', {});
    } else {
      this.bus.emit('input:click', { x, y });
    }
  }

  public destroy(): void {
    this.stopTicking();
    this.bus.off('script:say', this.handleSay);
    this.bus.off('script:clear', this.handleClear);
    this.bus.off('script:choice', this.handleChoice);
    this.bus.off('script:end', this.handleEnd);
    this.dialogueBox.destroy();
    this.choicePanel.destroy();
  }

  private readonly handleSay = (payload: EngineEvents['script:say']): void => {
    this.dialogueBox.show(payload.speaker, payload.text, payload.speed);
    this.choicePanel.hide();
  };

  private readonly handleClear = (): void => {
    this.dialogueBox.clear();
  };

  private readonly handleChoice = (
    payload: EngineEvents['script:choice'],
  ): void => {
    this.choicePanel.show(payload.choices, payload.mode ?? 'adv');
  };

  private readonly handleEnd = (): void => {
    this.dialogueBox.clear();
    this.choicePanel.hide();
  };

  private startTicking(): void {
    this.lastTime = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(now - this.lastTime, MAX_FRAME_MS);
      this.lastTime = now;
      this.update(dt);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopTicking(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
