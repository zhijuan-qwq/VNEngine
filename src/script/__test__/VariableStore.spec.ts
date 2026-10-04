import VariableStore from '../VariableStore';
import type { VariableStoreData } from '../VariableStore';

describe('VariableStore', () => {
  let store: VariableStore;

  beforeEach(() => {
    store = new VariableStore();
  });

  describe('variables', () => {
    it('should start empty', () => {
      expect(store.has('score')).toBe(false);
      expect(store.get('score')).toBeUndefined();
    });

    it('should set and get a value', () => {
      store.set('score', 42);
      expect(store.has('score')).toBe(true);
      expect(store.get('score')).toBe(42);
    });

    it('should overwrite an existing value', () => {
      store.set('score', 1);
      store.set('score', 2);
      expect(store.get('score')).toBe(2);
    });

    it('should store values of every type', () => {
      store.set('num', 3.14);
      store.set('str', 'hello');
      store.set('bool', true);
      store.set('obj', { a: 1 });
      store.set('nil', null);

      expect(store.get('num')).toBe(3.14);
      expect(store.get('str')).toBe('hello');
      expect(store.get('bool')).toBe(true);
      expect(store.get('obj')).toEqual({ a: 1 });
      expect(store.get('nil')).toBeNull();
    });

    it('should delete a value', () => {
      store.set('score', 42);
      store.delete('score');
      expect(store.has('score')).toBe(false);
      expect(store.get('score')).toBeUndefined();
    });

    it('should not throw when deleting a missing value', () => {
      expect(() => store.delete('missing')).not.toThrow();
    });
  });

  describe('flags', () => {
    it('should start with no flags', () => {
      expect(store.hasFlag('met_hero')).toBe(false);
    });

    it('should set, clear and clear all flags', () => {
      store.setFlag('a');
      store.setFlag('b');
      expect(store.hasFlag('a')).toBe(true);
      expect(store.hasFlag('b')).toBe(true);

      store.clearFlag('a');
      expect(store.hasFlag('a')).toBe(false);
      expect(store.hasFlag('b')).toBe(true);

      store.clearAllFlags();
      expect(store.hasFlag('b')).toBe(false);
    });

    it('should toggle a flag on and off', () => {
      store.toggleFlag('auto');
      expect(store.hasFlag('auto')).toBe(true);
      store.toggleFlag('auto');
      expect(store.hasFlag('auto')).toBe(false);
    });
  });

  describe('dump', () => {
    it('should return empty containers for a fresh store', () => {
      expect(store.dump()).toEqual({ variables: {}, flags: [] });
    });

    it('should serialize variables and flags', () => {
      store.set('score', 10);
      store.set('name', 'Alice');
      store.setFlag('met_hero');

      expect(store.dump()).toEqual({
        variables: { score: 10, name: 'Alice' },
        flags: ['met_hero'],
      });
    });

    it('should keep a variable named __proto__ as an own key', () => {
      store.set('__proto__', 'kept');

      const data = store.dump();

      expect(
        Object.prototype.hasOwnProperty.call(data.variables, '__proto__'),
      ).toBe(true);
      expect(data.variables['__proto__']).toBe('kept');
    });
  });

  describe('restore', () => {
    it('should replace the current variables and flags', () => {
      store.set('stale', 1);
      store.setFlag('old');

      store.restore({
        variables: { hp: 100 },
        flags: ['met_hero'],
      });

      expect(store.has('stale')).toBe(false);
      expect(store.get('hp')).toBe(100);
      expect(store.hasFlag('old')).toBe(false);
      expect(store.hasFlag('met_hero')).toBe(true);
    });

    it('should round-trip through dump', () => {
      store.set('score', 7);
      store.set('flag_value', false);
      store.setFlag('seen');

      const snapshot = store.dump();
      const restored = new VariableStore();
      restored.restore(snapshot);

      expect(restored.dump()).toEqual(snapshot);
    });

    it('should throw when data.variables is null', () => {
      expect(() =>
        store.restore({
          variables: null,
          flags: [],
        } as unknown as VariableStoreData),
      ).toThrow('expects data.variables to be an object');
    });

    it('should throw when data.variables is an array', () => {
      expect(() =>
        store.restore({
          variables: ['a', 'b'],
          flags: [],
        } as unknown as VariableStoreData),
      ).toThrow('expects data.variables to be an object');
    });

    it('should throw when data.flags is not an array', () => {
      expect(() =>
        store.restore({
          variables: {},
          flags: 'seen',
        } as unknown as VariableStoreData),
      ).toThrow('expects data.flags to be an array');
    });

    it('should leave the store untouched when the data is invalid', () => {
      store.set('keep', 1);
      store.setFlag('kept');

      expect(() =>
        store.restore({
          variables: null,
          flags: [],
        } as unknown as VariableStoreData),
      ).toThrow(TypeError);

      expect(store.get('keep')).toBe(1);
      expect(store.hasFlag('kept')).toBe(true);
    });
  });
});
