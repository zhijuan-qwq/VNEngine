type Handler = (...args: unknown[]) => void;

class EventBus {
  private listeners: Map<string, Set<Handler>>;
  private onceWrappers: WeakMap<Handler, Handler>;

  constructor() {
    this.listeners = new Map();
    this.onceWrappers = new WeakMap();
  }

  public on(event: string, handler: Handler): void {
    if (!this.listeners.get(event)) {
      this.listeners.set(event, new Set([handler]));
    } else {
      this.listeners.get(event)?.add(handler);
    }
  }
  public off(event: string, handler: Handler): void {
    const actualHandler = this.onceWrappers.get(handler) ?? handler;
    this.listeners.get(event)?.delete(actualHandler);
  }
  public once(event: string, handler: Handler): void {
    const onceHandler = ((...args: unknown[]) => {
      handler(...args);
      this.off(event, onceHandler);
    }) as Handler;
    this.onceWrappers.set(handler, onceHandler);
    this.on(event, onceHandler);
  }
  public emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((handler) => handler(...args));
  }
  public clear(): void {
    this.listeners.clear();
  }
}

export default EventBus;
