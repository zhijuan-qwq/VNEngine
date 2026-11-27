import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { UIComponent } from './UIComponent';
import { createBackdrop, createButton } from './overlay';
import { resolveTheme } from './theme';
import type { DeepPartial, UITheme } from './theme';

export interface ConfirmDialogOptions {
  width: number;
  height: number;
  fontSize?: number;
  titleFontSize?: number;
  fontFamily?: string | string[];
  boxWidth?: number;
  boxHeight?: number;
  buttonWidth?: number;
  buttonHeight?: number;
  panelColor?: number;
  textColor?: number;
  titleColor?: number;
  theme?: DeepPartial<UITheme>;
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
  fontFamily: string | string[];
  boxWidth: number;
  boxHeight: number;
  buttonWidth: number;
  buttonHeight: number;
  panelColor?: number;
  textColor: number;
  titleColor: number;
}

export class ConfirmDialog extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly theme: UITheme;
  private readonly title: Text;
  private readonly message: Text;
  private readonly buttonArea: Container;
  private readonly boxWidthExplicit: boolean;
  private readonly backdrop: Graphics;
  private readonly box: Graphics;
  private buttonList: Container[] = [];
  private resolver: ((confirmed: boolean) => void) | null = null;

  constructor(options: ConfirmDialogOptions) {
    super({ id: 'confirm-dialog' });
    this.theme = resolveTheme(options.theme);
    this.boxWidthExplicit = options.boxWidth !== undefined;
    this.opts = {
      width: options.width,
      height: options.height,
      fontSize: options.fontSize ?? this.theme.typography.sizes.lg,
      titleFontSize: options.titleFontSize ?? this.theme.typography.sizes.xxl,
      fontFamily: options.fontFamily ?? this.theme.typography.fontFamilyBody,
      boxWidth:
        options.boxWidth ??
        Math.min(
          options.width * this.theme.sizes.confirmWidthRatio,
          this.theme.sizes.confirmMaxWidth,
        ),
      boxHeight: options.boxHeight ?? this.theme.sizes.confirmHeight,
      buttonWidth: options.buttonWidth ?? this.theme.sizes.closeButtonWidth,
      buttonHeight: options.buttonHeight ?? this.theme.sizes.closeButtonHeight,
      panelColor: options.panelColor,
      textColor: options.textColor ?? this.theme.colors.textPrimary,
      titleColor: options.titleColor ?? this.theme.colors.accent,
    };

    this.backdrop = createBackdrop(this.opts.width, this.opts.height, {
      theme: this.theme,
    });
    this.addChild(this.backdrop);

    this.box = new Graphics();
    this.addChild(this.box);

    const padding = this.theme.spacing.s24;
    const contentWidth = this.opts.boxWidth - padding * 2;

    this.title = new Text({
      text: '',
      style: {
        fontFamily: this.theme.typography.fontFamilyHeading,
        fontSize: this.opts.titleFontSize,
        fontWeight: this.theme.typography.weights.semibold,
        fill: this.opts.titleColor,
      },
    });
    this.title.visible = false;
    this.addChild(this.title);

    this.message = new Text({
      text: '',
      style: {
        fontFamily: this.opts.fontFamily,
        fontSize: this.opts.fontSize,
        fill: this.opts.textColor,
        wordWrap: true,
        wordWrapWidth: contentWidth,
        lineHeight: Math.round(
          this.opts.fontSize * this.theme.typography.lineHeights.normal,
        ),
      },
    });
    this.addChild(this.message);

    this.buttonArea = new Container();
    this.addChild(this.buttonArea);

    this.layout();
    this.hide();
  }

  /** 视口变化时重算遮罩、盒子与按钮位置；未决请求保持不变 */
  public resize(width: number, height: number): void {
    this.opts.width = width;
    this.opts.height = height;
    if (!this.boxWidthExplicit) {
      this.opts.boxWidth = Math.min(
        width * this.theme.sizes.confirmWidthRatio,
        this.theme.sizes.confirmMaxWidth,
      );
    }
    this.drawBackdrop();
    this.layout();
  }

  private drawBackdrop(): void {
    this.backdrop.clear();
    this.backdrop.rect(0, 0, this.opts.width, this.opts.height);
    this.backdrop.fill(
      this.theme.colors.backdrop,
      this.theme.colors.backdropAlpha,
    );
    this.backdrop.hitArea = new Rectangle(
      0,
      0,
      this.opts.width,
      this.opts.height,
    );
  }

  private layout(): void {
    const padding = this.theme.spacing.s24;
    const boxX = (this.opts.width - this.opts.boxWidth) / 2;
    const boxY = (this.opts.height - this.opts.boxHeight) / 2;
    this.drawBox();
    this.box.x = boxX;
    this.box.y = boxY;

    const contentWidth = this.opts.boxWidth - padding * 2;
    this.title.x = boxX + padding;
    this.title.y = boxY + padding;
    this.message.x = boxX + padding;
    this.message.y = boxY + padding + this.opts.titleFontSize * 1.5;
    this.message.style.wordWrapWidth = contentWidth;
    this.buttonArea.y =
      boxY + this.opts.boxHeight - padding - this.opts.buttonHeight;
    this.layoutButtons();
  }

  private drawBox(): void {
    const borderWidth = this.theme.border.thin;
    this.box.clear();
    this.box.roundRect(
      0,
      0,
      this.opts.boxWidth,
      this.opts.boxHeight,
      this.theme.radius.lg,
    );
    this.box.fill(
      this.opts.panelColor ?? this.theme.colors.surfacePanel,
      this.theme.colors.surfacePanelAlpha,
    );
    if (borderWidth > 0) {
      this.box.stroke({
        width: borderWidth,
        color: this.theme.colors.borderSubtle,
        alpha: this.theme.colors.borderSubtleAlpha,
      });
    }
  }

  private layoutButtons(): void {
    if (this.buttonList.length < 2) return;
    const gap = this.theme.spacing.s16;
    const total = this.opts.buttonWidth * 2 + gap;
    const startX = (this.opts.width - total) / 2;
    this.buttonList[0].x = startX;
    this.buttonList[1].x = startX + this.opts.buttonWidth + gap;
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

    const cancel = createButton({
      width: this.opts.buttonWidth,
      height: this.opts.buttonHeight,
      label: cancelText,
      fontSize: this.opts.fontSize,
      fontFamily: this.opts.fontFamily,
      variant: 'secondary',
      align: 'center',
      theme: this.theme,
      onTap: () => this.settle(false),
    });
    this.buttonList.push(cancel);
    this.buttonArea.addChild(cancel);

    const confirm = createButton({
      width: this.opts.buttonWidth,
      height: this.opts.buttonHeight,
      label: confirmText,
      fontSize: this.opts.fontSize,
      fontFamily: this.opts.fontFamily,
      variant: 'primary',
      align: 'center',
      theme: this.theme,
      onTap: () => this.settle(true),
    });
    this.buttonList.push(confirm);
    this.buttonArea.addChild(confirm);
    this.layoutButtons();
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
