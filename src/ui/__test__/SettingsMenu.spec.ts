import type { Settings } from '@/types/engine';
import { DEFAULT_SETTINGS } from '@/settings/SettingsManager';
import { SettingsMenu } from '../SettingsMenu';
import type { SettingsController } from '../SettingsMenu';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = (await importOriginal()) as typeof import('pixi.js');
  const mod = await import('@/__testUtils__/pixiTextMock');
  const Text = mod.createFakeText(pixi) as unknown as typeof pixi.Text;
  return { ...pixi, Text };
});

function makeController(overrides: Partial<Settings> = {}): {
  controller: SettingsController;
  onChange: ReturnType<typeof vi.fn>;
} {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...overrides };
  const onChange = vi.fn();
  return { controller: { get: () => settings, onChange }, onChange };
}

function makeMenu(controller?: SettingsController): SettingsMenu {
  return new SettingsMenu({ width: 800, height: 600, controller });
}

describe('SettingsMenu', () => {
  it('should export the default settings', () => {
    expect(DEFAULT_SETTINGS.masterVolume).toBe(1);
    expect(DEFAULT_SETTINGS.textSpeed).toBe(25);
    expect(DEFAULT_SETTINGS.skipMode).toBe('read');
  });

  it('should start hidden', () => {
    expect(makeMenu().visible).toBe(false);
  });

  it('should sync sliders from the controller on show', () => {
    const { controller } = makeController({ masterVolume: 0.4, textSpeed: 60 });
    const menu = makeMenu(controller);
    menu.show();
    expect(menu.getSlider('masterVolume')?.value).toBe(0.4);
    expect(menu.getSlider('textSpeed')?.value).toBe(60);
  });

  it('should sync toggles from the controller on show', () => {
    const { controller } = makeController({
      skipMode: 'all',
      fullscreen: true,
    });
    const menu = makeMenu(controller);
    menu.show();
    expect(menu.getToggle('skipMode')?.value).toBe(true);
    expect(menu.getToggle('fullscreen')?.value).toBe(true);
  });

  it('should not emit onChange while syncing', () => {
    const { controller, onChange } = makeController({ masterVolume: 0.4 });
    const menu = makeMenu(controller);
    menu.show();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should forward slider changes to the controller', () => {
    const { controller, onChange } = makeController();
    const menu = makeMenu(controller);
    menu.getSlider('masterVolume')?.setValue(0.5);
    expect(onChange).toHaveBeenCalledWith({ masterVolume: 0.5 });
  });

  it('should map the skipMode toggle to the mode string', () => {
    const { controller, onChange } = makeController();
    const menu = makeMenu(controller);
    menu.getToggle('skipMode')?.toggle();
    expect(onChange).toHaveBeenCalledWith({ skipMode: 'all' });
  });

  it('should fall back to defaults without a controller', () => {
    const menu = makeMenu();
    menu.show();
    expect(menu.getSlider('textSpeed')?.value).toBe(25);
    expect(menu.getToggle('fullscreen')?.value).toBe(false);
  });

  it('should not throw on interaction without a controller', () => {
    const menu = makeMenu();
    expect(() => menu.getSlider('masterVolume')?.setValue(0.7)).not.toThrow();
    expect(() => menu.getToggle('fullscreen')?.toggle()).not.toThrow();
  });
});
