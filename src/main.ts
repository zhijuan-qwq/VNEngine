import Game from '@/core/Game';
import type { GameConfig } from '@/types/engine';
import { gameManifest } from '@/game/manifest.gen';

const config: GameConfig = {
  width: 1280,
  height: 720,
  scaleMode: 'fit',
  fps: 60,
  // 预加载并自动执行主剧本（public/script/game.vns）
  scripts: ['game'],
  assets: gameManifest,
};

const game = new Game();

game
  .init(config)
  .then(() => {
    // 浏览器自动播放策略：AudioContext 初始为 suspended，首次用户交互后解锁
    document.addEventListener(
      'pointerdown',
      () => {
        void game.audio.resume();
      },
      { once: true },
    );
    game.start();
    // 开发环境暴露引擎实例，供浏览器控制台调试
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__vnGame = game;
    }
  })
  .catch((error) => {
    console.error('[VNEngine] init failed', error);
  });
