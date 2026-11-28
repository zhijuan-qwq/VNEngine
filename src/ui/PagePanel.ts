import { Container, Rectangle, Text } from 'pixi.js';
import type { Graphics } from 'pixi.js';
import { UIComponent } from './UIComponent';
import { createBackdrop, createButton } from './overlay';
import type { UIButton } from './overlay';
import { resolveTheme } from './theme';
import type { DeepPartial, UITheme } from './theme';
import { isPositiveFinite } from './uiLayout';

export interface PagePanelOptions {
  width: number;
  height: number;
  title: string;
  padding?: number;
  /** 页面底色覆盖；缺省用主题的 surfacePage */
  panelColor?: number;
  /** 页面底色透明度覆盖；缺省用主题的 surfacePageAlpha */
  panelAlpha?: number;
  backLabel?: string;
  onBack?: () => void;
  theme?: DeepPartial<UITheme>;
}

/**
 * 全屏页面骨架：半透明暗化底 + 左上标题 + 内容区 + 右下操作按钮。
 *
 * 设置 / 历史 / 存读档三个页面共用这套结构，只负责往 `content` 里填业务控件。
 * `contentTop` / `contentWidth` / `contentHeight` 已扣掉标题与右下操作区。
 */
export class PagePanel extends UIComponent {
  public readonly theme: UITheme;
  public readonly content: Container;
  public readonly titleText: Text;
  public readonly backButton: UIButton;
  private readonly padding: number;
  private readonly actionHeight: number;
  private readonly panelColor: number;
  private readonly panelAlpha: number;
  private readonly backdrop: Graphics;
  private panelWidth: number;
  private panelHeight: number;

  constructor(options: PagePanelOptions) {
    super({ id: 'page-panel' });
    const theme = resolveTheme(options.theme);
    this.theme = theme;
    this.panelWidth = options.width;
    this.panelHeight = options.height;
    this.padding = options.padding ?? theme.spacing.s24;
    this.actionHeight = theme.sizes.closeButtonHeight;
    this.panelColor = options.panelColor ?? theme.colors.surfacePage;
    this.panelAlpha = options.panelAlpha ?? theme.colors.surfacePageAlpha;

    this.backdrop = createBackdrop(options.width, options.height, {
      theme,
      color: this.panelColor,
      alpha: this.panelAlpha,
    });
    this.addChild(this.backdrop);

    this.titleText = new Text({
      text: options.title,
      style: {
        fontFamily: theme.typography.fontFamilyHeading,
        fontSize: theme.typography.sizes.xxxl,
        fontWeight: theme.typography.weights.semibold,
        fill: theme.colors.accent,
      },
    });
    this.addChild(this.titleText);

    this.content = new Container();
    this.addChild(this.content);

    this.backButton = createButton({
      width: theme.sizes.pageActionWidth,
      height: this.actionHeight,
      label: options.backLabel ?? '← 返回游戏',
      fontSize: theme.typography.sizes.md,
      variant: 'secondary',
      align: 'center',
      theme,
      onTap: options.onBack,
    });
    this.addChild(this.backButton);

    this.relayout(options.width, options.height);
  }

  get contentTop(): number {
    return this.padding + this.titleText.height + this.padding / 2;
  }

  get contentWidth(): number {
    return this.panelWidth - this.padding * 2;
  }

  get contentHeight(): number {
    return (
      this.panelHeight -
      this.contentTop -
      this.padding -
      this.actionHeight -
      this.padding
    );
  }

  /** 视口变化时重算背板、标题、内容区与返回按钮的位置 */
  public relayout(width: number, height: number): void {
    if (!isPositiveFinite(width) || !isPositiveFinite(height)) {
      return;
    }
    this.panelWidth = width;
    this.panelHeight = height;
    this.drawBackdrop();
    this.titleText.x = this.padding;
    this.titleText.y = this.padding;
    this.content.x = this.padding;
    this.content.y = this.contentTop;
    this.backButton.x = width - this.padding - this.theme.sizes.pageActionWidth;
    this.backButton.y = height - this.padding - this.actionHeight;
  }

  private drawBackdrop(): void {
    this.backdrop.clear();
    this.backdrop.rect(0, 0, this.panelWidth, this.panelHeight);
    this.backdrop.fill(this.panelColor, this.panelAlpha);
    this.backdrop.hitArea = new Rectangle(
      0,
      0,
      this.panelWidth,
      this.panelHeight,
    );
  }

  public setTitle(title: string): void {
    this.titleText.text = title;
  }
}

export default PagePanel;
