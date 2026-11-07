import { Text } from 'pixi.js';
import type { Settings } from '@/types/engine';
import { DEFAULT_SETTINGS } from '@/settings/SettingsManager';
import { ModalPanel } from './ModalPanel';
import { Slider } from './controls/Slider';
import { Toggle } from './controls/Toggle';
import { UIComponent } from './UIComponent';
import { resolveTheme } from './theme';
import type { DeepPartial, UITheme } from './theme';

export interface SettingsController {
  get(): Settings;
  onChange(patch: Partial<Settings>): void;
}

export interface SettingsMenuOptions {
  width: number;
  height: number;
  controller?: SettingsController;
  title?: string;
  fontSize?: number;
  padding?: number;
  panelColor?: number;
  textColor?: number;
  theme?: DeepPartial<UITheme>;
}

interface ResolvedOptions {
  width: number;
  height: number;
  controller?: SettingsController;
  title: string;
  fontSize: number;
  padding: number;
  panelColor?: number;
  textColor: number;
}

export class SettingsMenu extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly theme: UITheme;
  private readonly modal: ModalPanel;
  private readonly sliders: Record<string, Slider> = {};
  private readonly toggles: Record<string, Toggle> = {};
  private syncing = false;

  constructor(options: SettingsMenuOptions) {
    super({ id: 'settings-menu' });
    this.theme = resolveTheme(options.theme);
    this.opts = {
      width: options.width,
      height: options.height,
      controller: options.controller,
      title: options.title ?? '设置',
      fontSize: options.fontSize ?? this.theme.typography.sizes.md,
      padding: options.padding ?? this.theme.spacing.s24,
      panelColor: options.panelColor,
      textColor: options.textColor ?? this.theme.colors.textSecondary,
    };

    this.modal = new ModalPanel({
      width: this.opts.width,
      height: this.opts.height,
      boxWidthRatio: this.theme.sizes.settingsWidthRatio,
      boxHeightRatio: this.theme.sizes.modalHeightRatio,
      title: this.opts.title,
      padding: this.opts.padding,
      panelColor: this.opts.panelColor,
      onClose: () => this.hide(),
      theme: this.theme,
    });
    this.addChild(this.modal);

    const content = this.modal.content;
    const labelWidth = this.theme.sizes.labelWidth;
    const rowHeight = this.theme.sizes.rowHeight;
    const sliderWidth = this.modal.contentWidth - labelWidth;
    let y = 0;

    const addSlider = (
      key: keyof Settings,
      label: string,
      min: number,
      max: number,
      step: number,
    ): void => {
      this.addLabel(label, y);
      const slider = new Slider({
        width: sliderWidth,
        min,
        max,
        step,
        theme: this.theme,
        onChange: (value) => this.patch({ [key]: value }),
      });
      slider.x = labelWidth;
      // 控件在行高内垂直居中
      slider.y = y + (rowHeight - this.theme.sizes.sliderHeight) / 2;
      this.sliders[key] = slider;
      content.addChild(slider);
      y += rowHeight;
    };

    const addToggle = (key: keyof Settings, label: string): void => {
      this.addLabel(label, y);
      const toggle = new Toggle({
        width: this.theme.sizes.toggleWidth,
        theme: this.theme,
        onChange: (value) => this.togglePatch(key, value),
      });
      toggle.x = labelWidth;
      toggle.y = y + (rowHeight - this.theme.sizes.toggleHeight) / 2;
      this.toggles[key] = toggle;
      content.addChild(toggle);
      y += rowHeight;
    };

    addSlider('masterVolume', '主音量', 0, 1, 0.01);
    addSlider('bgmVolume', '背景音乐', 0, 1, 0.01);
    addSlider('seVolume', '音效', 0, 1, 0.01);
    addSlider('voiceVolume', '语音', 0, 1, 0.01);
    addSlider('textSpeed', '文字速度', 5, 100, 5);
    addToggle('skipMode', '跳过已读');
    addToggle('fullscreen', '全屏');

    this.hide();
  }

  public override show(): void {
    const settings = this.opts.controller?.get() ?? DEFAULT_SETTINGS;
    this.syncing = true;
    for (const [key, slider] of Object.entries(this.sliders)) {
      slider.setValue(settings[key as keyof Settings] as number);
    }
    this.toggles.skipMode.setValue(settings.skipMode === 'all');
    this.toggles.fullscreen.setValue(settings.fullscreen);
    this.syncing = false;
    super.show();
  }

  /** 测试/调试用：按 Settings 键取得对应滑条 */
  public getSlider(key: keyof Settings): Slider | undefined {
    return this.sliders[key];
  }

  /** 测试/调试用：按 Settings 键取得对应开关 */
  public getToggle(key: keyof Settings): Toggle | undefined {
    return this.toggles[key];
  }

  private addLabel(text: string, y: number): void {
    const label = new Text({
      text,
      style: {
        fontFamily: this.theme.typography.fontFamilyBody,
        fontSize: this.opts.fontSize,
        fill: this.opts.textColor,
      },
    });
    label.x = 0;
    label.y = y + this.theme.spacing.s12;
    this.modal.content.addChild(label);
  }

  private togglePatch(key: keyof Settings, value: boolean): void {
    if (key === 'skipMode') {
      this.patch({ skipMode: value ? 'all' : 'read' });
      return;
    }
    this.patch({ [key]: value });
  }

  private patch(patch: Partial<Settings>): void {
    if (this.syncing) {
      return;
    }
    this.opts.controller?.onChange(patch);
  }
}

export default SettingsMenu;
