/**
 * UI 主题色板（《星星落进我家冰箱》：夜空蓝 + 暖金星光）。
 * 所有内置面板/控件从这里取色，保证观感一致；也便于整体换肤。
 */
export const THEME = {
  /** 面板底色（深夜蓝黑） */
  panel: 0x141829,
  /** 控件底色（按钮/滑轨，略亮一档） */
  panelSoft: 0x232a45,
  /** 全屏遮罩底色 */
  veil: 0x080a16,
  /** 常规描边（暗紫蓝） */
  border: 0x4a5286,
  /** 强调色（暖金，与说话人名同族） */
  accent: 0xffd97a,
  /** hover 亮金 */
  accentBright: 0xffe9b8,
  /** 强调色上的深色文字 */
  onAccent: 0x2b2110,
  /** 正文暖白 */
  text: 0xf5f3ee,
  /** 次级文本 */
  textDim: 0x9aa3c0,
  fontFamily:
    '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
} as const;

export type ThemeColor = (typeof THEME)[keyof typeof THEME];
