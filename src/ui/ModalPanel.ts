import { Container, Text } from 'pixi.js';
import { UIComponent } from './UIComponent';
import { createBackdrop, createButton, createPanelBox } from './overlay';
import type { UIButton } from './overlay';
import { resolveTheme } from './theme';
import type { DeepPartial, UITheme } from './theme';

export interface ModalPanelOptions {
  width: number;
  height: number;
  boxWidthRatio?: number;
  boxHeightRatio?: number;
  title: string;
  padding?: number;
  panelColor?: number;
  panelAlpha?: number;
  closeLabel?: string;
  onClose?: () => void;
  theme?: DeepPartial<UITheme>;
}

/**
 * 模态面板骨架：全屏遮罩 + 居中面板 + 衬线标题 + 内容区 + 底部关闭按钮。
 *
 * 设置 / 历史 / 存读档三个面板原先各自复制这套结构；它们现在组合本类，
 * 只负责往 `content` 里填业务控件。`contentTop` / `contentWidth` /
 * `contentHeight` 已扣掉标题与关闭按钮，供滚动区直接使用。
 */
export class ModalPanel extends UIComponent {
  public readonly theme: UITheme;
  public readonly panelX: number;
  public readonly panelY: number;
  public readonly panelWidth: number;
  public readonly panelHeight: number;
  public readonly content: Container;
  public readonly contentTop: number;
  public readonly contentWidth: number;
  public readonly contentHeight: number;
  public readonly titleText: Text;
  public readonly closeButton: UIButton;

  constructor(options: ModalPanelOptions) {
    super({ id: 'modal-panel' });
    const theme = resolveTheme(options.theme);
    this.theme = theme;

    const padding = options.padding ?? theme.spacing.s24;
    this.panelWidth = options.width * (options.boxWidthRatio ?? 0.8);
    this.panelHeight = options.height * (options.boxHeightRatio ?? 0.8);
    this.panelX = (options.width - this.panelWidth) / 2;
    this.panelY = (options.height - this.panelHeight) / 2;

    this.addChild(createBackdrop(options.width, options.height, { theme }));

    const box = createPanelBox(this.panelWidth, this.panelHeight, {
      theme,
      color: options.panelColor,
      alpha: options.panelAlpha,
    });
    box.x = this.panelX;
    box.y = this.panelY;
    this.addChild(box);

    this.titleText = new Text({
      text: options.title,
      style: {
        fontFamily: theme.typography.fontFamilyHeading,
        fontSize: theme.typography.sizes.xxl,
        fontWeight: theme.typography.weights.semibold,
        fill: theme.colors.accent,
      },
    });
    this.titleText.x = this.panelX + padding;
    this.titleText.y = this.panelY + padding;
    this.addChild(this.titleText);

    const closeHeight = theme.sizes.closeButtonHeight;
    this.contentTop =
      this.panelY + padding + this.titleText.height + padding / 2;
    this.contentWidth = this.panelWidth - padding * 2;
    this.contentHeight =
      this.panelY +
      this.panelHeight -
      padding -
      closeHeight -
      padding -
      this.contentTop;

    this.content = new Container();
    this.content.x = this.panelX + padding;
    this.content.y = this.contentTop;
    this.addChild(this.content);

    this.closeButton = createButton({
      width: theme.sizes.closeButtonWidth,
      height: closeHeight,
      label: options.closeLabel ?? '关闭',
      fontSize: theme.typography.sizes.md,
      variant: 'secondary',
      align: 'center',
      theme,
      onTap: options.onClose,
    });
    this.closeButton.x =
      this.panelX + (this.panelWidth - theme.sizes.closeButtonWidth) / 2;
    this.closeButton.y = this.panelY + this.panelHeight - padding - closeHeight;
    this.addChild(this.closeButton);
  }

  public setTitle(title: string): void {
    this.titleText.text = title;
  }
}

export default ModalPanel;
