import { Container, Text } from 'pixi.js';
import { UIComponent } from './UIComponent';
import { createBackdrop, createButton } from './overlay';
import type { UIButton } from './overlay';
import { resolveTheme } from './theme';
import type { DeepPartial, UITheme } from './theme';

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
  public readonly contentTop: number;
  public readonly contentWidth: number;
  public readonly contentHeight: number;
  public readonly titleText: Text;
  public readonly backButton: UIButton;

  constructor(options: PagePanelOptions) {
    super({ id: 'page-panel' });
    const theme = resolveTheme(options.theme);
    this.theme = theme;

    const padding = options.padding ?? theme.spacing.s24;
    const actionHeight = theme.sizes.closeButtonHeight;

    this.addChild(
      createBackdrop(options.width, options.height, {
        theme,
        color: options.panelColor ?? theme.colors.surfacePage,
        alpha: options.panelAlpha ?? theme.colors.surfacePageAlpha,
      }),
    );

    this.titleText = new Text({
      text: options.title,
      style: {
        fontFamily: theme.typography.fontFamilyHeading,
        fontSize: theme.typography.sizes.xxxl,
        fontWeight: theme.typography.weights.semibold,
        fill: theme.colors.accent,
      },
    });
    this.titleText.x = padding;
    this.titleText.y = padding;
    this.addChild(this.titleText);

    this.contentTop = padding + this.titleText.height + padding / 2;
    this.contentWidth = options.width - padding * 2;
    this.contentHeight =
      options.height - this.contentTop - padding - actionHeight - padding;

    this.content = new Container();
    this.content.x = padding;
    this.content.y = this.contentTop;
    this.addChild(this.content);

    this.backButton = createButton({
      width: theme.sizes.pageActionWidth,
      height: actionHeight,
      label: options.backLabel ?? '← 返回游戏',
      fontSize: theme.typography.sizes.md,
      variant: 'secondary',
      align: 'center',
      theme,
      onTap: options.onBack,
    });
    this.backButton.x = options.width - padding - theme.sizes.pageActionWidth;
    this.backButton.y = options.height - padding - actionHeight;
    this.addChild(this.backButton);
  }

  public setTitle(title: string): void {
    this.titleText.text = title;
  }
}

export default PagePanel;
