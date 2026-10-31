import { Text } from 'pixi.js';
import type { Settings } from '@/types/engine';
import { DEFAULT_SETTINGS } from '@/settings/SettingsManager';
import { Slider } from './controls/Slider';
import { Toggle } from './controls/Toggle';
import { UIComponent } from './UIComponent';
import { createFullscreenPanel, createPanelHeader } from './overlay';
import { THEME } from './theme';

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

const ROW_HEIGHT = 66;
const LABEL_WIDTH = 180;
/** 整页设置项内容列的最大宽度（全屏界面下避免行被拉得过宽） */
const COLUMN_MAX_WIDTH = 880;
const PAGE_TOP = 28;

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
      padding: options.padding ?? 48,
      panelColor: options.panelColor ?? THEME.panel,
      textColor: options.textColor ?? THEME.text,
    };

    // 独占全屏：整页底色即界面，不透出底下画面
    this.addChild(
      createFullscreenPanel(this.opts.width, this.opts.height, {
        color: this.opts.panelColor,
      }),
    );

    const padding = this.opts.padding;
    const pageWidth = this.opts.width - padding * 2;
    const header = createPanelHeader({
      title: this.opts.title,
      width: pageWidth,
      onClose: () => this.hide(),
    });
    header.root.x = padding;
    header.root.y = PAGE_TOP;
    this.addChild(header.root);

    const columnWidth = Math.min(pageWidth, COLUMN_MAX_WIDTH);
    const columnX = (this.opts.width - columnWidth) / 2;
    const sliderWidth = columnWidth - LABEL_WIDTH - 24;
    let y = PAGE_TOP + header.height + 28;

    const addSlider = (
      key: keyof Settings,
      label: string,
      min: number,
      max: number,
      step: number,
    ): void => {
      this.addRowLabel(label, columnX, y);
      const slider = new Slider({
        width: sliderWidth,
        min,
        max,
        step,
        onChange: (value) => this.patch({ [key]: value }),
      });
      slider.x = columnX + LABEL_WIDTH;
      slider.y = y + (ROW_HEIGHT - slider.height) / 2;
      this.sliders[key] = slider;
      this.addChild(slider);
      y += ROW_HEIGHT;
    };

    const addToggle = (key: keyof Settings, label: string): void => {
      this.addRowLabel(label, columnX, y);
      const toggle = new Toggle({
        width: 60,
        onChange: (value) => this.togglePatch(key, value),
      });
      toggle.x = columnX + LABEL_WIDTH;
      toggle.y = y + (ROW_HEIGHT - toggle.height) / 2;
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

  private addRowLabel(text: string, x: number, y: number): void {
    const label = new Text({
      text,
      style: {
        fontSize: this.opts.fontSize,
        fontFamily: THEME.fontFamily,
        fill: this.opts.textColor,
      },
    });
    label.x = x;
    label.y = y + (ROW_HEIGHT - label.height) / 2;
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
