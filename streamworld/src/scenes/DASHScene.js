// ZONE 1 — DASH Land: side-scrolling platformer with adaptive bitrate mechanics
import { AdaptiveAlgorithm } from '../utils/AdaptiveAlgorithm.js';

const SEGMENT_W    = 120;   // px per segment
const TOTAL_SEGS   = 20;    // total segments in level
const MAX_BUFFER   = 7;     // max buffer segments
const PLATFORM_H   = 18;
const PLAYER_W     = 20;
const PLAYER_H     = 26;
const GRAVITY      = 900;
const JUMP_VEL     = -480;
const MOVE_SPEED   = 160;

export class DASHScene extends Phaser.Scene {
    constructor() { super({ key: 'DASHScene' }); }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;

        this.abr            = new AdaptiveAlgorithm();
        this.bufferFill     = 3;          // segments currently buffered
        this.currentSeg     = 0;          // which segment player is on
        this.hasMPD         = false;
        this.bufferEvents   = 0;          // freeze count (max 3 allowed)
        this.frozen         = false;
        this.freezeTimer    = 0;
        this.fastFwdCooldown= 0;
        this.fastFwdSegs    = 0;          // segments remaining in 360p recovery
        this.stormActive    = false;
        this.stormTimer     = 0;
        this.stormCooldown  = 20000;
        this.segmentQualities = [];
        this.levelComplete  = false;

        // PROTOCOL: segment quality array — determines platform colors ahead
        for (let i = 0; i < TOTAL_SEGS; i++) {
            this.segmentQualities.push('360p');
        }

        // Background
        this.add.rectangle(0, 0, W * 4, H, 0xf0f4f8).setOrigin(0, 0);

        // World camera
        this.cameras.main.setBounds(0, 0, SEGMENT_W * (TOTAL_SEGS + 2), H);

        // Build world
        this._buildWorld(H);

        // Player
        this._createPlayer(H);

        // MPD scroll item
        this._createMPD(H);

        // Storm effect group
        this.stormGraphics = this.add.graphics().setDepth(20);
        this.stormParticles = [];

        // End server
        this._buildEndServer(H);

        // Input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keyF    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
        this.keyESC  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

        // Popup text
        this.popupText = this.add.text(W / 2, H / 2 - 60, '', {
            fontSize: '14px', color: '#ffffff',
            backgroundColor: '#00000099', padding: { x: 10, y: 6 },
            align: 'center', wordWrap: { width: 340 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(90).setVisible(false);

        // ABR overlay
        this.abrText = this.add.text(10, 105, '', {
            fontSize: '10px', color: '#1a1a1a',
            backgroundColor: '#ffffffcc', padding: { x: 5, y: 3 }
        }).setScrollFactor(0).setDepth(90);

        // Storm overlay
        this.stormOverlay = this.add.rectangle(0, 0, W, H, 0x222244, 0)
            .setOrigin(0, 0).setScrollFactor(0).setDepth(18);

        // Buffer drain rate: 1 segment per X ms of movement
        this.bufferDrainAccum = 0;

        // First run — show instruction
        this._showPopup('Collect the MPD Scroll first!\nWithout it, platforms are invisible.', 3000);

        this.stormTimer = this.stormCooldown;

        // Camera follows player
        this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

        this._updateHUD();
    }

    _buildWorld(H) {
        const ground = H - 60;
        this.platforms = [];

        // Ground baseline
        const gfx = this.add.graphics().setDepth(1);
        gfx.fillStyle(0xccccdd, 1);
        gfx.fillRect(0, ground + PLATFORM_H, SEGMENT_W * (TOTAL_SEGS + 2), 60);

        // Platforms per segment
        for (let i = 0; i < TOTAL_SEGS; i++) {
            const x = 80 + i * SEGMENT_W;
            const raised = (i % 3 === 1);
            const y = raised ? ground - 80 : ground;
            const plat = this._makePlatform(x, y, SEGMENT_W - 8, PLATFORM_H, i, '360p');
            this.platforms.push(plat);
        }
    }

    _makePlatform(x, y, w, h, segIdx, quality) {
        const colors = { '1080p': 0x1D9E75, '720p': 0xEF9F27, '360p': 0xE24B4A, 'gray': 0x888888 };
        const col = colors[quality] ?? 0x888888;
        const gfx = this.add.graphics().setDepth(2);
        gfx.fillStyle(col, 1);
        gfx.fillRoundedRect(x, y, w, h, 4);
        gfx.fillStyle(0xffffff, 0.15);
        gfx.fillRoundedRect(x + 2, y + 2, w - 4, 6, 2);

        // Quality label (hidden until MPD collected)
        const lbl = this.add.text(x + w / 2, y - 14, quality, {
            fontSize: '9px', color: '#333333'
        }).setOrigin(0.5).setDepth(3).setVisible(false);

        // Physics body (manual)
        return { gfx, lbl, x, y, w, h, segIdx, quality, col, visible: true };
    }

    _recolorPlatform(plat, quality) {
        const colors = { '1080p': 0x1D9E75, '720p': 0xEF9F27, '360p': 0xE24B4A, 'gray': 0x888888 };
        plat.quality = quality;
        plat.col = colors[quality] ?? 0x888888;
        plat.gfx.clear();
        plat.gfx.fillStyle(plat.col, 1);
        plat.gfx.fillRoundedRect(plat.x, plat.y, plat.w, plat.h, 4);
        plat.gfx.fillStyle(0xffffff, 0.15);
        plat.gfx.fillRoundedRect(plat.x + 2, plat.y + 2, plat.w - 4, 6, 2);
        if (this.hasMPD) {
            plat.lbl.setText(quality).setVisible(true);
        }
    }

    _createPlayer(H) {
        const ground = H - 60;
        this.playerX  = 60;
        this.playerY  = ground - PLAYER_H;
        this.velX     = 0;
        this.velY     = 0;
        this.onGround = false;

        this.playerGfx = this.add.graphics().setDepth(10);
        this._drawPlayer();
    }

    _drawPlayer() {
        const g = this.playerGfx;
        g.clear();
        const col = this.frozen ? 0x8888ff : 0x2255cc;
        g.fillStyle(col, 1);
        g.fillRoundedRect(this.playerX - PLAYER_W / 2, this.playerY - PLAYER_H, PLAYER_W, PLAYER_H, 4);
        // Eyes
        g.fillStyle(0xffffff, 1);
        g.fillCircle(this.playerX - 5, this.playerY - PLAYER_H + 7, 4);
        g.fillCircle(this.playerX + 5, this.playerY - PLAYER_H + 7, 4);
        g.fillStyle(0x111111, 1);
        g.fillCircle(this.playerX - 4, this.playerY - PLAYER_H + 7, 2);
        g.fillCircle(this.playerX + 6, this.playerY - PLAYER_H + 7, 2);
        // "Packet" label
        g.fillStyle(0xffffff, 0.3);
        g.fillRect(this.playerX - 7, this.playerY - 8, 14, 6);
    }

    _createMPD(H) {
        const ground = H - 60;
        // PROTOCOL: MPD (Media Presentation Description) — manifest for DASH
        this.mpdX = 30;
        this.mpdY = ground - 20;
        this.mpdGfx = this.add.graphics().setDepth(5);
        this.mpdGfx.fillStyle(0xffdd44, 1);
        this.mpdGfx.fillRoundedRect(this.mpdX - 12, this.mpdY - 16, 24, 20, 3);
        this.mpdGfx.fillStyle(0x885500, 1);
        this.mpdGfx.fillRect(this.mpdX - 8, this.mpdY - 12, 16, 2);
        this.mpdGfx.fillRect(this.mpdX - 8, this.mpdY - 8, 10, 2);
        this.mpdGfx.fillRect(this.mpdX - 8, this.mpdY - 4, 12, 2);

        this.mpdLabel = this.add.text(this.mpdX, this.mpdY - 24, 'MPD', {
            fontSize: '9px', color: '#885500', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(6);

        // Bob animation
        this.tweens.add({
            targets: [this.mpdGfx, this.mpdLabel], y: '-=6',
            duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
    }

    _buildEndServer(H) {
        const ground = H - 60;
        const ex = 80 + TOTAL_SEGS * SEGMENT_W + 40;
        const g = this.add.graphics().setDepth(2);
        g.fillStyle(0x1D9E75, 1);
        g.fillRect(ex - 20, ground - 80, 40, 80);
        g.fillStyle(0x0a5040, 1);
        g.fillRect(ex - 18, ground - 76, 36, 12);
        g.fillRect(ex - 18, ground - 58, 36, 12);
        g.fillRect(ex - 18, ground - 40, 36, 12);
        this.add.text(ex, ground - 92, 'END\nSERVER', {
            fontSize: '11px', color: '#1D9E75', align: 'center', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(3);
        this.endServerX = ex;
    }

    _showPopup(msg, duration) {
        this.popupText.setText(msg).setVisible(true);
        this.time.delayedCall(duration, () => this.popupText.setVisible(false));
    }

    // ── UPDATE LOOP ─────────────────────────────────────────────────────────

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
        this._drawPlayer();
        this._updateHUD();

        if (this.keyESC.isDown) {
            this.scene.stop('HUDScene');
            this.scene.start('MenuScene');
        }
    }

    _handleInput(dt) {
        if (this.frozen) return;

        const left  = this.cursors.left.isDown;
        const right = this.cursors.right.isDown;
        const jump  = Phaser.Input.Keyboard.JustDown(this.cursors.space);

        if (left)       this.velX = -MOVE_SPEED;
        else if (right) this.velX =  MOVE_SPEED;
        else            this.velX =  0;

        if (jump && this.onGround) this.velY = JUMP_VEL;

        // PROTOCOL: Fast-Forward — teleport 5 segments, drain buffer
        if (Phaser.Input.Keyboard.JustDown(this.keyF) && this.fastFwdCooldown <= 0) {
            this._doFastForward();
        }
        if (this.fastFwdCooldown > 0) this.fastFwdCooldown -= dt;
    }

    _applyPhysics(dt) {
        const H = this.scale.height;
        const ground = H - 60;

        this.velY += GRAVITY * dt;
        this.playerX += this.velX * dt;
        this.playerY += this.velY * dt;

        // World bounds
        if (this.playerX < 10) this.playerX = 10;

        this.onGround = false;

        // Check platform collisions
        for (const plat of this.platforms) {
            if (!plat.visible) continue;
            const px = this.playerX;
            const py = this.playerY;
            const inX = px + PLAYER_W / 2 > plat.x && px - PLAYER_W / 2 < plat.x + plat.w;
            const wasAbove = (py - this.velY * dt) <= plat.y;
            const nowOn    = py >= plat.y && py <= plat.y + plat.h + 2;

            if (inX && wasAbove && nowOn && this.velY >= 0) {
                this.playerY = plat.y;
                this.velY    = 0;
                this.onGround = true;

                // Drain buffer while moving on platforms
                if (this.velX !== 0) {
                    this.bufferDrainAccum += Math.abs(this.velX) * (1 / 1000);
                    if (this.bufferDrainAccum > SEGMENT_W / 1000) {
                        this.bufferDrainAccum = 0;
                        this._drainBuffer(1);
                    }
                }
            }
        }

        // Ground
        if (this.playerY >= ground) {
            this.playerY = ground;
            this.velY    = 0;
            this.onGround = true;
            if (this.velX !== 0) {
                this.bufferDrainAccum += Math.abs(this.velX) * (1 / 1000);
                if (this.bufferDrainAccum > SEGMENT_W / 1000) {
                    this.bufferDrainAccum = 0;
                    this._drainBuffer(1);
                }
            }
        }
    }

    _drainBuffer(amount) {
        const stormMult = this.stormActive ? 2 : 1;
        this.bufferFill = Math.max(0, this.bufferFill - amount * stormMult);

        if (this.bufferFill <= 0 && !this.frozen) {
            this._triggerFreeze();
        }
    }

    _triggerFreeze() {
        this.frozen = true;
        this.freezeTimer = 2000;
        this.bufferEvents++;
        console.log(`[DASH] BUFFERING EVENT #${this.bufferEvents} — player frozen for 2s`);
        this._showPopup(`⚠ BUFFERING… (${this.bufferEvents}/3 events)`, 2000);

        if (this.bufferEvents >= 3) {
            this.time.delayedCall(2000, () => this._showGameOver());
        }
    }

    _handleFreeze(delta) {
        if (this.frozen) {
            this.freezeTimer -= delta;
            if (this.freezeTimer <= 0) {
                this.frozen = false;
                this.bufferFill = 2; // small recovery
                console.log('[DASH] Buffering ended — resuming playback');
            }
        }
    }

    _checkMPDPickup() {
        if (this.hasMPD) return;
        const dist = Math.abs(this.playerX - this.mpdX);
        if (dist < 20 && Math.abs(this.playerY - this.mpdY) < 30) {
            this.hasMPD = true;
            this.mpdGfx.setVisible(false);
            this.mpdLabel.setVisible(false);
            console.log('[DASH] MPD collected — qualities: 360p / 720p / 1080p');
            this._showPopup('MPD loaded!\nQualities available: 360p / 720p / 1080p\n\nPlatforms are now visible!', 4000);
            this.platforms.forEach(p => { p.lbl.setVisible(true); });

            // Fill buffer with initial segments
            this.bufferFill = 4;
            this._runABR();
        }
    }

    _checkSegmentEntry() {
        const seg = Math.floor((this.playerX - 80) / SEGMENT_W);
        if (seg >= 0 && seg < TOTAL_SEGS && seg !== this.currentSeg) {
            this.currentSeg = seg;
            this._onNewSegment(seg);
        }
    }

    _onNewSegment(seg) {
        // Download next segment, update buffer
        const stormPenalty = this.stormActive ? 0.2 : 1;
        const downloadedQuality = this.fastFwdSegs > 0 ? '360p' : this.abr.currentQuality;
        if (this.fastFwdSegs > 0) this.fastFwdSegs--;

        // Buffer: +1 downloaded, -1 consumed
        this.bufferFill = Math.min(MAX_BUFFER, this.bufferFill + 1 * stormPenalty);

        // Record quality for this segment
        this.segmentQualities[seg] = downloadedQuality;

        // Update platform color ahead
        if (seg + 3 < TOTAL_SEGS) {
            this._recolorPlatform(this.platforms[seg + 3], downloadedQuality);
        }

        console.log(`[DASH] Entered segment ${seg} | quality=${downloadedQuality} | buffer=${this.bufferFill.toFixed(1)}/${MAX_BUFFER}`);

        // Run ABR for next segment
        this._runABR();
    }

    _runABR() {
        const bufRatio = this.bufferFill / MAX_BUFFER;
        const quality  = this.abr.computeNextQuality(bufRatio);
        this.abrText.setText(this.abr.lastDecision);
        this._updateHUD();
    }

    _doFastForward() {
        // PROTOCOL: Fast-Forward — seek 5 segments ahead, drain buffer
        const jumpSegs = 5;
        this.playerX += jumpSegs * SEGMENT_W;
        this.bufferFill = MAX_BUFFER * 0.05; // drain to 5%
        this.fastFwdSegs = 3;               // 3 segments forced 360p
        this.fastFwdCooldown = 5;
        this.abr.fastForward();
        console.log('[DASH] FAST-FORWARD: jumped 5 segments, buffer drained to 5%');
        this._showPopup('⚡ Fast-forward!\nBuffer: 5% — next 3 segments forced to 360p', 2500);

        // Camera flash
        this.cameras.main.flash(300, 255, 255, 255, false);
    }

    _handleStorm(delta) {
        if (this.levelComplete) return;

        if (!this.stormActive) {
            this.stormTimer -= delta;
            if (this.stormTimer <= 0) {
                this._startStorm();
            }
        } else {
            this.stormTimer -= delta;
            if (this.stormTimer <= 0) {
                this._endStorm();
            }
            // Storm particle animation
            this._animateStorm();
        }
    }

    _startStorm() {
        this.stormActive = true;
        this.stormTimer  = 8000;
        this.abr.setCongestion(true);
        this.stormOverlay.setAlpha(0.35);
        this._showPopup('⛈ CONGESTION STORM!\nBandwidth → 20% | Buffer drains 2× faster', 3000);
        console.log('[DASH] Congestion storm STARTED');

        // Create storm particles
        for (let i = 0; i < 20; i++) {
            this.stormParticles.push({
                x: Phaser.Math.Between(0, this.scale.width),
                y: Phaser.Math.Between(0, this.scale.height * 0.6),
                r: Phaser.Math.Between(4, 12),
                speed: Phaser.Math.Between(30, 80)
            });
        }
    }

    _endStorm() {
        this.stormActive = false;
        this.stormTimer  = this.stormCooldown;
        this.abr.setCongestion(false);
        this.stormOverlay.setAlpha(0);
        this.stormParticles = [];
        this.stormGraphics.clear();
        console.log('[DASH] Congestion storm CLEARED — quality recovering via ABR');
    }

    _animateStorm() {
        const g = this.stormGraphics;
        g.clear();
        g.fillStyle(0x334466, 0.5);
        this.stormParticles.forEach(p => {
            p.x -= p.speed / 60;
            if (p.x < -20) p.x = this.scale.width + 20;
            p.y += Math.sin(Date.now() / 300 + p.x) * 0.4;
            g.fillEllipse(p.x, p.y, p.r * 3, p.r);
        });
        g.setScrollFactor(0);
    }

    _checkEndServer() {
        if (Math.abs(this.playerX - this.endServerX) < 30 && !this.levelComplete) {
            this.levelComplete = true;
            const success = this.bufferEvents < 3;
            const msg = success
                ? `🎉 LEVEL COMPLETE!\nBuffer events: ${this.bufferEvents}/3\nYou survived the DASH stream!`
                : `💀 FAILED — Too many buffer events (${this.bufferEvents}/3)`;
            console.log(`[DASH] Level ended | bufferEvents=${this.bufferEvents} | success=${success}`);
            this._showPopup(msg, 99999);
            this.time.delayedCall(4000, () => {
                this.scene.stop('HUDScene');
                this.scene.start('MenuScene');
            });
        }
    }

    _showGameOver() {
        this.levelComplete = true;
        this._showPopup('💀 GAME OVER\n3 buffering events reached!\nReturning to menu…', 4000);
        this.time.delayedCall(4000, () => {
            this.scene.stop('HUDScene');
            this.scene.start('MenuScene');
        });
    }

    _updateHUD() {
        this.game.events.emit('hudUpdate', {
            zone: 'DASH',
            buffer: this.bufferFill / MAX_BUFFER,
            quality: this.frozen ? 'FROZEN' : this.abr.currentQuality,
            abrDecision: this.abr.lastDecision,
        });
    }
}
