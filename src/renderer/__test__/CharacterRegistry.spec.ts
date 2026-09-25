import { Container, Sprite, Texture } from 'pixi.js';
import type { Position } from '@/types/engine';
import CharacterRegistry, {
  CHARACTER_ANCHOR,
  CHARACTER_ZOOM_FROM,
  POSITION_RATIOS,
  SLIDE_IN_OFFSET,
  positionToPoint,
} from '../CharacterRegistry';
import { DEFAULT_TRANSITION_DURATION } from '../transitions';
import TweenEngine from '../tween';

const SIZE = { width: 800, height: 600 };

/** 每次调用产生一个独立 Texture 实例，便于断言纹理是否真的换了 */
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

function makeRegistry(
  resolve?: (id: string, sprite: string) => Promise<Texture>,
) {
  const parent = new Container();
  const tweens = new TweenEngine();
  const errors: unknown[] = [];
  const resolveTexture = vi.fn<
    (id: string, sprite: string) => Promise<Texture>
  >(resolve ?? (() => Promise.resolve(newTexture())));
  const registry = new CharacterRegistry({
    parent,
    tweens,
    size: SIZE,
    resolveTexture,
    onError: (error) => errors.push(error),
  });
  return { registry, parent, tweens, resolveTexture, errors };
}

function firstSprite(parent: Container): Sprite {
  return parent.children[0] as Sprite;
}

describe('positionToPoint', () => {
  it('should map the position keywords to width ratios at the bottom edge', () => {
    expect(POSITION_RATIOS).toEqual({
      farLeft: 0.1,
      left: 0.25,
      center: 0.5,
      right: 0.75,
      farRight: 0.9,
      offLeft: -0.25,
      offRight: 1.25,
    });

    expect(positionToPoint('farLeft', SIZE)).toEqual({ x: 80, y: 600 });
    expect(positionToPoint('left', SIZE)).toEqual({ x: 200, y: 600 });
    expect(positionToPoint('center', SIZE)).toEqual({ x: 400, y: 600 });
    expect(positionToPoint('right', SIZE)).toEqual({ x: 600, y: 600 });
    expect(positionToPoint('farRight', SIZE)).toEqual({ x: 720, y: 600 });
    // offLeft/offRight 落在屏幕外（站在画外）
    expect(positionToPoint('offLeft', SIZE)).toEqual({ x: -200, y: 600 });
    expect(positionToPoint('offRight', SIZE)).toEqual({ x: 1000, y: 600 });
  });

  it('should pass explicit coordinates through unchanged', () => {
    expect(positionToPoint({ x: 10, y: 20 }, SIZE)).toEqual({ x: 10, y: 20 });
  });

  it('should fall back to the center ratio for a keyword it does not know', () => {
    // DSL 的位置名不校验（grammar 只认 Identifier），未知名字不能算出 NaN
    const fromDsl = 'middle' as unknown as Position;

    expect(positionToPoint(fromDsl, SIZE)).toEqual({ x: 400, y: 600 });
  });
});

describe('CharacterRegistry', () => {
  describe('show', () => {
    it('should add a bottom-anchored sprite and fade it in', async () => {
      const { registry, parent, tweens, resolveTexture } = makeRegistry();

      registry.show({ id: 'cat', position: 'left' });
      await flush();

      expect(resolveTexture).toHaveBeenCalledWith('cat', 'default');
      expect(parent.children).toHaveLength(1);
      const sprite = firstSprite(parent);
      expect(sprite.anchor.x).toBe(CHARACTER_ANCHOR.x);
      expect(sprite.anchor.y).toBe(CHARACTER_ANCHOR.y);
      expect(sprite.x).toBe(200);
      expect(sprite.y).toBe(600);
      expect(sprite.alpha).toBe(0);

      tweens.update(DEFAULT_TRANSITION_DURATION / 2000);
      expect(sprite.alpha).toBeCloseTo(0.75);

      tweens.update(DEFAULT_TRANSITION_DURATION / 2000);
      expect(sprite.alpha).toBe(1);
    });

    it('should appear without a transition when transition is none', async () => {
      const { registry, parent, tweens } = makeRegistry();

      registry.show({ id: 'cat', position: 'center', transition: 'none' });
      await flush();

      expect(firstSprite(parent).alpha).toBe(1);
      expect(tweens.activeCount).toBe(0);
    });

    it('should ignore an unknown transition name instead of failing', async () => {
      const { registry, parent } = makeRegistry();

      registry.show({ id: 'cat', position: 'center', transition: 'wipe' });
      await flush();

      expect(firstSprite(parent).alpha).toBe(1);
    });

    it('should slide in from off-screen and land on the target point', async () => {
      const { registry, parent, tweens } = makeRegistry();

      registry.show({
        id: 'cat',
        position: 'left',
        transition: 'slide',
        duration: 400,
      });
      await flush();

      const sprite = firstSprite(parent);
      expect(sprite.x).toBe(200 - SLIDE_IN_OFFSET);
      expect(sprite.y).toBe(600);
      expect(sprite.alpha).toBe(1);

      tweens.update(0.4);
      expect(sprite.x).toBe(200);
      expect(sprite.y).toBe(600);
    });

    it('should slide a center character up from below the screen', async () => {
      const { registry, parent, tweens } = makeRegistry();

      registry.show({ id: 'cat', position: 'center', transition: 'slide' });
      await flush();

      const sprite = firstSprite(parent);
      expect(sprite.x).toBe(400);
      expect(sprite.y).toBe(600 + SLIDE_IN_OFFSET);

      tweens.update(DEFAULT_TRANSITION_DURATION / 1000);
      expect(sprite.y).toBe(600);
    });

    it('should honour an explicit slide direction over the position', async () => {
      const { registry, parent, tweens } = makeRegistry();

      registry.show({
        id: 'cat',
        position: 'right',
        transition: 'slideL',
        duration: 400,
      });
      await flush();

      // slideL = 从左侧滑入，即使目标是右侧
      const sprite = firstSprite(parent);
      expect(sprite.x).toBe(600 - SLIDE_IN_OFFSET);
      expect(sprite.y).toBe(600);

      tweens.update(0.4);
      expect(sprite.x).toBe(600);
    });

    it('should zoom in from a smaller scale', async () => {
      const { registry, parent, tweens } = makeRegistry();

      registry.show({ id: 'cat', position: 'right', transition: 'zoom' });
      await flush();

      const sprite = firstSprite(parent);
      expect(sprite.scale.x).toBeCloseTo(CHARACTER_ZOOM_FROM);
      expect(sprite.alpha).toBe(0);

      tweens.update(DEFAULT_TRANSITION_DURATION / 1000);
      expect(sprite.scale.x).toBe(1);
      expect(sprite.scale.y).toBe(1);
      expect(sprite.alpha).toBe(1);
    });

    it('should reuse the sprite and the cached texture when shown twice', async () => {
      const { registry, parent, tweens, resolveTexture } = makeRegistry();

      registry.show({ id: 'cat', position: 'left' });
      await flush();
      registry.show({ id: 'cat', position: 'left' });
      await flush();
      tweens.update(DEFAULT_TRANSITION_DURATION / 1000);

      expect(parent.children).toHaveLength(1);
      expect(resolveTexture).toHaveBeenCalledTimes(1);
      expect(registry.getState()).toEqual([
        { id: 'cat', spriteId: 'default', position: 'left', opacity: 1 },
      ]);
    });

    it('should move an already visible character shown at another position', async () => {
      const { registry, parent, tweens } = makeRegistry();

      registry.show({ id: 'cat', position: 'left', transition: 'none' });
      await flush();
      registry.show({ id: 'cat', position: 'right', duration: 200 });
      await flush();

      const sprite = firstSprite(parent);
      tweens.update(0.2);

      expect(sprite.x).toBe(600);
      expect(parent.children).toHaveLength(1);
    });

    it('should report the failure and skip the sprite when the texture is missing', async () => {
      const { registry, parent, errors } = makeRegistry(async () => {
        throw new Error('Sprite "default" of character "cat" not found');
      });

      registry.show({ id: 'cat', position: 'left' });
      await flush();

      expect(parent.children).toHaveLength(0);
      expect(registry.getState()).toEqual([]);
      expect(errors).toHaveLength(1);
    });

    it('should discard a sprite whose texture arrives after the character was hidden', async () => {
      const load = deferred<Texture>();
      const { registry, parent } = makeRegistry(() => load.promise);

      registry.show({ id: 'cat', position: 'left' });
      registry.hide('cat');
      load.resolve(newTexture());
      await flush();

      expect(parent.children).toHaveLength(0);
      expect(registry.getState()).toEqual([]);
    });

    it('should only create one sprite when two shows race on the same load', async () => {
      const load = deferred<Texture>();
      const { registry, parent } = makeRegistry(() => load.promise);

      registry.show({ id: 'cat', position: 'left' });
      registry.show({ id: 'cat', position: 'right' });
      load.resolve(newTexture());
      await flush();

      expect(parent.children).toHaveLength(1);
      expect(firstSprite(parent).x).toBe(600);
    });

    it('should apply a move that arrives while the texture is still loading', async () => {
      const load = deferred<Texture>();
      const { registry, parent } = makeRegistry(() => load.promise);

      // @show 后紧接的 @move（ScriptEngine 每帧一条命令，纹理可能还没到）
      registry.show({ id: 'cat', position: 'left' });
      registry.move('cat', 'right', 200);
      load.resolve(newTexture());
      await flush();

      expect(parent.children).toHaveLength(1);
      expect(firstSprite(parent).x).toBe(600);
      expect(registry.getState()[0].position).toBe('right');
    });

    it('should apply a sprite change that arrives while the texture is still loading', async () => {
      const load = deferred<Texture>();
      const { registry, parent, resolveTexture } = makeRegistry(
        () => load.promise,
      );

      registry.show({ id: 'cat', position: 'left' });
      registry.changeSprite('cat', 'smile');
      load.resolve(newTexture());
      await flush();

      expect(resolveTexture).toHaveBeenLastCalledWith('cat', 'smile');
      expect(parent.children).toHaveLength(1);
      expect(registry.getState()[0].spriteId).toBe('smile');
    });
  });

  describe('hide', () => {
    it('should fade the sprite out, then destroy it', async () => {
      const { registry, parent, tweens } = makeRegistry();
      registry.show({ id: 'cat', position: 'left', transition: 'none' });
      await flush();
      const sprite = firstSprite(parent);

      registry.hide('cat');
      expect(registry.getState()).toEqual([]);

      tweens.update(DEFAULT_TRANSITION_DURATION / 1000);

      expect(parent.children).toHaveLength(0);
      expect(sprite.destroyed).toBe(true);
    });

    it('should slide out towards the side named by the transition', async () => {
      const { registry, parent, tweens } = makeRegistry();
      registry.show({ id: 'cat', position: 'left', transition: 'none' });
      await flush();
      const sprite = firstSprite(parent);

      registry.hide('cat', 'slideR', 400);
      // 半程：x 已从 200 向右侧移动（easeOut(0.5) = 0.75），销毁后 Sprite 的 transform 会失效
      tweens.update(0.2);
      expect(sprite.x).toBeCloseTo(200 + SLIDE_IN_OFFSET * 0.75);

      tweens.update(0.2);
      expect(sprite.destroyed).toBe(true);
    });

    it("should remove every character when the id is 'all'", async () => {
      const { registry, parent, tweens } = makeRegistry();
      registry.show({ id: 'cat', position: 'left', transition: 'none' });
      registry.show({ id: 'dog', position: 'right', transition: 'none' });
      await flush();

      registry.hide('all');
      tweens.update(DEFAULT_TRANSITION_DURATION / 1000);

      expect(parent.children).toHaveLength(0);
      expect(registry.getState()).toEqual([]);
    });

    it('should ignore an unknown character id', () => {
      const { registry } = makeRegistry();
      expect(() => registry.hide('ghost')).not.toThrow();
    });

    it('should freeze a moving sprite when it is hidden mid-move', async () => {
      const { registry, parent, tweens } = makeRegistry();
      registry.show({ id: 'cat', position: 'left', transition: 'none' });
      await flush();

      registry.move('cat', 'right', 1000, 'linear');
      const sprite = firstSprite(parent);
      tweens.update(0.25);
      expect(sprite.x).toBeCloseTo(300);

      registry.hide('cat');
      tweens.update(0.1);
      // 退场淡出接管该 Sprite：在飞的移动补间应已取消，x 不再向 600 漂移
      expect(sprite.x).toBeCloseTo(300);
      expect(sprite.alpha).toBeLessThan(1);

      tweens.update(DEFAULT_TRANSITION_DURATION / 1000);
      expect(sprite.destroyed).toBe(true);
    });
  });

  describe('move', () => {
    it('should tween to the new position with the requested easing', async () => {
      const { registry, parent, tweens } = makeRegistry();
      registry.show({ id: 'cat', position: 'left', transition: 'none' });
      await flush();

      registry.move('cat', 'right', 500, 'linear');
      const sprite = firstSprite(parent);
      tweens.update(0.25);
      expect(sprite.x).toBeCloseTo(400);

      tweens.update(0.25);
      expect(sprite.x).toBe(600);
      expect(registry.getState()[0].position).toBe('right');
    });

    it('should jump instantly when the duration is zero', async () => {
      const { registry, parent, tweens } = makeRegistry();
      registry.show({ id: 'cat', position: 'left', transition: 'none' });
      await flush();

      registry.move('cat', { x: 100, y: 300 }, 0);

      expect(firstSprite(parent).x).toBe(100);
      expect(firstSprite(parent).y).toBe(300);
      expect(tweens.activeCount).toBe(0);
    });

    it('should ignore an unknown character', () => {
      const { registry } = makeRegistry();
      expect(() => registry.move('ghost', 'left', 100)).not.toThrow();
    });

    it('should stop the previous move tween when a new move is issued', async () => {
      const { registry, parent, tweens } = makeRegistry();
      registry.show({ id: 'cat', position: 'left', transition: 'none' });
      await flush();

      registry.move('cat', 'right', 1000, 'linear');
      const sprite = firstSprite(parent);
      tweens.update(0.25);
      expect(sprite.x).toBeCloseTo(300);

      // 直跳；旧补间若未取消会在随后的 update 里把它继续拖向 600
      registry.move('cat', { x: 100, y: 300 }, 0);
      tweens.update(1);

      expect(sprite.x).toBe(100);
      expect(sprite.y).toBe(300);
      expect(tweens.activeCount).toBe(0);
    });
  });

  describe('changeSprite', () => {
    it('should crossfade to the new texture and keep a single sprite', async () => {
      const { registry, parent, tweens } = makeRegistry();
      registry.show({ id: 'cat', position: 'left', transition: 'none' });
      await flush();
      const sprite = firstSprite(parent);
      const initialTexture = sprite.texture;

      registry.changeSprite('cat', 'smile');
      await flush();

      // 交叉淡入期间画面上还是旧立绘，记账名也仍是旧的（落地后才改）
      expect(parent.children).toHaveLength(2);
      expect(sprite.texture).toBe(initialTexture);
      expect(registry.getState()[0].spriteId).toBe('default');

      tweens.update(DEFAULT_TRANSITION_DURATION / 1000);

      expect(parent.children).toHaveLength(1);
      expect(sprite.texture).not.toBe(initialTexture);
      expect(sprite.alpha).toBe(1);
      expect(registry.getState()[0].spriteId).toBe('smile');
    });

    it('should swap instantly when the duration is zero', async () => {
      const { registry, parent } = makeRegistry();
      registry.show({ id: 'cat', position: 'left', transition: 'none' });
      await flush();
      const sprite = firstSprite(parent);
      const initialTexture = sprite.texture;

      registry.changeSprite('cat', 'smile', undefined, 0);
      await flush();

      expect(parent.children).toHaveLength(1);
      expect(sprite.texture).not.toBe(initialTexture);
    });

    it('should ignore a repeat of the current sprite name', async () => {
      const { registry, resolveTexture } = makeRegistry();
      registry.show({ id: 'cat', position: 'left', transition: 'none' });
      await flush();

      registry.changeSprite('cat', 'default');
      await flush();

      expect(resolveTexture).toHaveBeenCalledTimes(1);
    });

    it('should keep the displayed sprite when the new one fails to load', async () => {
      const { registry, parent, errors } = makeRegistry((id, sprite) =>
        sprite === 'missing'
          ? Promise.reject(
              new Error(`Sprite "${sprite}" of character "${id}" not found`),
            )
          : Promise.resolve(newTexture()),
      );
      registry.show({ id: 'cat', position: 'left', transition: 'none' });
      await flush();
      const sprite = firstSprite(parent);
      const initialTexture = sprite.texture;

      registry.changeSprite('cat', 'missing');
      await flush();

      // 素材缺失只是报错：画面上仍是旧立绘，存档快照也仍记旧名
      expect(parent.children).toHaveLength(1);
      expect(sprite.texture).toBe(initialTexture);
      expect(registry.getState()[0].spriteId).toBe('default');
      expect(errors).toHaveLength(1);
    });

    it('should ignore a character that is not on stage', () => {
      const { registry } = makeRegistry();
      expect(() => registry.changeSprite('ghost', 'smile')).not.toThrow();
    });
  });

  describe('getState / setState', () => {
    it('should report id, sprite, position and opacity for every character', async () => {
      const { registry, tweens } = makeRegistry();
      registry.show({ id: 'cat', position: 'left', transition: 'none' });
      await flush();
      registry.show({
        id: 'dog',
        position: { x: 30, y: 40 },
        transition: 'none',
      });
      await flush();

      registry.hide('cat');
      tweens.update(DEFAULT_TRANSITION_DURATION / 1000);

      expect(registry.getState()).toEqual([
        {
          id: 'dog',
          spriteId: 'default',
          position: { x: 30, y: 40 },
          opacity: 1,
        },
      ]);
    });

    it('should restore characters instantly, keeping opacity', async () => {
      const { registry, parent, tweens, resolveTexture } = makeRegistry();

      registry.setState([
        { id: 'cat', spriteId: 'smile', position: 'right', opacity: 0.5 },
      ]);
      await flush();

      expect(resolveTexture).toHaveBeenCalledWith('cat', 'smile');
      expect(tweens.activeCount).toBe(0);
      const sprite = firstSprite(parent);
      expect(sprite.x).toBe(600);
      expect(sprite.alpha).toBe(0.5);
    });

    it('should drop characters that are not part of the loaded state', async () => {
      const { registry, parent } = makeRegistry();
      registry.show({ id: 'cat', position: 'left', transition: 'none' });
      await flush();

      registry.setState([]);
      await flush();

      expect(parent.children).toHaveLength(0);
      expect(registry.getState()).toEqual([]);
    });
  });

  describe('clear / destroy', () => {
    it('should remove every sprite immediately', async () => {
      const { registry, parent } = makeRegistry();
      registry.show({ id: 'cat', position: 'left', transition: 'none' });
      await flush();

      registry.destroy();

      expect(parent.children).toHaveLength(0);
      expect(() => registry.getState()).not.toThrow();
    });

    it('should create nothing for a show that is still loading when cleared', async () => {
      const load = deferred<Texture>();
      const { registry, parent } = makeRegistry(() => load.promise);

      registry.show({ id: 'cat', position: 'left' });
      registry.clear();
      load.resolve(newTexture());
      await flush();

      expect(parent.children).toHaveLength(0);
    });
  });
});
