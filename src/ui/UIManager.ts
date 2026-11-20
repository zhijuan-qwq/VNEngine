import { Container } from 'pixi.js';
import type { EventBus } from '@/core/EventBus';
import type { EngineEvents, UiPanel } from '@/types/events';
import type { VarResolver } from '@/types/text';
import { DialogueBox } from './DialogueBox';
import type { DialogueBoxOptions } from './DialogueBox';
import { ChoicePanel } from './ChoicePanel';
import type { ChoicePanelOptions } from './ChoicePanel';
import { ConfirmDialog } from './ConfirmDialog';
import type { ConfirmDialogOptions, ConfirmRequest } from './ConfirmDialog';
import { SaveLoadMenu } from './SaveLoadMenu';
import type { SaveLoadMenuOptions } from './SaveLoadMenu';
import type { SaveSlotInfo } from '@/types/save';
import type { UIComponent } from './UIComponent';
import { SettingsMenu } from './SettingsMenu';
import type { SettingsMenuOptions } from './SettingsMenu';
import { HistoryView } from './HistoryView';
import type { HistoryViewOptions } from './HistoryView';
import { DialogueHistory } from './DialogueHistory';
import { MenuBar } from './MenuBar';
import type { MenuBarOptions } from './MenuBar';
import { cancelFrame, now, requestFrame } from '@/utils/APIHelper';
import { resolveTheme } from './theme';
import type { DeepPartial, UITheme } from './theme';

export interface UIManagerOptions {
  width: number;
  height: number;
  x?: number;
  y?: number;
  resolveVar?: VarResolver;
  /** 全局主题覆盖；未传时使用内置暖调暗色主题 */
  theme?: DeepPartial<UITheme>;
  dialogueBox?: Partial<DialogueBoxOptions>;
  choicePanel?: Partial<ChoicePanelOptions>;
  settingsMenu?: Partial<SettingsMenuOptions>;
  saveLoadMenu?: Partial<SaveLoadMenuOptions>;
  historyView?: Partial<HistoryViewOptions>;
  confirmDialog?: Partial<ConfirmDialogOptions>;
  menuBar?: Partial<MenuBarOptions>;
  /** 打开存档页前抓取当前游戏画面（data URL）；缺省不生成缩略图 */
  captureThumbnail?: () => string;
  autoTick?: boolean;
}

const MAX_FRAME_MS = 100;
const PAGE_FADE_SECONDS = 0.15;

interface PageFade {
  view: UIComponent;
  from: number;
  to: number;
  elapsed: number;
  duration: number;
  hideOnDone: boolean;
}

/**
 * UI 门面（见架构文档 §8.1）：持有对话核心（DialogueBox/ChoicePanel）与四个内置面板，
 * 订阅脚本事件与 ui:open/ui:close，并对外暴露 open/close/confirm 供脚本命令层调用。
 */
export class UIManager {
  readonly root: Container;
  readonly dialogueBox: DialogueBox;
  readonly choicePanel: ChoicePanel;
  readonly confirmDialog: ConfirmDialog;
  readonly saveLoadMenu: SaveLoadMenu;
  readonly settingsMenu: SettingsMenu;
  readonly historyView: HistoryView;
  readonly menuBar: MenuBar;
  readonly history: DialogueHistory;

  private readonly bus: EventBus<EngineEvents>;
  private readonly captureThumbnail?: () => string;
  private readonly getSlots?: () => readonly SaveSlotInfo[];
  private rafId: number | null = null;
  private lastTime = 0;
  private pendingThumbnail = '';
  private fades: PageFade[] = [];
  /** 引擎暂停时 Updater 不再调用 update，淡入淡出需要立即完成，否则页面停在 alpha=0 */
  private paused = false;

  constructor(bus: EventBus<EngineEvents>, options: UIManagerOptions) {
    this.bus = bus;
    const theme = resolveTheme(options.theme);
    // 面板级主题是在全局主题之上叠加的局部覆盖，而不是另起一套默认主题
    const themeFor = (overrides?: DeepPartial<UITheme>): UITheme =>
      overrides ? resolveTheme(overrides, theme) : theme;

    this.root = new Container();
    this.root.x = options.x ?? 0;
    this.root.y = options.y ?? 0;

    const dialogue = options.dialogueBox ?? {};
    // 缺省为底部对话框条（高度的 30%），避免整屏遮罩
    const boxHeight =
      dialogue.height ??
      Math.round(options.height * theme.sizes.dialogueHeightRatio);
    this.dialogueBox = new DialogueBox({
      ...dialogue,
      x: dialogue.x ?? 0,
      y: dialogue.y ?? options.height - boxHeight,
      width: dialogue.width ?? options.width,
      height: boxHeight,
      theme: themeFor(dialogue.theme),
      eventBus: bus,
      resolveVar: options.resolveVar,
    });

    const choice = options.choicePanel ?? {};
    this.choicePanel = new ChoicePanel({
      ...choice,
      width: choice.width ?? options.width,
      height: choice.height ?? options.height,
      theme: themeFor(choice.theme),
      onSelect: (label) => bus.emit('script:choice:selected', { label }),
    });

    const size = { width: options.width, height: options.height };
    const saveOptions = options.saveLoadMenu;
    this.captureThumbnail = options.captureThumbnail;
    this.getSlots = saveOptions?.getSlots;
    this.saveLoadMenu = new SaveLoadMenu({
      ...size,
      ...saveOptions,
      onSave: (slot) => this.requestSave(slot, saveOptions?.onSave),
      onLoad: (slot) => this.requestLoad(slot, saveOptions?.onLoad),
      onClose: () => this.close(),
      theme: themeFor(saveOptions?.theme),
    });
    this.settingsMenu = new SettingsMenu({
      ...size,
      ...options.settingsMenu,
      onClose: () => this.close(),
      theme: themeFor(options.settingsMenu?.theme),
    });
    this.history = new DialogueHistory(bus);
    this.historyView = new HistoryView({
      ...size,
      getEntries: () => this.history.entries(),
      ...options.historyView,
      onClose: () => this.close(),
      theme: themeFor(options.historyView?.theme),
    });
    this.confirmDialog = new ConfirmDialog({
      ...size,
      ...options.confirmDialog,
      theme: themeFor(options.confirmDialog?.theme),
    });

    // 层级：按钮栏夹在对话核心与四个模态面板之间。这样无面板时按钮可点
    // （盖住对话框/选项），有面板时面板的全屏背板又盖住按钮（见 InputManager
    // 的命中层位于 root 首个子节点，最底层）。
    this.menuBar = new MenuBar(bus, {
      ...size,
      ...options.menuBar,
      theme: themeFor(options.menuBar?.theme),
    });

    this.root.addChild(
      this.dialogueBox,
      this.choicePanel,
      this.menuBar,
      this.saveLoadMenu,
      this.settingsMenu,
      this.historyView,
      this.confirmDialog,
    );

    bus.on('script:say', this.handleSay);
    bus.on('script:clear', this.handleClear);
    bus.on('script:choice', this.handleChoice);
    bus.on('script:end', this.handleEnd);
    // 读档后脚本会从阻塞指令重放，先清掉旧对话/选项，重放事件会重新填充
    bus.on('game:load', this.handleEnd);
    bus.on('ui:open', this.handleOpen);
    bus.on('ui:close', this.handleClose);
    bus.on('game:save', this.handleSaved);
    bus.on('game:pause', this.handlePause);
    bus.on('game:resume', this.handleResume);

    if (options.autoTick !== false) {
      this.startTicking();
    }
  }

  public update(dt: number): void {
    // Updater 以秒为 dt（引擎约定）；打字机以毫秒推进
    this.dialogueBox.update(dt * 1000);
    this.updateFades(dt);
  }

  /** 打字机是否正在逐字显示（供 InputManager 决定点击语义） */
  public isBusy(): boolean {
    return this.dialogueBox.isBusy();
  }

  /** 打开某个页面（互斥：先关闭其它页面） */
  public open(panel: UiPanel): void {
    this.closeInstant();
    // 缩略图必须趁游戏画面还在时抓；页面一旦显示就把它盖住了
    if (panel === 'save') {
      this.pendingThumbnail = this.captureThumbnail?.() ?? '';
    }
    switch (panel) {
      case 'settings':
        this.settingsMenu.show();
        this.fadeIn(this.settingsMenu);
        break;
      case 'history':
        this.historyView.show();
        this.fadeIn(this.historyView);
        break;
      case 'save':
      case 'load':
        this.saveLoadMenu.show(panel);
        this.fadeIn(this.saveLoadMenu);
        break;
    }
  }

  /** 关闭所有页面（淡出） */
  public close(): void {
    this.fadeOut(this.saveLoadMenu);
    this.fadeOut(this.settingsMenu);
    this.fadeOut(this.historyView);
    this.confirmDialog.hide();
  }

  /** 打开确认框（互斥：先关闭其它页面），返回用户是否确认 */
  public confirm(request: ConfirmRequest): Promise<boolean> {
    this.closeInstant();
    return this.confirmDialog.confirm(request);
  }

  public destroy(): void {
    this.stopTicking();
    this.bus.off('script:say', this.handleSay);
    this.bus.off('script:clear', this.handleClear);
    this.bus.off('script:choice', this.handleChoice);
    this.bus.off('script:end', this.handleEnd);
    this.bus.off('game:load', this.handleEnd);
    this.bus.off('ui:open', this.handleOpen);
    this.bus.off('ui:close', this.handleClose);
    this.bus.off('game:save', this.handleSaved);
    this.bus.off('game:pause', this.handlePause);
    this.bus.off('game:resume', this.handleResume);
    this.fades = [];
    this.dialogueBox.destroy();
    this.choicePanel.destroy();
    this.saveLoadMenu.destroy();
    this.settingsMenu.destroy();
    this.historyView.destroy();
    this.history.destroy();
    this.confirmDialog.destroy();
    this.menuBar.destroy();
  }

  private readonly handleSay = (payload: EngineEvents['script:say']): void => {
    this.dialogueBox.show(payload.speaker, payload.text, payload.speed);
    this.choicePanel.hide();
  };

  private readonly handleClear = (): void => {
    this.dialogueBox.clear();
  };

  private readonly handleChoice = (
    payload: EngineEvents['script:choice'],
  ): void => {
    this.choicePanel.show(payload.choices, payload.mode ?? 'adv');
  };

  private readonly handleEnd = (): void => {
    this.dialogueBox.clear();
    this.choicePanel.hide();
  };

  private readonly handleOpen = (payload: EngineEvents['ui:open']): void => {
    this.open(payload.panel);
  };

  private readonly handleClose = (): void => {
    this.close();
  };

  private readonly handleSaved = (): void => {
    this.saveLoadMenu.refresh();
  };

  private readonly handlePause = (): void => {
    this.paused = true;
    // 暂停后 update 不再被调用，把进行中的过渡直接落定，避免页面卡在半透明
    this.snapFades();
  };

  private readonly handleResume = (): void => {
    this.paused = false;
  };

  /**
   * 点击槽位后先处理覆盖确认，再由回调把缓存缩略图带入存档。
   * 确认框叠在页面上，不关闭底层页面。
   */
  private requestSave(
    slot: number,
    onSave?: (slot: number, thumbnail?: string) => void,
  ): void {
    const existing = this.getSlots?.().find((info) => info.slot === slot);
    const write = (): void => onSave?.(slot, this.pendingThumbnail);
    if (existing?.timestamp === undefined) {
      write();
      return;
    }
    void this.confirmDialog
      .confirm({
        title: '覆盖存档',
        message: `覆盖存档 ${slot + 1}？原有内容将被替换。`,
        confirmText: '覆盖',
      })
      .then((confirmed) => {
        if (confirmed) write();
      });
  }

  /** 读档确认后立即回到游戏，页面不参与淡出（读档会替换整个场景） */
  private requestLoad(slot: number, onLoad?: (slot: number) => void): void {
    void this.confirmDialog
      .confirm({
        title: '读取进度',
        message: `读取存档 ${slot + 1}？当前未保存的进度将丢失。`,
        confirmText: '读取',
      })
      .then((confirmed) => {
        if (!confirmed) return;
        onLoad?.(slot);
        this.closeInstant();
      });
  }

  private closeInstant(): void {
    this.snapFades();
    this.saveLoadMenu.hide();
    this.settingsMenu.hide();
    this.historyView.hide();
    this.confirmDialog.hide();
  }

  private fadeIn(view: UIComponent): void {
    this.fades = this.fades.filter((fade) => fade.view !== view);
    view.visible = true;
    // 过渡期间锁住页面内的交互，避免半透明阶段误触卡片/按钮
    view.interactiveChildren = false;
    if (this.paused) {
      view.alpha = 1;
      view.interactiveChildren = true;
      return;
    }
    view.alpha = 0;
    this.fades.push({
      view,
      from: 0,
      to: 1,
      elapsed: 0,
      duration: PAGE_FADE_SECONDS,
      hideOnDone: false,
    });
  }

  private fadeOut(view: UIComponent): void {
    if (!view.visible) {
      return;
    }
    this.fades = this.fades.filter((fade) => fade.view !== view);
    view.interactiveChildren = false;
    if (this.paused) {
      view.hide();
      return;
    }
    this.fades.push({
      view,
      from: view.alpha,
      to: 0,
      elapsed: 0,
      duration: PAGE_FADE_SECONDS,
      hideOnDone: true,
    });
  }

  /** 立刻结束进行中的淡入淡出，避免旧动画把重新打开的页面藏掉 */
  private snapFades(): void {
    const fades = this.fades;
    this.fades = [];
    for (const fade of fades) {
      fade.view.alpha = fade.to;
      if (fade.hideOnDone) {
        fade.view.hide();
      } else {
        fade.view.interactiveChildren = true;
      }
    }
  }

  private updateFades(dt: number): void {
    if (this.fades.length === 0) {
      return;
    }
    const active = this.fades;
    this.fades = [];
    for (const fade of active) {
      fade.elapsed += dt;
      const t = Math.min(fade.elapsed / fade.duration, 1);
      fade.view.alpha = fade.from + (fade.to - fade.from) * t;
      if (t >= 1) {
        if (fade.hideOnDone) {
          fade.view.hide();
        } else {
          fade.view.alpha = 1;
          fade.view.interactiveChildren = true;
        }
        continue;
      }
      this.fades.push(fade);
    }
  }

  private startTicking(): void {
    this.lastTime = now();
    const tick = (time: number): void => {
      // 与 Updater 一致，update 以秒为单位；钳制上限 100ms 防切页跳帧
      const dt = Math.min(time - this.lastTime, MAX_FRAME_MS) / 1000;
      this.lastTime = time;
      this.update(dt);
      this.rafId = requestFrame(tick);
    };
    this.rafId = requestFrame(tick);
  }

  private stopTicking(): void {
    if (this.rafId !== null) {
      cancelFrame(this.rafId);
      this.rafId = null;
    }
  }
}
