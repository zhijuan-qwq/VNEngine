import type EventBus from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';

/** Updater 实际用到的 ticker 成员；pixi Ticker 结构上满足它 */
export interface TickerLike {
  deltaMS: number;
  maxFPS: number;
  started: boolean;
  add(fn: (ticker: TickerLike) => void): void;
  remove(fn: (ticker: TickerLike) => void): void;
  start(): void;
  stop(): void;
}

/** 逐帧更新契约（架构文档 §3.2） */
export interface Updatable {
  update(dt: number): void;
}

export interface UpdaterOptions {
  /** 持有 pixi Ticker 的宿主（生产端传 pixi Application） */
  app: { ticker: TickerLike };
  eventBus: EventBus<EngineEvents>;
  /** 构造注入的子系统列表，按序逐帧调用 */
  updatables: Updatable[];
  /** 目标帧率，默认 60 */
  fps?: number;
}

/** 单帧时长上限（秒），防止标签页切回后跳帧 */
export const MAX_DT = 0.1;

export const DEFAULT_FPS = 60;

/** 抵消 deltaMS / 1000 的浮点误差 */
const FRAME_EPSILON = 1e-3;

class Updater {
  public fps: number;
  public elapsedTime = 0;
  private readonly ticker: TickerLike;
  private readonly eventBus: EventBus<EngineEvents>;
  private readonly updatables: Updatable[];
  private readonly tick: (ticker: TickerLike) => void;
  private running = false;
  private accumulator = 0;

  constructor(options: UpdaterOptions) {
    this.ticker = options.app.ticker;
    this.eventBus = options.eventBus;
    this.updatables = options.updatables;
    this.fps = options.fps ?? DEFAULT_FPS;
    this.tick = (ticker) => this.onTick(ticker);
    this.ticker.add(this.tick);
  }

  public start(): void {
    this.running = true;
    this.ticker.maxFPS = this.fps;
    this.ticker.start();
  }

  public stop(): void {
    this.running = false;
    this.ticker.stop();
  }

  /** 用户暂停：与 stop 同为停止 ticker，但不销毁回调 */
  public pause(): void {
    this.stop();
  }

  public resume(): void {
    this.running = true;
    this.ticker.start();
  }

  public destroy(): void {
    this.stop();
    this.ticker.remove(this.tick);
  }

  private onTick(ticker: TickerLike): void {
    if (!this.running) return;
    const dt = Math.min(ticker.deltaMS / 1000, MAX_DT);
    for (const updatable of this.updatables) updatable.update(dt);
    this.elapsedTime += dt;
    if (this.shouldRender(dt)) {
      this.eventBus.emit('render:frame', { dt });
    }
  }

  /**
   * 跳帧闸门：逻辑仍按真实 dt 每帧更新，仅渲染事件降到 fps 频率。
   * fps <= 0 表示不限制，每帧都渲染。
   */
  private shouldRender(dt: number): boolean {
    if (this.fps <= 0) return true;
    const interval = 1 / this.fps;
    this.accumulator += dt;
    if (this.accumulator + FRAME_EPSILON < interval) return false;
    this.accumulator -= interval;
    // 一次跨多个间隔（帧率骤降）时归零，避免后续追帧
    if (this.accumulator >= interval) this.accumulator = 0;
    return true;
  }
}

export { Updater };
export default Updater;
