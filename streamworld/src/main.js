import { MenuScene } from './scenes/MenuScene.js';
import { DASHScene } from './scenes/DASHScene.js';
import { RTPScene  } from './scenes/RTPScene.js';
import { HUDScene  } from './scenes/HUDScene.js';

const config = {
    type: Phaser.AUTO,
    width:  900,
    height: 540,
    backgroundColor: '#1a1a2e',
    parent: 'game-container',
    physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
    scene: [MenuScene, DASHScene, RTPScene, HUDScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
};

window.addEventListener('load', () => {
    new Phaser.Game(config);
});
