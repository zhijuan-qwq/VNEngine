import { Text } from 'pixi.js';
import type { Settings } from '@/types/engine';
import { Slider } from './controls/Slider';
import { Toggle } from './controls/Toggle';
import { UIComponent } from './UIComponent';
import { createBackdrop, createButton, createPanelBox } from './overlay';

/** 设置子系统缺省值（真正的持久化由后续 SettingsManager 负责） */
export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 1,
  bgmVolume: 1,
  seVolume: 1,
  voiceVolume: 1,
  textSpeed: 25,
  autoSpeed: 1500,
  skipMode: 'read',
  fullscreen: false,
  language: 'zh-CN',
  fontSize: 28,
};

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
}

interface ResolvedOptions {
  width: number;
  height: number;
  controller?: SettingsController;
  title: string;
  fontSize: number;
  padding: number;
  panelColor: number;
  textColor: number;
}

const ROW_HEIGHT = 56;
const LABEL_WIDTH = 130;

export class SettingsMenu extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly sliders: Record<string, Slider> = {};
  private readonly toggles: Record<string, Toggle> = {};
  private syncing = false;

  constructor(options: SettingsMenuOptions) {
    super({ id: 'settings-menu' });
    this.opts = {
      width: options.width,
      height: options.height,
      controller: options.controller,
      title: options.title ?? '设置',
      fontSize: options.fontSize ?? 22,
      padding: options.padding ?? 24,
      panelColor: options.panelColor ?? 0x222222,
      textColor: options.textColor ?? 0xffffff,
    };

    this.addChild(createBackdrop(this.opts.width, this.opts.height));

    const boxWidth = this.opts.width * 0.7;
    const boxHeight = this.opts.height * 0.8;
    const boxX = (this.opts.width - boxWidth) / 2;
    const boxY = (this.opts.height - boxHeight) / 2;
    const box = createPanelBox(boxWidth, boxHeight, {
      color: this.opts.panelColor,
    });
    box.x = boxX;
    box.y = boxY;
    this.addChild(box);

    const padding = this.opts.padding;
    const title = new Text({
      text: this.opts.title,
      style: { fontSize: 26, fill: this.opts.textColor },
    });
    title.x = boxX + padding;
    title.y = boxY + padding;
    this.addChild(title);

    const contentWidth = boxWidth - padding * 2;
    const sliderWidth = contentWidth - LABEL_WIDTH;
    let y = boxY + padding + title.height + padding / 2;

    const addSlider = (
      key: keyof Settings,
      label: string,
      min: number,
      max: number,
      step: number,
    ): void => {
      this.addLabel(label, boxX + padding, y);
      const slider = new Slider({
        width: sliderWidth,
        min,
        max,
        step,
        onChange: (value) => this.patch({ [key]: value }),
      });
      slider.x = boxX + padding + LABEL_WIDTH;
      slider.y = y + 20;
      this.sliders[key] = slider;
      this.addChild(slider);
      y += ROW_HEIGHT;
    };

    const addToggle = (key: keyof Settings, label: string): void => {
      this.addLabel(label, boxX + padding, y);
      const toggle = new Toggle({
        width: 60,
        onChange: (value) => this.togglePatch(key, value),
      });
      toggle.x = boxX + padding + LABEL_WIDTH;
      toggle.y = y + 8;
      this.toggles[key] = toggle;
      this.addChild(toggle);
      y += ROW_HEIGHT;
    };

    addSlider('masterVolume', '主音量', 0, 1, 0.01);
    addSlider('bgmVolume', '背景音乐', 0, 1, 0.01);
    addSlider('seVolume', '音效', 0, 1, 0.01);
    addSlider('voiceVolume', '语音', 0, 1, 0.01);
    addSlider('textSpeed', '文字速度', 5, 100, 5);
    addToggle('skipMode', '跳过已读');
    addToggle('fullscreen', '全屏');

    const closeHeight = 44;
    const close = createButton({
      width: 120,
      height: closeHeight,
      label: '关闭',
      fontSize: this.opts.fontSize,
      onTap: () => this.hide(),
    });
    close.x = boxX + (boxWidth - 120) / 2;
    close.y = boxY + boxHeight - padding - closeHeight;
    this.addChild(close);

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

  private addLabel(text: string, x: number, y: number): void {
    const label = new Text({
      text,
      style: { fontSize: this.opts.fontSize, fill: this.opts.textColor },
    });
    label.x = x;
    label.y = y + 12;
    this.addChild(label);
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
