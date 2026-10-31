import type { AssetManifest } from '@/types/engine';

/** 最小 demo 的资源清单；资源来自 smoke-test worktree。 */
export const demoManifest: AssetManifest = {
  images: {
    kitchen_1: '/assets/images/bg/kitchen_1.webp',
    xingmi_c1_f1_calm_black: '/assets/images/char/xingmi_c1_f1_calm_black.png',
    xingmi_c1_f1_astonished_black:
      '/assets/images/char/xingmi_c1_f1_astonished_black.png',
  },
  audio: {},
  scripts: { demo: '/scripts/demo.vns' },
  spritesheets: {},
};
