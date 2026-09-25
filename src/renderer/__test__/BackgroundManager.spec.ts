import { Container, Sprite, Texture } from 'pixi.js';
import BackgroundManager from '../BackgroundManager';
import { DEFAULT_TRANSITION_DURATION, DEFAULT_ZOOM_FROM } from '../transitions';
import TweenEngine from '../tween';

const SIZE = { width: 800, height: 600 };

function newTexture(): Texture {
  return new Texture({ source: Texture.WHITE.source });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

function makeManager(resolve?: (id: string) => Promise<Texture>) {
  const parent = new Container();
  const tweens = new TweenEngine();
  const errors: unknown[] = [];
  const resolveTexture = vi.fn<(id: string) => Promise<Texture>>(
    resolve ?? (() => Promise.resolve(newTexture())),
  );
  const manager = new BackgroundManager({
    parent,
    tweens,
    size: SIZE,
    resolveTexture,
    onError: (error) => errors.push(error),
  });
  return { manager, parent, tweens, resolveTexture, errors };
}

function firstSprite(parent: Container): Sprite {
  return parent.children[0] as Sprite;
}

describe('BackgroundManager', () => {
  describe('change', () => {
    it('should crossfade the new background over the old one', async () => {
      const { manager, parent, tweens, resolveTexture } = makeManager();

      manager.change({ id: 'bg_room' });
      await flush();

      expect(resolveTexture).toHaveBeenCalledWith('bg_room');
      expect(parent.children).toHaveLength(1);
      const first = firstSprite(parent);
      expect(first.alpha).toBe(0);

      tweens.update(DEFAULT_TRANSITION_DURATION / 1000);
      expect(first.alpha).toBe(1);

      manager.change({ id: 'bg_street' });
      await flush();

      expect(parent.children).toHaveLength(2);
      const second = parent.children[1] as Sprite;
      expect(second.texture).not.toBe(first.texture);

      tweens.update(DEFAULT_TRANSITION_DURATION / 1000);

      expect(parent.children).toHaveLength(1);
      expect(first.destroyed).toBe(true);
      expect(second.alpha).toBe(1);
      expect(manager.getState()).toBe('bg_street');
    });

    it('should ignore a change to the background already displayed', async () => {
      const { manager, parent, resolveTexture } = makeManager();

      manager.change({ id: 'bg_room' });
      await flush();
      manager.change({ id: 'bg_room' });
      await flush();

      expect(resolveTexture).toHaveBeenCalledTimes(1);
      expect(parent.children).toHaveLength(1);
    });

    it('should swap instantly when the transition is none', async () => {
      const { manager, parent, tweens } = makeManager();

      manager.change({ id: 'bg_room' });
      await flush();
      const first = firstSprite(parent);

      manager.change({ id: 'bg_street', transition: 'none' });
      await flush();

      expect(parent.children).toHaveLength(1);
      expect(first.destroyed).toBe(true);
      expect(firstSprite(parent).alpha).toBe(1);
      expect(tweens.activeCount).toBe(0);
    });

    it('should slide the new background in from the right', async () => {
      const { manager, parent, tweens } = makeManager();

      manager.change({ id: 'bg_room', transition: 'slide', duration: 400 });
      await flush();

      const sprite = firstSprite(parent);
      expect(sprite.x).toBe(800);
      expect(sprite.alpha).toBe(1);

      tweens.update(0.4);
      expect(sprite.x).toBe(0);
    });

    it('should slide in from the left when the transition is slideL', async () => {
      const { manager, parent, tweens } = makeManager();

      manager.change({ id: 'bg_room', transition: 'slideL', duration: 400 });
      await flush();

      const sprite = firstSprite(parent);
      expect(sprite.x).toBe(-800);

      tweens.update(0.4);
      expect(sprite.x).toBe(0);
    });

    it('should zoom the new background in from a larger scale', async () => {
      const { manager, parent, tweens } = makeManager();

      manager.change({ id: 'bg_room', transition: 'zoom' });
      await flush();

      const sprite = firstSprite(parent);
      expect(sprite.scale.x).toBeCloseTo(DEFAULT_ZOOM_FROM);

      tweens.update(DEFAULT_TRANSITION_DURATION / 1000);
      expect(sprite.scale.x).toBe(1);
      expect(sprite.alpha).toBe(1);
    });

    it('should keep the old background fading out under a slide', async () => {
      const { manager, parent, tweens } = makeManager();

      manager.change({ id: 'bg_room', transition: 'none' });
      await flush();
      const first = firstSprite(parent);

      manager.change({ id: 'bg_street', transition: 'slide', duration: 400 });
      await flush();

      expect(first.destroyed).toBe(false);
      tweens.update(0.4);
      expect(first.destroyed).toBe(true);
      expect(parent.children).toHaveLength(1);
    });

    it('should drop a background whose texture resolves after a newer change', async () => {
      const loads: Array<ReturnType<typeof deferred<Texture>>> = [];
      const { manager, parent } = makeManager(() => {
        const load = deferred<Texture>();
        loads.push(load);
        return load.promise;
      });

      manager.change({ id: 'bg_room' });
      manager.change({ id: 'bg_street' });
      const stale = newTexture();
      const latest = newTexture();
      loads[1].resolve(latest);
      await flush();
      loads[0].resolve(stale);
      await flush();

      expect(parent.children).toHaveLength(1);
      expect(firstSprite(parent).texture).toBe(latest);
      expect(manager.getState()).toBe('bg_street');
    });

    it('should drop an in-flight change that a same-id change preempts', async () => {
      const loads: Array<ReturnType<typeof deferred<Texture>>> = [];
      const { manager, parent } = makeManager(() => {
        const load = deferred<Texture>();
        loads.push(load);
        return load.promise;
      });

      manager.change({ id: 'bg_room', transition: 'none' });
      loads[0].resolve(newTexture());
      await flush();
      expect(manager.getState()).toBe('bg_room');

      manager.change({ id: 'bg_street' });
      manager.change({ id: 'bg_room' });
      loads[1].resolve(newTexture());
      await flush();

      // 后到的命令是「保持 bg_room」，慢吞吞的 bg_street 不能盖上来
      expect(parent.children).toHaveLength(1);
      expect(manager.getState()).toBe('bg_room');
    });

    it('should report the failure and keep the previous background', async () => {
      const { manager, parent, errors } = makeManager();
      manager.change({ id: 'bg_room' });
      await flush();

      const {
        manager: failing,
        parent: failingParent,
        errors: failingErrors,
      } = makeManager(async () => {
        throw new Error('Background "bg_none" not found in manifest.');
      });
      failing.change({ id: 'bg_none' });
      await flush();

      expect(failingParent.children).toHaveLength(0);
      expect(failing.getState()).toBe(null);
      expect(failingErrors).toHaveLength(1);
      expect(errors).toHaveLength(0);
      expect(parent.children).toHaveLength(1);
    });
  });

  describe('getState / setState', () => {
    it('should start with no background', () => {
      const { manager } = makeManager();
      expect(manager.getState()).toBe(null);
    });

    it('should restore a background instantly', async () => {
      const { manager, parent, tweens } = makeManager();

      manager.setState('bg_room');
      await flush();

      expect(parent.children).toHaveLength(1);
      expect(firstSprite(parent).alpha).toBe(1);
      expect(tweens.activeCount).toBe(0);
      expect(manager.getState()).toBe('bg_room');
    });

    it('should clear the background when the loaded state has none', async () => {
      const { manager, parent } = makeManager();
      manager.change({ id: 'bg_room', transition: 'none' });
      await flush();

      manager.setState(null);
      await flush();

      expect(parent.children).toHaveLength(0);
      expect(manager.getState()).toBe(null);
    });

    it('should drop a change that was still loading when the state was loaded', async () => {
      const load = deferred<Texture>();
      const { manager, parent } = makeManager(() => load.promise);

      manager.change({ id: 'bg_room' });
      manager.setState(null);
      load.resolve(newTexture());
      await flush();

      expect(parent.children).toHaveLength(0);
    });
  });

  describe('destroy', () => {
    it('should remove the current and the fading out background', async () => {
      const { manager, parent, tweens } = makeManager();
      manager.change({ id: 'bg_room', transition: 'none' });
      await flush();
      manager.change({ id: 'bg_street' });
      await flush();
      expect(parent.children).toHaveLength(2);

      manager.destroy();

      expect(parent.children).toHaveLength(0);
      expect(manager.getState()).toBe(null);
      expect(tweens.activeCount).toBe(0);
    });

    it('should create nothing for a change that is still loading', async () => {
      const load = deferred<Texture>();
      const { manager, parent } = makeManager(() => load.promise);

      manager.change({ id: 'bg_room' });
      manager.destroy();
      load.resolve(newTexture());
      await flush();

      expect(parent.children).toHaveLength(0);
    });
  });
});
