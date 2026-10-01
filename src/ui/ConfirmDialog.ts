import { Container, Text } from 'pixi.js';
import { UIComponent } from './UIComponent';
import { createBackdrop, createButton, createPanelBox } from './overlay';

export interface ConfirmDialogOptions {
  width: number;
  height: number;
  fontSize?: number;
  titleFontSize?: number;
  fontFamily?: string;
  boxWidth?: number;
  boxHeight?: number;
  buttonWidth?: number;
  buttonHeight?: number;
  panelColor?: number;
  textColor?: number;
  titleColor?: number;
}

export interface ConfirmRequest {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

interface ResolvedOptions {
  width: number;
  height: number;
  fontSize: number;
  titleFontSize: number;
  fontFamily: string;
  boxWidth: number;
  boxHeight: number;
  buttonWidth: number;
  buttonHeight: number;
  panelColor: number;
  textColor: number;
  titleColor: number;
}

export class ConfirmDialog extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly title: Text;
  private readonly message: Text;
  private readonly buttonArea: Container;
  private buttonList: Container[] = [];
  private resolver: ((confirmed: boolean) => void) | null = null;

  constructor(options: ConfirmDialogOptions) {
    super({ id: 'confirm-dialog' });
    this.opts = {
      width: options.width,
      height: options.height,
      fontSize: options.fontSize ?? 24,
      titleFontSize: options.titleFontSize ?? 28,
      fontFamily: options.fontFamily ?? 'sans-serif',
      boxWidth: options.boxWidth ?? Math.min(options.width * 0.6, 560),
      boxHeight: options.boxHeight ?? 220,
      buttonWidth: options.buttonWidth ?? 120,
      buttonHeight: options.buttonHeight ?? 44,
      panelColor: options.panelColor ?? 0x222222,
      textColor: options.textColor ?? 0xffffff,
      titleColor: options.titleColor ?? 0xffe082,
    };

    this.addChild(createBackdrop(this.opts.width, this.opts.height));

    const boxX = (this.opts.width - this.opts.boxWidth) / 2;
    const boxY = (this.opts.height - this.opts.boxHeight) / 2;
    const box = createPanelBox(this.opts.boxWidth, this.opts.boxHeight, {
      color: this.opts.panelColor,
    });
    box.x = boxX;
    box.y = boxY;
    this.addChild(box);

    const padding = 24;
    const contentWidth = this.opts.boxWidth - padding * 2;

    this.title = new Text({
      text: '',
      style: {
        fontSize: this.opts.titleFontSize,
        fontFamily: this.opts.fontFamily,
        fill: this.opts.titleColor,
      },
    });
    this.title.x = boxX + padding;
    this.title.y = boxY + padding;
    this.title.visible = false;
    this.addChild(this.title);

    this.message = new Text({
      text: '',
      style: {
        fontSize: this.opts.fontSize,
        fontFamily: this.opts.fontFamily,
        fill: this.opts.textColor,
        wordWrap: true,
        wordWrapWidth: contentWidth,
      },
    });
    this.message.x = boxX + padding;
    this.message.y = boxY + padding + this.opts.titleFontSize * 1.5;
    this.addChild(this.message);

    this.buttonArea = new Container();
    this.buttonArea.y =
      boxY + this.opts.boxHeight - padding - this.opts.buttonHeight;
    this.addChild(this.buttonArea);

    this.hide();
  }

  /** 打开确认框；返回用户是否确认。已有未决请求时，先以 false 结束它 */
  public confirm(request: ConfirmRequest): Promise<boolean> {
    if (!request || typeof request.message !== 'string') {
      throw new TypeError(
        'ConfirmDialog.confirm requires a request with a message',
      );
    }
    this.settle(false);

    this.title.text = request.title ?? '';
    this.title.visible = (request.title?.length ?? 0) > 0;
    this.message.text = request.message;
    this.rebuildButtons(
      request.cancelText ?? '取消',
      request.confirmText ?? '确认',
    );
    this.visible = true;

    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }

  public override hide(): void {
    this.settle(false);
    super.hide();
  }

  public override destroy(): void {
    this.settle(false);
    this.clearButtons();
    super.destroy();
  }

  private rebuildButtons(cancelText: string, confirmText: string): void {
    this.clearButtons();
    const gap = 16;
    const total = this.opts.buttonWidth * 2 + gap;
    const startX = (this.opts.width - total) / 2;

    const cancel = createButton({
      width: this.opts.buttonWidth,
      height: this.opts.buttonHeight,
      label: cancelText,
      fontSize: this.opts.fontSize,
      fontFamily: this.opts.fontFamily,
      onTap: () => this.settle(false),
    });
    cancel.x = startX;
    this.buttonList.push(cancel);
    this.buttonArea.addChild(cancel);

    const confirm = createButton({
      width: this.opts.buttonWidth,
      height: this.opts.buttonHeight,
      label: confirmText,
      fontSize: this.opts.fontSize,
      fontFamily: this.opts.fontFamily,
      onTap: () => this.settle(true),
    });
    confirm.x = startX + this.opts.buttonWidth + gap;
    this.buttonList.push(confirm);
    this.buttonArea.addChild(confirm);
  }

  private settle(confirmed: boolean): void {
    const resolve = this.resolver;
    this.resolver = null;
    if (resolve) {
      resolve(confirmed);
      super.hide();
    }
  }

  get buttons(): Container[] {
    return this.buttonList;
  }

  private clearButtons(): void {
    for (const button of this.buttonList) {
      button.removeAllListeners();
      button.destroy();
    }
    this.buttonList = [];
  }
}

export default ConfirmDialog;
