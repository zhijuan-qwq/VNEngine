import { Container } from 'pixi.js';
import type { DestroyOptions } from 'pixi.js';
import type { EventBus } from '@/core/EventBus';
import type { EngineEvents, EventName } from '@/types/events';

export interface UIComponentOptions {
  id?: string;
}

interface Subscription {
  emitter: EventBus<EngineEvents>;
  event: EventName;
  handler: (payload: unknown) => void;
}

export class UIComponent extends Container {
  readonly id: string;
  private subscriptions: Subscription[] = [];

  constructor(options?: UIComponentOptions) {
    super();
    this.id = options?.id ?? '';
  }

  public update(_dt: number): void {}

  public show(..._args: unknown[]): void {
    this.visible = true;
  }

  public hide(..._args: unknown[]): void {
    this.visible = false;
  }

  public destroy(options?: DestroyOptions): void {
    this.disposeSubscriptions();
    super.destroy(options);
  }

  protected bind<E extends EventName>(
    emitter: EventBus<EngineEvents>,
    event: E,
    handler: (payload: EngineEvents[E]) => void,
  ): void {
    emitter.on(event, handler);
    this.subscriptions.push({
      emitter,
      event,
      handler: handler as (payload: unknown) => void,
    });
  }

  protected disposeSubscriptions(): void {
    for (const subscription of this.subscriptions) {
      subscription.emitter.off(subscription.event, subscription.handler);
    }
    this.subscriptions = [];
  }
}
