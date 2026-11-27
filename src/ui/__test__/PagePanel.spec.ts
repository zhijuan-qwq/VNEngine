import type { FederatedPointerEvent } from 'pixi.js';
import { PagePanel } from '../PagePanel';
import { DEFAULT_UI_THEME } from '../theme';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = (await importOriginal()) as typeof import('pixi.js');
  const mod = await import('@/__testUtils__/pixiTextMock');
  const Text = mod.createFakeText(pixi) as unknown as typeof pixi.Text;
  return { ...pixi, Text };
});

function makePanel(
  options: Partial<ConstructorParameters<typeof PagePanel>[0]> = {},
): PagePanel {
  return new PagePanel({
    width: 800,
    height: 600,
    title: '设置',
    ...options,
  });
}

describe('PagePanel', () => {
  it('should fill the whole screen', () => {
    const panel = makePanel();
    const padding = DEFAULT_UI_THEME.spacing.s24;
    expect(panel.content.x).toBe(padding);
    expect(panel.contentWidth).toBe(800 - padding * 2);
    expect(panel.content.y).toBe(panel.contentTop);
  });

  it('should place the title at the top left', () => {
    const panel = makePanel();
    const padding = DEFAULT_UI_THEME.spacing.s24;
    expect(panel.titleText.text).toBe('设置');
    expect(panel.titleText.x).toBe(padding);
    expect(panel.titleText.y).toBe(padding);
  });

  it('should reserve the title and action rows above and below the content', () => {
    const panel = makePanel();
    expect(panel.contentTop).toBeGreaterThan(panel.titleText.y);
    expect(panel.contentHeight).toBeGreaterThan(0);
    expect(panel.contentTop + panel.contentHeight).toBeLessThan(600);
  });

  it('should place the back button at the bottom right', () => {
    const panel = makePanel();
    const { pageActionWidth, closeButtonHeight } = DEFAULT_UI_THEME.sizes;
    const padding = DEFAULT_UI_THEME.spacing.s24;
    expect(panel.backButton.x).toBe(800 - padding - pageActionWidth);
    expect(panel.backButton.y).toBe(600 - padding - closeButtonHeight);
  });

  it('should relayout the content and back button on resize', () => {
    const panel = makePanel();
    panel.relayout(1000, 700);
    const { pageActionWidth, closeButtonHeight } = DEFAULT_UI_THEME.sizes;
    const padding = DEFAULT_UI_THEME.spacing.s24;
    expect(panel.contentWidth).toBe(1000 - padding * 2);
    expect(panel.content.x).toBe(padding);
    expect(panel.content.y).toBe(panel.contentTop);
    expect(panel.backButton.x).toBe(1000 - padding - pageActionWidth);
    expect(panel.backButton.y).toBe(700 - padding - closeButtonHeight);
    expect(panel.contentHeight).toBeGreaterThan(0);
  });

  it('should forward back taps to onBack', () => {
    const onBack = vi.fn();
    const panel = makePanel({ onBack });
    const event = {
      stopPropagation: vi.fn(),
    } as unknown as FederatedPointerEvent;
    panel.backButton.emit('pointertap', event);
    expect(onBack).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it('should update the title at runtime', () => {
    const panel = makePanel();
    panel.setTitle('读取进度');
    expect(panel.titleText.text).toBe('读取进度');
  });

  it('should use a custom back label', () => {
    const panel = makePanel({ backLabel: '返回' });
    const label = panel.backButton.children[1] as unknown as { text: string };
    expect(label.text).toBe('返回');
  });
});
