import EventBus from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import type { Plugin, VNEngine } from '@/types/engine';
import PluginManager from '../PluginManager';

function makeGame(): VNEngine {
  return { eventBus: new EventBus<EngineEvents>() } as unknown as VNEngine;
}

function makePlugin(name: string, extra: Partial<Plugin> = {}): Plugin {
  return { name, version: '1.0.0', install: vi.fn(), ...extra };
}

describe('PluginManager', () => {
  describe('register / get / list', () => {
    it('should store registered plugins and expose them', () => {
      const manager = new PluginManager(makeGame());
      const plugin = makePlugin('a');

      manager.register(plugin);

      expect(manager.get('a')).toBe(plugin);
      expect(manager.list()).toEqual([plugin]);
    });

    it('should return null for an unknown plugin', () => {
      const manager = new PluginManager(makeGame());
      expect(manager.get('missing')).toBeNull();
    });

    it('should throw when registering a duplicate name', () => {
      const manager = new PluginManager(makeGame());
      manager.register(makePlugin('a'));

      expect(() => manager.register(makePlugin('a'))).toThrow(
        /already registered/,
      );
    });

    it('should not install plugins on register alone', () => {
      const manager = new PluginManager(makeGame());
      const plugin = makePlugin('a');

      manager.register(plugin);

      expect(plugin.install).not.toHaveBeenCalled();
    });
  });

  describe('loadAll', () => {
    it('should install each plugin with the engine', () => {
      const game = makeGame();
      const manager = new PluginManager(game);
      const plugin = makePlugin('a');

      manager.loadAll([plugin]);

      expect(plugin.install).toHaveBeenCalledOnce();
      expect(plugin.install).toHaveBeenCalledWith(game);
    });

    it('should install dependencies before dependents', () => {
      const manager = new PluginManager(makeGame());
      const order: string[] = [];
      const a = makePlugin('a', {
        dependencies: ['b'],
        install: vi.fn(() => order.push('a')),
      });
      const b = makePlugin('b', {
        install: vi.fn(() => order.push('b')),
      });

      manager.loadAll([a, b]);

      expect(order).toEqual(['b', 'a']);
    });

    it('should install independent plugins in registration order', () => {
      const manager = new PluginManager(makeGame());
      const order: string[] = [];

      manager.loadAll([
        makePlugin('a', { install: vi.fn(() => order.push('a')) }),
        makePlugin('b', { install: vi.fn(() => order.push('b')) }),
        makePlugin('c', { install: vi.fn(() => order.push('c')) }),
      ]);

      expect(order).toEqual(['a', 'b', 'c']);
    });

    it('should throw when a dependency is missing', () => {
      const manager = new PluginManager(makeGame());
      const a = makePlugin('a', { dependencies: ['ghost'] });

      expect(() => manager.loadAll([a])).toThrow(
        /"a" depends on missing plugin "ghost"/,
      );
    });

    it('should throw on circular dependencies', () => {
      const manager = new PluginManager(makeGame());
      const a = makePlugin('a', { dependencies: ['b'] });
      const b = makePlugin('b', { dependencies: ['a'] });

      expect(() => manager.loadAll([a, b])).toThrow(/Circular/);
    });
  });

  describe('unregister', () => {
    it('should uninstall and remove an installed plugin', () => {
      const game = makeGame();
      const manager = new PluginManager(game);
      const plugin = makePlugin('a', { uninstall: vi.fn() });

      manager.loadAll([plugin]);
      manager.unregister('a');

      expect(plugin.uninstall).toHaveBeenCalledWith(game);
      expect(manager.get('a')).toBeNull();
      expect(manager.list()).toEqual([]);
    });

    it('should not call uninstall for a plugin that was never installed', () => {
      const manager = new PluginManager(makeGame());
      const plugin = makePlugin('a', { uninstall: vi.fn() });

      manager.register(plugin);
      manager.unregister('a');

      expect(plugin.uninstall).not.toHaveBeenCalled();
    });

    it('should be a no-op for an unknown name', () => {
      const manager = new PluginManager(makeGame());
      expect(() => manager.unregister('missing')).not.toThrow();
    });
  });

  describe('update', () => {
    it('should forward dt to installed plugins that define update', () => {
      const manager = new PluginManager(makeGame());
      const withUpdate = makePlugin('a', { update: vi.fn() });
      const withoutUpdate = makePlugin('b');

      manager.loadAll([withUpdate, withoutUpdate]);
      manager.update(0.016);

      expect(withUpdate.update).toHaveBeenCalledWith(0.016);
      expect(() => manager.update(0.016)).not.toThrow();
    });

    it('should not update plugins that were unregistered', () => {
      const manager = new PluginManager(makeGame());
      const plugin = makePlugin('a', { update: vi.fn() });

      manager.loadAll([plugin]);
      manager.unregister('a');
      manager.update(0.016);

      expect(plugin.update).not.toHaveBeenCalled();
    });
  });
});
