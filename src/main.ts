import Game from '@/core/Game';
import type { GameConfig } from '@/types/engine';
import { demoManifest } from '@/game/demoManifest';
import { selectDesignResolution } from '@/game/designResolution';
import { mountFullscreenHint } from '@/game/fullscreenHint';
import { getViewportSize, matchesMediaQuery } from '@/utils/APIHelper';

// 触摸-only 小屏用 640×360，其余用 1280×720；运行期只缩放画布，不重排 UI
const design = selectDesignResolution(
  getViewportSize(),
  matchesMediaQuery('(hover: none) and (pointer: coarse)'),
);

const config: GameConfig = {
  width: design.width,
  height: design.height,
  scaleMode: 'fit',
  fps: 60,
  // 预加载并自动执行主剧本（public/scripts/demo.vns）
  scripts: ['demo'],
  assets: demoManifest,
};

const game = new Game();

game
  .init(config)
  .then(() => {
    game.start();
    // 触摸横屏引导全屏：首次进入全屏后隐藏；走设置广播，菜单开关状态保持一致
    mountFullscreenHint({
      onRequestFullscreen: () => game.settings.onChange({ fullscreen: true }),
    });
    // 开发环境暴露引擎实例，供浏览器控制台调试
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__vnGame = game;
    }
  })
  .catch((error) => {
    console.error('[VNEngine] init failed', error);
  });
