type Handler<T = unknown> = (payload: T) => void;

class EventBus<T extends Record<string, unknown> = Record<string, unknown>> {
  private listeners: Map<string, Set<Handler<unknown>>>;
  private onceWrappers: WeakMap<Handler<unknown>, Handler<unknown>>;

  constructor() {
    this.listeners = new Map();
    this.onceWrappers = new WeakMap();
  }

  public on<K extends keyof T>(event: K, handler: Handler<T[K]>): void {
    const eventName = event as string;
    if (!this.listeners.get(eventName)) {
      this.listeners.set(eventName, new Set([handler as Handler<unknown>]));
    } else {
      this.listeners.get(eventName)?.add(handler as Handler<unknown>);
    }
  }

  public off<K extends keyof T>(event: K, handler: Handler<T[K]>): void {
    const eventName = event as string;
    const actualHandler =
      this.onceWrappers.get(handler as Handler<unknown>) ?? handler;
    this.listeners.get(eventName)?.delete(actualHandler as Handler<unknown>);
  }

  public once<K extends keyof T>(event: K, handler: Handler<T[K]>): void {
    const onceHandler = ((payload: unknown) => {
      (handler as Handler<unknown>)(payload);
      this.off(event, onceHandler as Handler<T[K]>);
    }) as Handler<unknown>;
    this.onceWrappers.set(handler as Handler<unknown>, onceHandler);
    this.on(event, onceHandler as Handler<T[K]>);
  }

  public emit<K extends keyof T>(event: K, payload: T[K]): void {
    this.listeners.get(event as string)?.forEach((handler) => handler(payload));
  }

  public removeAllListeners(event: string): void {
    this.listeners.delete(event);
  }
}

export type { EventBus };
export default EventBus;
