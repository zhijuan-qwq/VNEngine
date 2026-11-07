import type { FederatedPointerEvent } from 'pixi.js';
import { ModalPanel } from '../ModalPanel';
import { DEFAULT_UI_THEME } from '../theme';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = (await importOriginal()) as typeof import('pixi.js');
  const mod = await import('@/__testUtils__/pixiTextMock');
  const Text = mod.createFakeText(pixi) as unknown as typeof pixi.Text;
  return { ...pixi, Text };
});

function makePanel(
  options: Partial<ConstructorParameters<typeof ModalPanel>[0]> = {},
): ModalPanel {
  return new ModalPanel({
    width: 800,
    height: 600,
    title: '设置',
    ...options,
  });
}

describe('ModalPanel', () => {
  it('should center an 80% panel by default', () => {
    const panel = makePanel();
    expect(panel.panelWidth).toBe(640);
    expect(panel.panelHeight).toBe(480);
    expect(panel.panelX).toBe(80);
    expect(panel.panelY).toBe(60);
  });

  it('should honour custom box ratios', () => {
    const panel = makePanel({ boxWidthRatio: 0.5, boxHeightRatio: 0.25 });
    expect(panel.panelWidth).toBe(400);
    expect(panel.panelHeight).toBe(150);
    expect(panel.panelX).toBe(200);
    expect(panel.panelY).toBe(225);
  });

  it('should reserve padding and a title area above the content', () => {
    const panel = makePanel();
    const padding = DEFAULT_UI_THEME.spacing.s24;
    expect(panel.titleText).toBeDefined();
    expect(panel.content.x).toBe(panel.panelX + padding);
    expect(panel.content.y).toBe(panel.contentTop);
    expect(panel.contentWidth).toBe(panel.panelWidth - padding * 2);
    expect(panel.contentTop).toBeGreaterThan(panel.panelY + padding);
    expect(panel.contentHeight).toBeGreaterThan(0);
  });

  it('should place the close button centered at the bottom of the box', () => {
    const panel = makePanel();
    const { closeButtonWidth, closeButtonHeight } = DEFAULT_UI_THEME.sizes;
    const padding = DEFAULT_UI_THEME.spacing.s24;
    expect(panel.closeButton.x).toBe(
      panel.panelX + (panel.panelWidth - closeButtonWidth) / 2,
    );
    expect(panel.closeButton.y).toBe(
      panel.panelY + panel.panelHeight - padding - closeButtonHeight,
    );
  });

  it('should forward close taps to onClose', () => {
    const onClose = vi.fn();
    const panel = makePanel({ onClose });
    const event = {
      stopPropagation: vi.fn(),
    } as unknown as FederatedPointerEvent;
    panel.closeButton.emit('pointertap', event);
    expect(onClose).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it('should update the title at runtime', () => {
    const panel = makePanel();
    panel.setTitle('读取进度');
    expect(panel.titleText.text).toBe('读取进度');
  });

  it('should use a custom close label', () => {
    const panel = makePanel({ closeLabel: '返回' });
    const label = panel.closeButton.children[1] as unknown as { text: string };
    expect(label.text).toBe('返回');
  });
});
