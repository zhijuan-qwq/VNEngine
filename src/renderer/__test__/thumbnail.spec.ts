import { Container } from 'pixi.js';
import type { Application } from 'pixi.js';
import { captureThumbnail } from '../thumbnail';

interface CanvasLike {
  toDataURL?: (type: string, quality?: number) => string;
}

function makeApp(canvas: CanvasLike): {
  app: Application;
  canvasSpy: ReturnType<typeof vi.fn>;
} {
  const canvasSpy = vi.fn(() => canvas);
  const app = {
    renderer: { extract: { canvas: canvasSpy } },
  } as unknown as Application;
  return { app, canvasSpy };
}

describe('captureThumbnail', () => {
  it('should downscale the scene to a 320px-wide JPEG', () => {
    const toDataURL = vi.fn(() => 'data:image/jpeg;base64,thumb');
    const { app, canvasSpy } = makeApp({ toDataURL });
    const target = new Container();

    expect(captureThumbnail(app, target, 1280, 720)).toBe(
      'data:image/jpeg;base64,thumb',
    );
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.7);

    const options = canvasSpy.mock.calls[0][0] as {
      target: Container;
      frame: { x: number; y: number; width: number; height: number };
      resolution: number;
    };
    expect(options.target).toBe(target);
    expect(options.frame).toMatchObject({
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    });
    expect(options.resolution).toBeCloseTo(0.25);
  });

  it('should keep the 320px width for non-16:9 scenes', () => {
    const { app, canvasSpy } = makeApp({ toDataURL: () => 'data' });

    captureThumbnail(app, new Container(), 800, 600);

    const options = canvasSpy.mock.calls[0][0] as { resolution: number };
    expect(options.resolution).toBeCloseTo(0.4);
  });

  it('should return an empty string when the canvas cannot encode', () => {
    const { app } = makeApp({});

    expect(captureThumbnail(app, new Container(), 1280, 720)).toBe('');
  });

  it('should return an empty string for invalid sizes', () => {
    const { app, canvasSpy } = makeApp({ toDataURL: () => 'data' });

    expect(captureThumbnail(app, new Container(), 0, 720)).toBe('');
    expect(captureThumbnail(app, new Container(), -1, 720)).toBe('');
    expect(captureThumbnail(app, new Container(), 1280, 0)).toBe('');
    expect(captureThumbnail(app, new Container(), NaN, 720)).toBe('');
    expect(canvasSpy).not.toHaveBeenCalled();
  });

  it('should degrade to an empty string when extraction throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = {
      renderer: {
        extract: {
          canvas: vi.fn(() => {
            throw new Error('no gl');
          }),
        },
      },
    } as unknown as Application;

    expect(captureThumbnail(app, new Container(), 1280, 720)).toBe('');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
