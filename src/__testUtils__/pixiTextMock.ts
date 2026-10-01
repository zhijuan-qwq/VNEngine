import type { Container } from 'pixi.js';

/**
 * Builds a pixi `Text`-compatible class backed by the real `Container`, so UI
 * components can be tested in a node environment where `new Text()` would
 * otherwise require a `document`.
 *
 * Usage inside a spec:
 * ```
 * vi.mock('pixi.js', async (importOriginal) => {
 *   const pixi = await importOriginal();
 *   const mod = await import('@/__testUtils__/pixiTextMock');
 *   const Text = mod.createFakeText(pixi) as unknown as typeof pixi.Text;
 *   return { ...pixi, Text };
 * });
 * ```
 */
export function createFakeText(pixi: {
  Container: typeof Container;
}): new (options?: { text?: string; style?: unknown }) => Container {
  return class FakeText extends pixi.Container {
    public text: string;
    public style: Record<string, unknown>;

    constructor(options?: { text?: string; style?: unknown }) {
      super();
      this.text = options?.text ?? '';
      this.style = (options?.style ?? {}) as Record<string, unknown>;
    }

    get width(): number {
      const fontSize = (this.style as { fontSize?: number }).fontSize ?? 16;
      return this.text.length * fontSize * 0.6;
    }

    get height(): number {
      const fontSize = (this.style as { fontSize?: number }).fontSize ?? 16;
      return Math.round(fontSize * 1.2);
    }
  };
}
