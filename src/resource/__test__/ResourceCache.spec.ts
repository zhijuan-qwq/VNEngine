import ResourceCache from '../ResourceCache';

describe('ResourceCache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get', () => {
    it('returns null for an unknown id', () => {
      const cache = new ResourceCache<string>();
      expect(cache.get('missing')).toBeNull();
    });

    it('returns the stored value for an existing id', () => {
      const cache = new ResourceCache<string>();
      cache.set('hero', 'texture');
      expect(cache.get('hero')).toBe('texture');
    });
  });

  describe('set', () => {
    it('stores a value retrievable via get and has', () => {
      const cache = new ResourceCache<string>();
      cache.set('bg', 'bg.png');
      expect(cache.has('bg')).toBe(true);
      expect(cache.get('bg')).toBe('bg.png');
    });

    it('overwrites the value for an existing id', () => {
      const cache = new ResourceCache<string>();
      cache.set('bg', 'old.png');
      cache.set('bg', 'new.png');
      expect(cache.get('bg')).toBe('new.png');
    });
  });

  describe('has', () => {
    it('returns false before set and after delete', () => {
      const cache = new ResourceCache<string>();
      expect(cache.has('x')).toBe(false);
      cache.set('x', '1');
      expect(cache.has('x')).toBe(true);
      cache.delete('x');
      expect(cache.has('x')).toBe(false);
    });
  });

  describe('delete', () => {
    it('removes the entry so get returns null', () => {
      const cache = new ResourceCache<string>();
      cache.set('x', '1');
      cache.delete('x');
      expect(cache.get('x')).toBeNull();
    });
  });

  describe('clear', () => {
    it('empties all entries', () => {
      const cache = new ResourceCache<string>();
      cache.set('a', '1');
      cache.set('b', '2');
      cache.clear();
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(false);
    });
  });

  describe('LRU eviction', () => {
    it('defaults to 100 entries and evicts the earliest when exceeded', () => {
      vi.useFakeTimers();
      const cache = new ResourceCache<string>();
      for (let i = 0; i < 101; i++) {
        vi.setSystemTime(i * 10);
        cache.set(`id${i}`, `v${i}`);
      }
      expect(cache.has('id0')).toBe(false);
      expect(cache.has('id100')).toBe(true);
      expect(cache.get('id100')).toBe('v100');
    });

    it('evicts the least recently used entry when at capacity', () => {
      vi.useFakeTimers();
      const cache = new ResourceCache<string>(2);
      vi.setSystemTime(0);
      cache.set('a', 'A');
      vi.setSystemTime(10);
      cache.set('b', 'B');
      vi.setSystemTime(20);
      cache.get('a'); // touch a so b becomes the oldest
      vi.setSystemTime(30);
      cache.set('c', 'C');

      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
    });

    it('evicts the oldest entry when none was touched', () => {
      vi.useFakeTimers();
      const cache = new ResourceCache<string>(2);
      vi.setSystemTime(0);
      cache.set('a', 'A');
      vi.setSystemTime(10);
      cache.set('b', 'B');
      vi.setSystemTime(20);
      cache.set('c', 'C');

      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
    });
  });
});
