import type { FederatedPointerEvent } from 'pixi.js';
import { ConfirmDialog } from '../ConfirmDialog';
import type { ConfirmRequest } from '../ConfirmDialog';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = (await importOriginal()) as typeof import('pixi.js');
  const mod = await import('@/__testUtils__/pixiTextMock');
  const Text = mod.createFakeText(pixi) as unknown as typeof pixi.Text;
  return { ...pixi, Text };
});

function makeDialog(): ConfirmDialog {
  return new ConfirmDialog({ width: 800, height: 600 });
}

function tap(button: { emit(event: string, payload: unknown): void }): void {
  button.emit('pointertap', {
    stopPropagation: vi.fn(),
  } as unknown as FederatedPointerEvent);
}

function labelOf(dialog: ConfirmDialog, index: number): string {
  const label = dialog.buttons[index].children[1] as unknown as {
    text: string;
  };
  return label.text;
}

describe('ConfirmDialog', () => {
  it('should start hidden', () => {
    expect(makeDialog().visible).toBe(false);
  });

  it('should become visible while awaiting a decision', () => {
    const dialog = makeDialog();
    void dialog.confirm({ message: '是否继续？' });
    expect(dialog.visible).toBe(true);
  });

  it('should resolve true when the confirm button is tapped', async () => {
    const dialog = makeDialog();
    const promise = dialog.confirm({ message: '是否继续？' });
    tap(dialog.buttons[1]);
    await expect(promise).resolves.toBe(true);
  });

  it('should resolve false when the cancel button is tapped', async () => {
    const dialog = makeDialog();
    const promise = dialog.confirm({ message: '是否继续？' });
    tap(dialog.buttons[0]);
    await expect(promise).resolves.toBe(false);
  });

  it('should hide once the decision is made', async () => {
    const dialog = makeDialog();
    const promise = dialog.confirm({ message: '是否继续？' });
    tap(dialog.buttons[1]);
    await promise;
    expect(dialog.visible).toBe(false);
  });

  it('should settle a pending request with false when a new one opens', async () => {
    const dialog = makeDialog();
    const first = dialog.confirm({ message: 'first' });
    const second = dialog.confirm({ message: 'second' });
    await expect(first).resolves.toBe(false);
    expect(dialog.visible).toBe(true);
    tap(dialog.buttons[1]);
    await expect(second).resolves.toBe(true);
  });

  it('should resolve false when hidden with a pending request', async () => {
    const dialog = makeDialog();
    const promise = dialog.confirm({ message: '是否继续？' });
    dialog.hide();
    await expect(promise).resolves.toBe(false);
    expect(dialog.visible).toBe(false);
  });

  it('should default the button labels', () => {
    const dialog = makeDialog();
    void dialog.confirm({ message: '是否继续？' });
    expect(labelOf(dialog, 0)).toBe('取消');
    expect(labelOf(dialog, 1)).toBe('确认');
  });

  it('should render the supplied button labels', () => {
    const dialog = makeDialog();
    void dialog.confirm({
      message: '是否继续？',
      cancelText: '算了',
      confirmText: '好的',
    });
    expect(labelOf(dialog, 0)).toBe('算了');
    expect(labelOf(dialog, 1)).toBe('好的');
  });

  it('should throw when the request lacks a message', () => {
    const dialog = makeDialog();
    expect(() => dialog.confirm({} as ConfirmRequest)).toThrow(TypeError);
    expect(() =>
      dialog.confirm(undefined as unknown as ConfirmRequest),
    ).toThrow(TypeError);
  });

  it('should not throw when destroyed without a pending request', () => {
    const dialog = makeDialog();
    expect(() => dialog.destroy()).not.toThrow();
  });
});
