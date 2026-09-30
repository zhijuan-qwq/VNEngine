import Game from '@/core/Game';
import type { GameConfig } from '@/types/engine';

const config: GameConfig = {
  width: 1280,
  height: 720,
  scaleMode: 'fit',
  fps: 60,
  scripts: [],
  assets: { images: {}, audio: {}, scripts: {}, spritesheets: {} },
};

const game = new Game();

game
  .init(config)
  .then(() => game.start())
  .catch((error) => {
    console.error('[VNEngine] init failed', error);
  });
