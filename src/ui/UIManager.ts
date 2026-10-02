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
import { SettingsMenu } from './SettingsMenu';
import type { SettingsMenuOptions } from './SettingsMenu';
import { HistoryView } from './HistoryView';
import type { HistoryViewOptions } from './HistoryView';
import { cancelFrame, now, requestFrame } from '@/utils/APIHelper';

export interface UIManagerOptions {
  width: number;
  height: number;
  x?: number;
  y?: number;
  resolveVar?: VarResolver;
  dialogueBox?: Partial<DialogueBoxOptions>;
  choicePanel?: Partial<ChoicePanelOptions>;
  settingsMenu?: Partial<SettingsMenuOptions>;
  saveLoadMenu?: Partial<SaveLoadMenuOptions>;
  historyView?: Partial<HistoryViewOptions>;
  confirmDialog?: Partial<ConfirmDialogOptions>;
  autoTick?: boolean;
}

const MAX_FRAME_MS = 100;

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

  private readonly bus: EventBus<EngineEvents>;
  private rafId: number | null = null;
  private lastTime = 0;

  constructor(bus: EventBus<EngineEvents>, options: UIManagerOptions) {
    this.bus = bus;

    this.root = new Container();
    this.root.x = options.x ?? 0;
    this.root.y = options.y ?? 0;

    const dialogue = options.dialogueBox ?? {};
    this.dialogueBox = new DialogueBox({
      ...dialogue,
      width: dialogue.width ?? options.width,
      height: dialogue.height ?? options.height,
      eventBus: bus,
      resolveVar: options.resolveVar,
    });

    const choice = options.choicePanel ?? {};
    this.choicePanel = new ChoicePanel({
      ...choice,
      width: choice.width ?? options.width,
      onSelect: (label) => bus.emit('script:choice:selected', { label }),
    });

    const size = { width: options.width, height: options.height };
    this.saveLoadMenu = new SaveLoadMenu({
      ...size,
      ...options.saveLoadMenu,
    });
    this.settingsMenu = new SettingsMenu({
      ...size,
      ...options.settingsMenu,
    });
    this.historyView = new HistoryView({
      ...size,
      ...options.historyView,
    });
    this.confirmDialog = new ConfirmDialog({
      ...size,
      ...options.confirmDialog,
    });

    this.root.addChild(
      this.dialogueBox,
      this.choicePanel,
      this.saveLoadMenu,
      this.settingsMenu,
      this.historyView,
      this.confirmDialog,
    );

    bus.on('script:say', this.handleSay);
    bus.on('script:clear', this.handleClear);
    bus.on('script:choice', this.handleChoice);
    bus.on('script:end', this.handleEnd);
    bus.on('ui:open', this.handleOpen);
    bus.on('ui:close', this.handleClose);

    if (options.autoTick !== false) {
      this.startTicking();
    }
  }

  public update(dt: number): void {
    this.dialogueBox.update(dt);
  }

  /** 打字机是否正在逐字显示（供 InputManager 决定点击语义） */
  public isBusy(): boolean {
    return this.dialogueBox.isBusy();
  }

  /** 打开某个面板（互斥：先关闭其它面板） */
  public open(panel: UiPanel): void {
    this.close();
    switch (panel) {
      case 'settings':
        this.settingsMenu.show();
        break;
      case 'history':
        this.historyView.show();
        break;
      case 'save':
        this.saveLoadMenu.show('save');
        break;
      case 'load':
        this.saveLoadMenu.show('load');
        break;
    }
  }

  /** 关闭所有面板 */
  public close(): void {
    this.saveLoadMenu.hide();
    this.settingsMenu.hide();
    this.historyView.hide();
    this.confirmDialog.hide();
  }

  /** 打开确认框（互斥：先关闭其它面板），返回用户是否确认 */
  public confirm(request: ConfirmRequest): Promise<boolean> {
    this.close();
    return this.confirmDialog.confirm(request);
  }

  public destroy(): void {
    this.stopTicking();
    this.bus.off('script:say', this.handleSay);
    this.bus.off('script:clear', this.handleClear);
    this.bus.off('script:choice', this.handleChoice);
    this.bus.off('script:end', this.handleEnd);
    this.bus.off('ui:open', this.handleOpen);
    this.bus.off('ui:close', this.handleClose);
    this.dialogueBox.destroy();
    this.choicePanel.destroy();
    this.saveLoadMenu.destroy();
    this.settingsMenu.destroy();
    this.historyView.destroy();
    this.confirmDialog.destroy();
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

  private startTicking(): void {
    this.lastTime = now();
    const tick = (time: number): void => {
      const dt = Math.min(time - this.lastTime, MAX_FRAME_MS);
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
