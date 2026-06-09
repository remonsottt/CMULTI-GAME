// ZONE 1 — DASH Land: side-scrolling platformer with adaptive bitrate mechanics
import { AdaptiveAlgorithm } from '../utils/AdaptiveAlgorithm.js';

const SEGMENT_W  = 130;  // px per segment (world units)
const TOTAL_SEGS = 20;
const MAX_BUFFER = 7;    // max buffered segments
const PLATFORM_H = 18;
const PLAYER_W   = 22;
const PLAYER_H   = 28;
const GRAVITY    = 800;
const JUMP_VEL   = -460;
const MOVE_SPEED = 155;

export class DASHScene extends Phaser.Scene {
    constructor() { super({ key: 'DASHScene' }); }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        this.groundY = H - 55; // world Y of ground surface

        this.abr           = new AdaptiveAlgorithm();
        this.bufferFill    = 0;
        this.currentSeg    = -1;
        this.hasMPD        = false;
        this.bufferEvents  = 0;
        this.frozen        = false;
        this.freezeTimer   = 0;
        this.fastFwdSegs   = 0;
        this.fastFwdCD     = 0;
        this.stormActive   = false;
        this.stormTimer    = 20000;
        this.levelComplete = false;
        this.distTraveled  = 0; // for buffer drain (pixels traveled)

        // Background
        this.add.rectangle(0, 0, SEGMENT_W * (TOTAL_SEGS + 4), H, 0xeef2f7).setOrigin(0, 0);
        this._buildGridLines(H);

        // Camera world bounds
        this.cameras.main.setBounds(0, 0, SEGMENT_W * (TOTAL_SEGS + 4), H);

        // Build world elements
        this._buildGround(H);
        this.platforms = [];
        this._buildPlatforms(H);

        // Player — Graphics object; camera follows its x/y
        this.playerGfx = this.add.graphics().setDepth(10);
        this.playerX   = 55;
        this.playerY   = this.groundY; // feet on ground
        this.velX      = 0;
        this.velY      = 0;
        this.onGround  = true;
        this._drawPlayer();

        // FIX: follow the Graphics object (its x/y is updated each frame)
        this.cameras.main.startFollow(this.playerGfx, true, 0.1, 0.1);

        // MPD scroll item
        this._buildMPD();

        // End server
        this._buildEndServer(H);

        // Storm overlay
        this.stormOverlay = this.add.rectangle(0, 0, W, H, 0x111133, 0)
            .setOrigin(0, 0).setScrollFactor(0).setDepth(19);
        this.stormGfx = this.add.graphics().setScrollFactor(0).setDepth(20);
        this.stormParticles = [];

        // UI overlays (scrollFactor 0 = fixed to screen)
        this.popupBg = this.add.rectangle(W / 2, H / 2 - 55, 360, 90, 0x000000, 0.82)
            .setScrollFactor(0).setDepth(89).setOrigin(0.5).setVisible(false);
        this.popupText = this.add.text(W / 2, H / 2 - 55, '', {
            fontSize: '13px', color: '#ffffff', align: 'center', wordWrap: { width: 340 }
        }).setScrollFactor(0).setDepth(90).setOrigin(0.5).setVisible(false);

        this.abrText = this.add.text(10, 105, '', {
            fontSize: '10px', color: '#222233',
            backgroundColor: '#ffffffdd', padding: { x: 5, y: 3 }
        }).setScrollFactor(0).setDepth(88);

        // Input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keyF    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
        this.keyESC  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

        this._showPopup('Collect the\nMPD Scroll\nto reveal platforms!', 3500);
        this._updateHUD();
    }

    // ── WORLD BUILDING ──────────────────────────────────────────────────────

    _buildGridLines(H) {
        const g = this.add.graphics().setDepth(0);
        g.lineStyle(1, 0xdde4ee, 1);
        for (let x = 0; x < SEGMENT_W * (TOTAL_SEGS + 4); x += 60) g.lineBetween(x, 0, x, H);
        for (let y = 0; y < H; y += 60) g.lineBetween(0, y, SEGMENT_W * (TOTAL_SEGS + 4), y);
    }

    _buildGround(H) {
        const g = this.add.graphics().setDepth(1);
        g.fillStyle(0xc8d0e0, 1);
        g.fillRect(0, this.groundY + 2, SEGMENT_W * (TOTAL_SEGS + 4), H - this.groundY);
        g.fillStyle(0xa0aabc, 1);
        g.fillRect(0, this.groundY, SEGMENT_W * (TOTAL_SEGS + 4), 3);
    }

    _buildPlatforms(H) {
        // Pattern: alternating ground-level and raised platforms
        const patterns = [0, -75, 0, -110, -75, 0, -110, 0, -75, -110,
                          0, -75, -110, 0, -75, 0, -110, -75, 0, -110];
        for (let i = 0; i < TOTAL_SEGS; i++) {
            const x  = 100 + i * SEGMENT_W;
            const py = this.groundY + patterns[i];
            const plat = this._makePlatform(x, py, SEGMENT_W - 12, PLATFORM_H, i);
            this.platforms.push(plat);
        }
    }

    _makePlatform(x, y, w, h, segIdx) {
        const gfx = this.add.graphics().setDepth(2).setAlpha(0); // invisible until MPD
        const lbl = this.add.text(x + w / 2, y - 13, '???', {
            fontSize: '9px', color: '#999999'
        }).setOrigin(0.5).setDepth(3).setVisible(false);

        this._renderPlatformGfx(gfx, x, y, w, h, '360p', false);

        return { gfx, lbl, x, y, w, h, segIdx, quality: '360p' };
    }

    _renderPlatformGfx(gfx, x, y, w, h, quality, visible) {
        const colors = { '1080p': 0x1D9E75, '720p': 0xEF9F27, '360p': 0xE24B4A, 'gray': 0x999999 };
        const col = visible ? (colors[quality] ?? 0x999999) : 0x999999;
        gfx.clear();
        gfx.fillStyle(col, 1);
        gfx.fillRoundedRect(x, y, w, h, 4);
        gfx.fillStyle(0xffffff, 0.18);
        gfx.fillRoundedRect(x + 2, y + 2, w - 4, 6, 2);
    }

    _recolorPlatform(plat, quality) {
        plat.quality = quality;
        this._renderPlatformGfx(plat.gfx, plat.x, plat.y, plat.w, plat.h, quality, true);
        plat.lbl.setText(quality);
    }

    _buildMPD() {
        // PROTOCOL: MPD (Media Presentation Description) — DASH manifest
        const mx = 28, my = this.groundY - 18;
        this.mpdAlive = true;
        this.mpdX = mx; this.mpdY = my;

        this.mpdGfx = this.add.graphics().setDepth(5);
        this.mpdGfx.fillStyle(0xffdd44, 1);
        this.mpdGfx.fillRoundedRect(mx - 13, my - 18, 26, 22, 3);
        this.mpdGfx.fillStyle(0x885500, 1);
        [0, 5, 10].forEach(dy => this.mpdGfx.fillRect(mx - 8, my - 14 + dy, 16, 2));

        this.mpdLbl = this.add.text(mx, my - 26, 'MPD', {
            fontSize: '10px', color: '#885500', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(6);

        this.tweens.add({
            targets: [this.mpdGfx, this.mpdLbl], y: '-=7',
            duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
    }

    _buildEndServer(H) {
        const ex = 100 + TOTAL_SEGS * SEGMENT_W + 50;
        this.endServerX = ex;
        const g = this.add.graphics().setDepth(2);
        g.fillStyle(0x1D9E75, 1);
        g.fillRect(ex - 22, this.groundY - 90, 44, 90);
        g.fillStyle(0x0d5533, 1);
        [10, 28, 46, 64].forEach(dy => g.fillRect(ex - 18, this.groundY - 90 + dy, 36, 10));
        g.fillStyle(0x11cc66, 0.5);
        g.fillRect(ex - 20, this.groundY - 88, 4, 4);
        this.add.text(ex, this.groundY - 105, 'END\nSERVER', {
            fontSize: '11px', color: '#1D9E75', fontStyle: 'bold', align: 'center'
        }).setOrigin(0.5).setDepth(3);
    }

    // ── MAIN LOOP ────────────────────────────────────────────────────────────

    update(time, delta) {
        if (this.levelComplete) return;
        const dt = delta / 1000;

        this._handleStorm(delta);
        this._handleInput(dt);
        this._applyPhysics(dt);
        this._checkMPDPickup();
        this._checkSegmentEntry();
        this._checkEndServer();
        this._handleFreeze(delta);
        this._drawPlayer();   // updates playerGfx.x/y → camera follows
        this._updateHUD();

        if (Phaser.Input.Keyboard.JustDown(this.keyESC)) {
            this.scene.stop('HUDScene');
            this.scene.start('MenuScene');
        }
    }

    _handleInput(dt) {
        if (this.frozen) return;
        const left  = this.cursors.left.isDown;
        const right = this.cursors.right.isDown;
        const jump  = Phaser.Input.Keyboard.JustDown(this.cursors.space);
        const ff    = Phaser.Input.Keyboard.JustDown(this.keyF);

        this.velX = right ? MOVE_SPEED : left ? -MOVE_SPEED : 0;
        if (jump && this.onGround) this.velY = JUMP_VEL;
        if (ff && this.fastFwdCD <= 0) this._doFastForward();
        if (this.fastFwdCD > 0) this.fastFwdCD -= dt;
    }

    _applyPhysics(dt) {
        // Gravity
        this.velY += GRAVITY * dt;

        const prevY = this.playerY;
        this.playerX += this.velX * dt;
        this.playerY += this.velY * dt;

        // World left bound
        if (this.playerX < 10) this.playerX = 10;

        this.onGround = false;

        // Platform collisions (feet-based: playerY = bottom of player)
        for (const plat of this.platforms) {
            const inX    = this.playerX + PLAYER_W / 2 > plat.x &&
                           this.playerX - PLAYER_W / 2 < plat.x + plat.w;
            const wasAbove = prevY <= plat.y + 1;
            const nowAt    = this.playerY >= plat.y && this.playerY <= plat.y + plat.h + 4;

            if (inX && wasAbove && nowAt && this.velY >= 0) {
                this.playerY = plat.y;
                this.velY    = 0;
                this.onGround = true;
                break;
            }
        }

        // Ground
        if (this.playerY >= this.groundY) {
            this.playerY  = this.groundY;
            this.velY     = 0;
            this.onGround = true;
        }

        // PROTOCOL: Buffer drain — 1 segment consumed per SEGMENT_W pixels traveled
        if (this.onGround && Math.abs(this.velX) > 0 && this.hasMPD) {
            this.distTraveled += Math.abs(this.velX) * dt;
            if (this.distTraveled >= SEGMENT_W) {
                this.distTraveled -= SEGMENT_W;
                this._drainBuffer(1);
            }
        }
    }

    _drainBuffer(amount) {
        const mult = this.stormActive ? 2 : 1; // PROTOCOL: storm drains 2× faster
        this.bufferFill = Math.max(0, this.bufferFill - amount * mult);
        if (this.bufferFill <= 0 && !this.frozen) {
            this._triggerFreeze();
        }
    }

    _triggerFreeze() {
        // PROTOCOL: Buffer underrun — playback stalls
        this.frozen      = true;
        this.freezeTimer = 2000;
        this.bufferEvents++;
        console.log(`[DASH] BUFFER UNDERRUN #${this.bufferEvents} — frozen 2s`);
        this._showPopup(`⚠ BUFFERING… (${this.bufferEvents}/3 events)`, 2000);
        if (this.bufferEvents >= 3) {
            this.time.delayedCall(2100, () => this._gameOver());
        }
    }

    _handleFreeze(delta) {
        if (!this.frozen) return;
        this.freezeTimer -= delta;
        if (this.freezeTimer <= 0) {
            this.frozen = false;
            this.bufferFill = 1;
            console.log('[DASH] Buffering ended — resuming');
        }
    }

    _checkMPDPickup() {
        if (this.hasMPD || !this.mpdAlive) return;
        const dx = Math.abs(this.playerX - this.mpdX);
        const dy = Math.abs(this.playerY - this.mpdY);
        if (dx < 28 && dy < 36) {
            this.hasMPD   = true;
            this.mpdAlive = false;
            this.mpdGfx.setVisible(false);
            this.mpdLbl.setVisible(false);
            this.bufferFill = 4; // initial fill after manifest
            console.log('[DASH] MPD collected — qualities: 360p / 720p / 1080p');
            this._showPopup('MPD loaded!\nQualities: 360p / 720p / 1080p\nPlatforms revealed!', 3500);

            // Reveal platforms
            this.platforms.forEach(p => {
                p.gfx.setAlpha(1);
                p.lbl.setVisible(true);
                this._renderPlatformGfx(p.gfx, p.x, p.y, p.w, p.h, p.quality, true);
            });
            this._runABR();
        }
    }

    _checkSegmentEntry() {
        if (!this.hasMPD) return;
        const seg = Math.floor((this.playerX - 100) / SEGMENT_W);
        if (seg < 0 || seg >= TOTAL_SEGS || seg === this.currentSeg) return;
        this.currentSeg = seg;

        // PROTOCOL: Download next segment — bandwidth limited by ABR
        const stormPenalty = this.stormActive ? 0.2 : 1.0;
        const dlQuality    = this.fastFwdSegs > 0 ? '360p' : this.abr.currentQuality;
        if (this.fastFwdSegs > 0) this.fastFwdSegs--;

        // +download, the playback consumes segments via distTraveled
        this.bufferFill = Math.min(MAX_BUFFER, this.bufferFill + 1.0 * stormPenalty);

        // Color 3 segments ahead
        const ahead = seg + 3;
        if (ahead < TOTAL_SEGS) this._recolorPlatform(this.platforms[ahead], dlQuality);

        console.log(`[DASH] Segment ${seg} | dl=${dlQuality} | buffer=${this.bufferFill.toFixed(1)}/${MAX_BUFFER}`);
        this._runABR();
    }

    _runABR() {
        const ratio = this.bufferFill / MAX_BUFFER;
        this.abr.computeNextQuality(ratio);
        this.abrText.setText(this.abr.lastDecision);
    }

    _doFastForward() {
        // PROTOCOL: Seek — drains buffer, forces low quality recovery
        this.playerX   += 5 * SEGMENT_W;
        this.bufferFill = MAX_BUFFER * 0.05;
        this.fastFwdSegs = 3;
        this.fastFwdCD   = 5;
        this.abr.fastForward();
        console.log('[DASH] FAST-FORWARD — buffer→5%, 360p recovery mode');
        this._showPopup('⚡ Fast-forward!\nBuffer→5% | Next 3 segments: 360p', 2500);
        this.cameras.main.flash(250, 255, 255, 255);
    }

    // ── STORM ─────────────────────────────────────────────────────────────

    _handleStorm(delta) {
        this.stormTimer -= delta;
        if (!this.stormActive && this.stormTimer <= 0) {
            this._startStorm();
        } else if (this.stormActive && this.stormTimer <= 0) {
            this._endStorm();
        }
        if (this.stormActive) this._drawStorm();
    }

    _startStorm() {
        this.stormActive = true;
        this.stormTimer  = 8000;
        this.abr.setCongestion(true);
        this.stormOverlay.setAlpha(0.32);
        for (let i = 0; i < 22; i++) {
            this.stormParticles.push({
                x: Phaser.Math.Between(0, this.scale.width),
                y: Phaser.Math.Between(0, this.scale.height * 0.7),
                r: Phaser.Math.Between(5, 14),
                spd: Phaser.Math.Between(40, 100),
                t: Math.random() * Math.PI * 2,
            });
        }
        this._showPopup('⛈ CONGESTION STORM!\nBandwidth→20% | Buffer drains 2× faster', 3000);
    }

    _endStorm() {
        this.stormActive   = false;
        this.stormTimer    = 20000;
        this.stormParticles = [];
        this.abr.setCongestion(false);
        this.stormOverlay.setAlpha(0);
        this.stormGfx.clear();
    }

    _drawStorm() {
        const g = this.stormGfx;
        g.clear();
        const t = Date.now() / 1000;
        this.stormParticles.forEach(p => {
            p.x -= p.spd / 60;
            if (p.x < -30) p.x = this.scale.width + 30;
            g.fillStyle(0x334466, 0.55);
            g.fillEllipse(p.x, p.y + Math.sin(t + p.t) * 6, p.r * 3.5, p.r);
        });
    }

    // ── PLAYER RENDERING ─────────────────────────────────────────────────

    _drawPlayer() {
        // KEY FIX: set Graphics x/y to world position — camera.startFollow tracks these
        this.playerGfx.x = this.playerX;
        this.playerGfx.y = this.playerY; // bottom of player

        const g = this.playerGfx;
        g.clear();

        const body = this.frozen ? 0x7799ee : 0x2255cc;
        // Draw relative to (0,0) which is now at (playerX, playerY) in world space
        g.fillStyle(body, 1);
        g.fillRoundedRect(-PLAYER_W / 2, -PLAYER_H, PLAYER_W, PLAYER_H, 5);
        // Shine
        g.fillStyle(0xffffff, 0.22);
        g.fillRoundedRect(-PLAYER_W / 2 + 3, -PLAYER_H + 3, PLAYER_W - 6, 8, 3);
        // Eyes
        g.fillStyle(0xffffff, 1);
        g.fillCircle(-5, -PLAYER_H + 9, 4);
        g.fillCircle(5,  -PLAYER_H + 9, 4);
        g.fillStyle(0x111144, 1);
        g.fillCircle(-4, -PLAYER_H + 9, 2);
        g.fillCircle(6,  -PLAYER_H + 9, 2);
        // "DATA" label on body
        g.fillStyle(0xffffff, 0.25);
        g.fillRoundedRect(-7, -10, 14, 8, 2);

        // Freeze effect
        if (this.frozen) {
            g.lineStyle(2, 0xaaccff, 0.8);
            g.strokeRoundedRect(-PLAYER_W / 2 - 2, -PLAYER_H - 2, PLAYER_W + 4, PLAYER_H + 4, 6);
        }
    }

    // ── LEVEL END ────────────────────────────────────────────────────────

    _checkEndServer() {
        if (Math.abs(this.playerX - this.endServerX) < 35 && !this.levelComplete) {
            this.levelComplete = true;
            const ok  = this.bufferEvents < 3;
            const msg = ok
                ? `🎉 LEVEL COMPLETE!\nBuffer events: ${this.bufferEvents}/3\nYou survived DASH Land!`
                : `Level done — but ${this.bufferEvents} buffer events (max 3)`;
            console.log(`[DASH] Finished | bufferEvents=${this.bufferEvents} | success=${ok}`);
            this._showPopup(msg, 99999);
            this.time.delayedCall(4500, () => {
                this.scene.stop('HUDScene');
                this.scene.start('MenuScene');
            });
        }
    }

    _gameOver() {
        if (this.levelComplete) return;
        this.levelComplete = true;
        this._showPopup('💀 GAME OVER\n3 buffer events reached!\nReturning to menu…', 4000);
        this.time.delayedCall(4200, () => {
            this.scene.stop('HUDScene');
            this.scene.start('MenuScene');
        });
    }

    // ── UI ───────────────────────────────────────────────────────────────

    _showPopup(msg, dur) {
        this.popupBg.setVisible(true);
        this.popupText.setText(msg).setVisible(true);
        if (dur < 99000) {
            this.time.delayedCall(dur, () => {
                this.popupBg.setVisible(false);
                this.popupText.setVisible(false);
            });
        }
    }

    _updateHUD() {
        this.game.events.emit('hudUpdate', {
            zone: 'DASH',
            buffer:      this.bufferFill / MAX_BUFFER,
            quality:     this.frozen ? 'FROZEN' : this.abr.currentQuality,
            abrDecision: this.abr.lastDecision,
        });
    }
}
