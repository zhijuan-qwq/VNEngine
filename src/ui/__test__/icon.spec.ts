import { Container } from 'pixi.js';
import { attachIcon, loadIconTexture } from '../icon';

describe('icon', () => {
  it('should resolve to null in an environment without a page', async () => {
    await expect(loadIconTexture('settings')).resolves.toBe(null);
  });

  it('should show the fallback text and hide the sprite until loaded', () => {
    const parent = new Container();
    const { sprite, fallback } = attachIcon(parent, 'close', {
      size: 24,
      fallbackText: '关闭',
    });
    expect(fallback.text).toBe('关闭');
    expect(fallback.visible).toBe(true);
    expect(sprite.visible).toBe(false);
  });
});
