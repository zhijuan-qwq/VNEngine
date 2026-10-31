import Game from '@/core/Game';
import type { GameConfig } from '@/types/engine';
import { demoManifest } from '@/game/demoManifest';

const config: GameConfig = {
  width: 1280,
  height: 720,
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
    // 开发环境暴露引擎实例，供浏览器控制台调试
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__vnGame = game;
    }
  })
  .catch((error) => {
    console.error('[VNEngine] init failed', error);
  });
