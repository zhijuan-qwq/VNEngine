import { Container, Text } from 'pixi.js';
import type { Settings } from '@/types/engine';
import { DEFAULT_SETTINGS } from '@/settings/SettingsManager';
import { PagePanel } from './PagePanel';
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
  /** 点击右下角返回；缺省隐藏自身 */
  onClose?: () => void;
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
  private readonly page: PagePanel;
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

    this.page = new PagePanel({
      width: this.opts.width,
      height: this.opts.height,
      title: this.opts.title,
      padding: this.opts.padding,
      panelColor: this.opts.panelColor,
      onBack: this.hideOnClose(options.onClose),
      theme: this.theme,
    });
    this.addChild(this.page);

    this.buildContent();
    this.hide();
  }

  /** 视口变化时重排页面骨架并按新尺寸重建控件 */
  public resize(width: number, height: number): void {
    this.opts.width = width;
    this.opts.height = height;
    this.page.relayout(width, height);
    this.buildContent();
    this.syncValues();
  }

  public override show(): void {
    this.syncValues();
    super.show();
  }

  private syncValues(): void {
    const settings = this.opts.controller?.get() ?? DEFAULT_SETTINGS;
    this.syncing = true;
    for (const [key, slider] of Object.entries(this.sliders)) {
      slider.setValue(settings[key as keyof Settings] as number);
    }
    this.toggles.skipMode.setValue(settings.skipMode === 'all');
    this.toggles.fullscreen.setValue(settings.fullscreen);
    this.syncing = false;
  }

  private buildContent(): void {
    for (const child of this.page.content.children.slice()) {
      child.destroy({ children: true });
    }
    for (const key of Object.keys(this.sliders)) delete this.sliders[key];
    for (const key of Object.keys(this.toggles)) delete this.toggles[key];

    const columnGap = this.theme.spacing.s48;
    const columnWidth = (this.page.contentWidth - columnGap) / 2;
    const audio = new Container();
    const display = new Container();
    display.x = columnWidth + columnGap;
    this.page.content.addChild(audio, display);

    const audioHeading = this.addHeading('音频', audio);
    const displayHeading = this.addHeading('文字与显示', display);

    const labelWidth = this.theme.sizes.labelWidth;
    const rowHeight = this.theme.sizes.rowHeight;
    const sliderWidth = columnWidth - labelWidth;
    const headingGap = this.theme.spacing.s16;
    let audioY = audioHeading.height + headingGap;
    let displayY = displayHeading.height + headingGap;

    const addSlider = (
      parent: Container,
      key: keyof Settings,
      label: string,
      min: number,
      max: number,
      step: number,
      y: number,
    ): number => {
      this.addLabel(parent, label, y);
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
      parent.addChild(slider);
      return y + rowHeight;
    };

    const addToggle = (
      parent: Container,
      key: keyof Settings,
      label: string,
      y: number,
    ): number => {
      this.addLabel(parent, label, y);
      const toggle = new Toggle({
        width: this.theme.sizes.toggleWidth,
        theme: this.theme,
        onChange: (value) => this.togglePatch(key, value),
      });
      toggle.x = labelWidth;
      toggle.y = y + (rowHeight - this.theme.sizes.toggleHeight) / 2;
      this.toggles[key] = toggle;
      parent.addChild(toggle);
      return y + rowHeight;
    };

    audioY = addSlider(audio, 'masterVolume', '主音量', 0, 1, 0.01, audioY);
    audioY = addSlider(audio, 'bgmVolume', '背景音乐', 0, 1, 0.01, audioY);
    audioY = addSlider(audio, 'seVolume', '音效', 0, 1, 0.01, audioY);
    addSlider(audio, 'voiceVolume', '语音', 0, 1, 0.01, audioY);

    displayY = addSlider(display, 'textSpeed', '文字速度', 5, 100, 5, displayY);
    displayY = addToggle(display, 'skipMode', '跳过已读', displayY);
    addToggle(display, 'fullscreen', '全屏', displayY);
  }

  /** 测试/调试用：按 Settings 键取得对应滑条 */
  public getSlider(key: keyof Settings): Slider | undefined {
    return this.sliders[key];
  }

  /** 测试/调试用：按 Settings 键取得对应开关 */
  public getToggle(key: keyof Settings): Toggle | undefined {
    return this.toggles[key];
  }

  private addHeading(text: string, parent: Container): Text {
    const heading = new Text({
      text,
      style: {
        fontFamily: this.theme.typography.fontFamilyBody,
        fontSize: this.theme.typography.sizes.lg,
        fontWeight: this.theme.typography.weights.semibold,
        fill: this.theme.colors.accent,
      },
    });
    parent.addChild(heading);
    return heading;
  }

  private addLabel(parent: Container, text: string, y: number): void {
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
    parent.addChild(label);
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
