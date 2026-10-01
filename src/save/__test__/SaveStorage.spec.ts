import { LocalStorageProvider } from '../SaveStorage';

function makeFakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as unknown as Storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LocalStorageProvider', () => {
  it('should return null for a missing key', () => {
    const provider = new LocalStorageProvider(makeFakeStorage());

    expect(provider.getItem('nope')).toBeNull();
  });

  it('should round-trip a value written with setItem', () => {
    const provider = new LocalStorageProvider(makeFakeStorage());

    provider.setItem('save_0', '{"version":1}');

    expect(provider.getItem('save_0')).toBe('{"version":1}');
  });

  it('should list every stored key', () => {
    const provider = new LocalStorageProvider(makeFakeStorage());

    provider.setItem('save_0', 'a');
    provider.setItem('other', 'b');

    expect(provider.keys().sort()).toEqual(['other', 'save_0']);
  });

  it('should return an empty list when nothing is stored', () => {
    const provider = new LocalStorageProvider(makeFakeStorage());

    expect(provider.keys()).toEqual([]);
  });

  it('should default to the global localStorage', () => {
    const fake = makeFakeStorage();
    vi.stubGlobal('localStorage', fake);

    const provider = new LocalStorageProvider();
    provider.setItem('save_1', 'x');

    expect(fake.getItem('save_1')).toBe('x');
  });
});
