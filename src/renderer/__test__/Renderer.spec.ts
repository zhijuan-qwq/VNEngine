import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import EventBus from '@/core/EventBus';
import type { AssetManifest } from '@/types/engine';
import type { EngineEvents } from '@/types/events';
import { LAYER_Z_INDEX } from '../LayerStack';
import Renderer, { type RendererOptions } from '../Renderer';
import type { TextureProvider } from '../spriteResolver';

const SIZE = { width: 800, height: 600 };

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

function newTexture(): Texture {
  return new Texture({ source: Texture.WHITE.source });
}

interface Harness {
  renderer: Renderer;
  stage: Container;
  bus: EventBus<EngineEvents>;
  errors: unknown[];
  layer(id: string): Container;
}

function createRenderer(overrides: Partial<RendererOptions> = {}): Harness {
  const stage = new Container();
  const bus = new EventBus<EngineEvents>();
  const errors: unknown[] = [];
  const textures: Record<string, Texture> = {
    bg_room: newTexture(),
    hero_smile: newTexture(),
  };
  const manifest: AssetManifest = {
    images: { bg_room: 'bg_room.png', hero_smile: 'hero_smile.png' },
    audio: {},
    scripts: {},
    spritesheets: {
      hero: { url: 'hero.png', frames: { default: [1, 2, 32, 64] } },
    },
  };
  const resource: TextureProvider = {
    manifest,
    loadImage: async (id: string) => textures[id] ?? newTexture(),
    loadSpritesheet: async () => newTexture(),
  };
  const renderer = new Renderer({
    stage,
    eventBus: bus,
    resource,
    width: SIZE.width,
    height: SIZE.height,
    scaleMode: 'fit',
    onError: (error) => errors.push(error),
    ...overrides,
  });
  return {
    renderer,
    stage,
    bus,
    errors,
    layer: (id) => renderer.layers.getLayer(id) as Container,
  };
}

describe('Renderer', () => {
  describe('layers', () => {
    it('should mount the layer stack on the stage and pre-create the layers', () => {
      const { stage, renderer, layer } = createRenderer();

      expect(stage.children).toHaveLength(1);
      expect(stage.children[0]).toBe(renderer.layers);
      expect(renderer.layers.children.map((child) => child.label)).toEqual([
        'bg',
        'chara',
        'effect',
        'ui',
      ]);
      expect(layer('bg').zIndex).toBe(LAYER_Z_INDEX.bg);
      expect(layer('chara').zIndex).toBe(LAYER_Z_INDEX.chara);
      expect(layer('effect').zIndex).toBe(LAYER_Z_INDEX.effect);
      expect(layer('ui').zIndex).toBe(LAYER_Z_INDEX.ui);
    });

    it('should resize through the ScaleManager', () => {
      const { renderer, stage } = createRenderer({
        width: 400,
        height: 300,
        scaleMode: 'fit',
      });

      renderer.resize({ width: 800, height: 600 });

      expect(stage.scale.x).toBe(2);
      expect(stage.position.x).toBe(0);
    });
  });

  describe('event routing', () => {
    it('should put a background sprite into the bg layer', async () => {
      const { bus, layer } = createRenderer();

      bus.emit('bg:change', { id: 'bg_room', transition: 'none' });
      await flush();

      expect(layer('bg').children).toHaveLength(1);
      expect(layer('bg').children[0]).toBeInstanceOf(Sprite);
    });

    it('should cut the character sprite out of the spritesheet frame', async () => {
      const { bus, layer } = createRenderer();

      bus.emit('character:show', {
        id: 'hero',
        position: 'left',
        transition: 'none',
      });
      await flush();

      expect(layer('chara').children).toHaveLength(1);
      const sprite = layer('chara').children[0] as Sprite;
      expect(sprite.x).toBe(200);
      expect(sprite.y).toBe(600);
      expect(sprite.anchor.y).toBe(1);
      expect(sprite.texture.frame.width).toBe(32);
      expect(sprite.texture.frame.height).toBe(64);
    });

    it('should route move, sprite and hide to the character registry', async () => {
      const { bus, layer, renderer } = createRenderer();
      bus.emit('character:show', {
        id: 'hero',
        position: 'left',
        transition: 'none',
      });
      await flush();
      const sprite = layer('chara').children[0] as Sprite;

      bus.emit('character:move', { id: 'hero', position: 'right' });
      renderer.update(0.3);
      expect(sprite.x).toBe(600);

      bus.emit('character:sprite', { id: 'hero', sprite: 'smile' });
      await flush();
      renderer.update(0.3);
      expect(layer('chara').children).toHaveLength(1);
      expect(renderer.getState().characters[0].spriteId).toBe('smile');

      bus.emit('character:hide', { id: 'hero', transition: 'none' });
      expect(layer('chara').children).toHaveLength(0);
    });

    it('should shake and restore the whole picture root', () => {
      const { bus, renderer } = createRenderer();

      bus.emit('effect:play', { type: 'shake', duration: 500, intensity: 1 });
      renderer.update(0.016);
      expect(Math.abs(renderer.layers.x)).toBeLessThanOrEqual(20);

      renderer.update(1);
      expect(renderer.layers.x).toBe(0);
      expect(renderer.layers.y).toBe(0);
    });

    it('should fade a flash out of the effect layer', () => {
      const { bus, layer, renderer } = createRenderer();

      bus.emit('effect:play', { type: 'flash', duration: 200 });
      expect(layer('effect').children).toHaveLength(1);
      expect(layer('effect').children[0]).toBeInstanceOf(Graphics);

      renderer.update(0.2);
      expect(layer('effect').children).toHaveLength(0);
    });

    it('should start and stop a particle effect', () => {
      const { bus, layer, renderer } = createRenderer();

      bus.emit('effect:play', { type: 'snow', density: 0.1 });
      expect(layer('effect').children).toHaveLength(1);
      expect((layer('effect').children[0] as Container).children).toHaveLength(
        10,
      );

      renderer.update(0.1);
      bus.emit('effect:stop', {});
      expect(layer('effect').children).toHaveLength(0);
    });

    it('should drive the character fade-in through update(dt)', async () => {
      const { bus, layer, renderer } = createRenderer();

      bus.emit('character:show', { id: 'hero', position: 'center' });
      await flush();
      const sprite = layer('chara').children[0] as Sprite;
      expect(sprite.alpha).toBe(0);

      renderer.update(0.15);
      expect(sprite.alpha).toBeCloseTo(0.75);

      renderer.update(0.15);
      expect(sprite.alpha).toBe(1);
    });
  });

  describe('getState / setState', () => {
    it('should snapshot the background and the characters', async () => {
      const { bus, renderer } = createRenderer();
      bus.emit('bg:change', { id: 'bg_room', transition: 'none' });
      bus.emit('character:show', {
        id: 'hero',
        position: 'left',
        transition: 'none',
      });
      await flush();

      expect(renderer.getState()).toEqual({
        bgImage: 'bg_room',
        characters: [
          { id: 'hero', spriteId: 'default', position: 'left', opacity: 1 },
        ],
      });
    });

    it('should restore a snapshot over the current picture', async () => {
      const { bus, layer, renderer } = createRenderer();
      bus.emit('bg:change', { id: 'bg_room', transition: 'none' });
      bus.emit('character:show', {
        id: 'hero',
        position: 'left',
        transition: 'none',
      });
      await flush();
      const snapshot = renderer.getState();

      renderer.setState({ bgImage: null, characters: [] });
      await flush();
      expect(layer('bg').children).toHaveLength(0);
      expect(layer('chara').children).toHaveLength(0);

      renderer.setState(snapshot);
      await flush();
      expect(layer('bg').children).toHaveLength(1);
      expect(layer('chara').children).toHaveLength(1);
      expect(renderer.getState()).toEqual(snapshot);
    });
  });

  describe('failures', () => {
    it('should report an unresolvable sprite without throwing', async () => {
      const { bus, layer, errors } = createRenderer();

      bus.emit('character:show', { id: 'ghost', position: 'left' });
      await flush();

      expect(layer('chara').children).toHaveLength(0);
      expect(errors).toHaveLength(1);
    });
  });

  describe('destroy', () => {
    it('should unbind the events and remove the layer stack', async () => {
      const { bus, stage, renderer } = createRenderer();
      bus.emit('bg:change', { id: 'bg_room', transition: 'none' });
      await flush();

      renderer.destroy();

      expect(stage.children).toHaveLength(0);
      expect(() => renderer.destroy()).not.toThrow();

      bus.emit('bg:change', { id: 'bg_room', transition: 'none' });
      bus.emit('character:show', { id: 'hero', position: 'left' });
      await flush();
      expect(stage.children).toHaveLength(0);
    });
  });
});
