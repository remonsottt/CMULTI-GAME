// ZONE 2 — RTP Land: real-time arcade with IGMP, jitter, packet loss, MPEG2-TS PIDs
import { IGMPManager } from '../utils/IGMPManager.js';
import { PacketPhysics } from '../utils/PacketPhysics.js';

const MOVE_SPEED  = 170;
const GRAVITY     = 950;
const JUMP_VEL    = -490;
const PLAYER_W    = 20;
const PLAYER_H    = 26;
const WORLD_W     = 5000;
const SYNC_INTERVAL = 188; // PROTOCOL: MPEG2-TS — sync every 188 units

export class RTPScene extends Phaser.Scene {
    constructor() { super({ key: 'RTPScene' }); }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;

        this.igmp    = new IGMPManager(this);
        this.physics = new PacketPhysics();

        this.playerX    = 60;
        this.playerY    = H - 80;
        this.velX       = 0;
        this.velY       = 0;
        this.onGround   = false;
        this.currentChannel = 1;
        this.switchingChannel = false;
        this.score      = 0;
        this.syncMissed = 0;          // consecutive missed sync points
        this.lastSync   = 0;          // last sync point X
        this.nextSyncX  = SYNC_INTERVAL;
        this.rtcpTimer  = 5000;
        this.levelDone  = false;
        this.desyncAnim = false;

        // PROTOCOL: MPEG2-TS Program Map Table
        this.PMT = { video: 0x100, audio: 0x200 };
        this.PAT = {
            programs: [
                { num: 1, pids: [0x100, 0x200] },
                { num: 2, pids: [0x300, 0x400] },
            ]
        };
        this.collectedPIDs = [];
        this.validPIDs = [this.PMT.video, this.PMT.audio];

        // Background
        this.add.rectangle(0, 0, WORLD_W, H, 0x1a1a2e).setOrigin(0, 0);
        this._buildGrid();

        this.cameras.main.setBounds(0, 0, WORLD_W, H);

        // World
        this.platforms = [];
        this._buildChannelPlatforms(this.currentChannel);

        // Sync checkpoints
        this.syncPoints = [];
        this._buildSyncPoints(H);

        // Coin PIDs
        this.coins = [];
        this._buildCoins(H);

        // Towers
        this._buildTowers(H);

        // Player
        this.playerGfx = this.add.graphics().setDepth(10);
        this._drawPlayer();

        // RTCP packet animation container
        this.rtcpAnim = null;

        // PMT popup
        this._showPMT();

        // Input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
        this.key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
        this.key3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
        this.keyESC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

        this.popupText = this.add.text(W / 2, H / 2 - 60, '', {
            fontSize: '13px', color: '#ffffff',
            backgroundColor: '#00000099', padding: { x: 10, y: 6 },
            align: 'center', wordWrap: { width: 340 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(90).setVisible(false);

        // Jitter display per platform
        this.jitterLabels = [];

        // IGMP: join first channel
        this.igmp.onChannelChange = (ch) => this._onChannelChanged(ch);
        this.igmp.currentGroup = this.igmp.channels[1].ip;
        console.log(`[IGMP] Initially joined channel 1 — ${this.igmp.channels[1].name} (${this.igmp.channels[1].ip})`);

        this.cameras.main.startFollow(this.playerGfx, false, 0.1, 0.1);
        this.cameras.main.startFollow({ x: this.playerX, y: this.playerY }, false, 0.1, 0.1);

        this._updateHUD();
    }

    _buildGrid() {
        const g = this.add.graphics().setDepth(0);
        g.lineStyle(1, 0x223344, 0.3);
        for (let x = 0; x < WORLD_W; x += 60) g.lineBetween(x, 0, x, this.scale.height);
        for (let y = 0; y < this.scale.height; y += 60) g.lineBetween(0, y, WORLD_W, y);
    }

    _buildChannelPlatforms(channel) {
        // Destroy old platforms
        this.platforms.forEach(p => { p.gfx.destroy(); if (p.jLabel) p.jLabel.destroy(); });
        this.platforms = [];

        const H = this.scale.height;
        const ground = H - 60;
        const patterns = {
            1: [0, -60, 0, -120, 0, -60, 0],    // Canal+ — varied
            2: [0, -80, -80, 0, 0, -80, -80, 0], // La1 — sawtooth
            3: [-120, -60, 0, -60, -120, 0, -60], // HBO — irregular
        };
        const pat = patterns[channel] ?? patterns[1];

        // Ground
        const gnd = this.add.graphics().setDepth(1);
        gnd.fillStyle(0x223344, 1);
        gnd.fillRect(0, ground + 20, WORLD_W, 40);
        this.platforms.push({ gfx: gnd, x: 0, y: ground + 20, w: WORLD_W, h: 40, grounded: true });

        const channelColors = { 1: 0x1D9E75, 2: 0xEF9F27, 3: 0x8855cc };

        let x = 200;
        const count = 30;
        for (let i = 0; i < count; i++) {
            const yOff = pat[i % pat.length];
            const py   = ground + yOff;

            // PROTOCOL: RTP packet loss — 10% of platforms never appear
            const lost = this.physics.isPlatformLost();
            if (lost) {
                console.log(`[RTP] Platform ${i} LOST — simulating UDP packet loss`);
                x += 130;
                continue;
            }

            // PROTOCOL: Jitter — platform appears with random delay
            const jitter = this.physics.platformJitter();
            const tooLate = jitter > 150;

            const plat = {
                gfx: this.add.graphics().setDepth(2),
                x, y: py, w: 110, h: 16,
                jitter, tooLate, visible: false, channel,
                jLabel: null
            };

            if (!tooLate) {
                // Schedule delayed appearance
                this.time.delayedCall(jitter, () => {
                    if (!plat.gfx.active) return;
                    plat.visible = true;
                    plat.gfx.fillStyle(channelColors[channel] ?? 0x378ADD, 0.85);
                    plat.gfx.fillRoundedRect(plat.x, plat.y, plat.w, plat.h, 3);
                    plat.gfx.fillStyle(0xffffff, 0.12);
                    plat.gfx.fillRect(plat.x + 2, plat.y + 2, plat.w - 4, 4);

                    // Jitter label
                    const jCol = jitter > 100 ? '#EF9F27' : '#378ADD';
                    plat.jLabel = this.add.text(plat.x + plat.w / 2, plat.y - 14,
                        `J:${jitter.toFixed(0)}ms`, {
                            fontSize: '8px', color: jCol
                        }).setOrigin(0.5).setDepth(3);
                });
            } else {
                console.log(`[RTP] Platform ${i} appeared ${jitter.toFixed(0)}ms late — DISCARDED`);
            }

            this.platforms.push(plat);
            x += 130;
        }
    }

    _buildSyncPoints(H) {
        // PROTOCOL: MPEG2-TS sync byte — every 188 units
        const ground = H - 60;
        for (let sx = SYNC_INTERVAL; sx < WORLD_W - 200; sx += SYNC_INTERVAL) {
            const gfx = this.add.graphics().setDepth(4);
            gfx.fillStyle(0x378ADD, 0.9);
            gfx.fillCircle(sx, ground - 10, 8);
            gfx.fillStyle(0xffffff, 0.7);
            gfx.fillCircle(sx, ground - 10, 4);
            const lbl = this.add.text(sx, ground - 26, '0x47', {
                fontSize: '8px', color: '#78aaff'
            }).setOrigin(0.5).setDepth(5);
            this.syncPoints.push({ gfx, lbl, x: sx, y: ground - 10, touched: false });
        }
    }

    _buildCoins(H) {
        // PROTOCOL: MPEG2-TS PID coins scattered on platforms
        const ground = H - 60;
        const pidPool = [0x100, 0x200, 0x300, 0x400, 0x1FFF, 0x100, 0x200, 0x1FFF, 0x300];
        let idx = 0;
        for (let cx = 300; cx < WORLD_W - 300; cx += 200) {
            const pid = pidPool[idx % pidPool.length];
            idx++;
            const cy = ground - 50;
            const gfx = this.add.graphics().setDepth(6);
            const isValid = this.validPIDs.includes(pid);
            const isNull  = pid === 0x1FFF;
            const col = isNull ? 0x888888 : isValid ? 0xffdd44 : 0xcc4444;
            gfx.fillStyle(col, 1);
            gfx.fillCircle(cx, cy, 9);
            gfx.fillStyle(0xffffff, 0.3);
            gfx.fillCircle(cx - 3, cy - 3, 3);
            const pidHex = `0x${pid.toString(16).toUpperCase()}`;
            const lbl = this.add.text(cx, cy + 14, pidHex, {
                fontSize: '8px', color: '#aaccff'
            }).setOrigin(0.5).setDepth(7);
            this.coins.push({ gfx, lbl, x: cx, y: cy, pid, collected: false });
        }
    }

    _buildTowers(H) {
        const ground = H - 60;
        const towers = [
            { ch: 1, x: 400,  name: 'Canal+',  ip: '224.3.1.1', col: 0x1D9E75 },
            { ch: 2, x: 1800, name: 'La1',     ip: '224.3.1.2', col: 0xEF9F27 },
            { ch: 3, x: 3200, name: 'HBO',      ip: '224.3.1.3', col: 0x8855cc },
        ];
        towers.forEach(t => {
            const g = this.add.graphics().setDepth(2);
            g.fillStyle(t.col, 1);
            g.fillRect(t.x - 8, ground - 100, 16, 100);
            g.fillStyle(t.col, 0.7);
            g.fillTriangle(t.x - 14, ground - 100, t.x + 14, ground - 100, t.x, ground - 130);
            this.add.text(t.x, ground - 145, `${t.name}\n${t.ip}\n[Press ${t.ch}]`, {
                fontSize: '9px', color: '#ffffff', align: 'center',
                backgroundColor: '#00000077', padding: { x: 3, y: 2 }
            }).setOrigin(0.5).setDepth(3);
        });
    }

    _showPMT() {
        const msg =
            'MPEG2-TS Program Map Table received!\n' +
            'Program 1: Video PID=0x100 | Audio PID=0x200\n' +
            'Collect matching PIDs for points!\n' +
            'PID=0x1FFF → Null packet (ignore)\n' +
            'Wrong PIDs → -5 pts';
        this.popupText.setText(msg).setVisible(true);
        this.time.delayedCall(5000, () => this.popupText.setVisible(false));
        console.log('[MPEG2-TS] PMT received | Program 1: video=0x100, audio=0x200');

        // PAT log
        this.PAT.programs.forEach(p => {
            console.log(`[MPEG2-TS] PAT: Program ${p.num} — PIDs ${p.pids.map(x => '0x' + x.toString(16)).join(', ')}`);
        });
    }

    _showPopup(msg, dur) {
        this.popupText.setText(msg).setVisible(true);
        this.time.delayedCall(dur, () => this.popupText.setVisible(false));
    }

    update(time, delta) {
        if (this.levelDone) return;

        const dt = delta / 1000;
        this._handleInput(dt);
        this._applyPhysics(dt);
        this._checkSyncPoints();
        this._checkCoins();
        this._handleRTCP(delta);
        this._checkLevelEnd();
        this._drawPlayer();
        this._updateCameraFollow();
        this._updateHUD();

        if (this.keyESC.isDown) {
            this.scene.stop('HUDScene');
            this.scene.start('MenuScene');
        }
    }

    _handleInput(dt) {
        const left  = this.cursors.left.isDown;
        const right = this.cursors.right.isDown;
        const jump  = Phaser.Input.Keyboard.JustDown(this.cursors.space);

        if (left)       this.velX = -MOVE_SPEED;
        else if (right) this.velX =  MOVE_SPEED;
        else            this.velX = 0;

        if (jump && this.onGround) this.velY = JUMP_VEL;

        // IGMP channel switching
        if (Phaser.Input.Keyboard.JustDown(this.key1) && !this.switchingChannel) this._switchChannel(1);
        if (Phaser.Input.Keyboard.JustDown(this.key2) && !this.switchingChannel) this._switchChannel(2);
        if (Phaser.Input.Keyboard.JustDown(this.key3) && !this.switchingChannel) this._switchChannel(3);
    }

    _switchChannel(num) {
        if (num === this.currentChannel) return;
        this.switchingChannel = true;
        const oldCh = this.currentChannel;
        this.currentChannel = num;
        this.igmp.switchChannel(num);
        this._showPopup(
            `Switching to ${this.igmp.getChannelName(num)} (${this.igmp.getChannelIP(num)})\n` +
            `IGMP Leave ${this.igmp.getChannelIP(oldCh)} → QUERY → JOIN ${this.igmp.getChannelIP(num)}\n` +
            `Channel switch lag: ~1 second…`,
            2500
        );
    }

    _onChannelChanged(ch) {
        this.switchingChannel = false;
        this._buildChannelPlatforms(ch);
        console.log(`[IGMP] Channel switched to ${this.igmp.getChannelName(ch)} | stream resumed`);
    }

    _applyPhysics(dt) {
        const H = this.scale.height;
        const ground = H - 60;

        this.velY += GRAVITY * dt;
        this.playerX += this.velX * dt;
        this.playerY += this.velY * dt;

        if (this.playerX < 10) this.playerX = 10;
        if (this.playerX > WORLD_W - 10) this.playerX = WORLD_W - 10;

        this.onGround = false;

        for (const plat of this.platforms) {
            if (!plat.visible && !plat.grounded) continue;
            const px = this.playerX;
            const py = this.playerY;
            const inX = px + PLAYER_W / 2 > plat.x && px - PLAYER_W / 2 < plat.x + plat.w;
            const wasAbove = (py - this.velY * dt) <= plat.y;
            const nowOn    = py >= plat.y && py <= plat.y + plat.h + 4;

            if (inX && wasAbove && nowOn && this.velY >= 0) {
                this.playerY = plat.y;
                this.velY = 0;
                this.onGround = true;
            }
        }

        // Floor fallback
        if (this.playerY >= ground + 20) {
            this.playerY = ground + 20;
            this.velY = 0;
            this.onGround = true;
        }
    }

    _checkSyncPoints() {
        // PROTOCOL: MPEG2-TS sync byte 0x47 — must touch every 188px
        for (const sp of this.syncPoints) {
            if (sp.touched) continue;
            const dist = Math.abs(this.playerX - sp.x);
            if (dist < 16) {
                sp.touched = true;
                sp.gfx.clear();
                sp.gfx.fillStyle(0x44ff88, 0.9);
                sp.gfx.fillCircle(sp.x, sp.y, 8);
                sp.lbl.setColor('#44ff88');
                this.syncMissed = 0;
                console.log(`[MPEG2-TS] Sync byte 0x47 touched at x=${sp.x.toFixed(0)}`);
                continue;
            }

            // Passed a sync point without touching it
            if (this.playerX > sp.x + 30 && !sp.touched) {
                sp.touched = true; // mark as missed
                this.syncMissed++;
                console.log(`[MPEG2-TS] SYNC MISSED at x=${sp.x.toFixed(0)} | consecutive=${this.syncMissed}`);

                if (this.syncMissed >= 3) {
                    this._triggerDesync();
                }
            }
        }
    }

    _triggerDesync() {
        this.syncMissed = 0;
        console.log('[MPEG2-TS] DESYNC — 3 consecutive sync points missed! Respawning at last sync.');
        this._showPopup('📺 DESYNC!\n3 sync bytes missed — respawning at last checkpoint', 2500);

        // Flash / glitch effect
        this.cameras.main.shake(500, 0.02);
        this.cameras.main.flash(400, 255, 0, 0, false);

        // Respawn to last touched sync or start
        const lastTouched = this.syncPoints.filter(s => s.touched && !s.missed).pop();
        this.playerX = lastTouched ? lastTouched.x - 50 : 60;
        this.velX = 0;
        this.velY = 0;
    }

    _checkCoins() {
        for (const coin of this.coins) {
            if (coin.collected) continue;
            const dist = Math.hypot(this.playerX - coin.x, this.playerY - coin.y);
            if (dist < 18) {
                coin.collected = true;
                coin.gfx.setVisible(false);
                coin.lbl.setVisible(false);
                this.collectedPIDs.push(coin.pid);

                const pidHex = '0x' + coin.pid.toString(16).toUpperCase();

                if (coin.pid === 0x1FFF) {
                    // PROTOCOL: PID 0x1FFF — MPEG2-TS null packet
                    console.log(`[MPEG2-TS] Collected PID=${pidHex} — NULL packet (discarded)`);
                    this._showPopup(`PID ${pidHex} — Null packet\nNo effect`, 800);
                } else if (this.validPIDs.includes(coin.pid)) {
                    this.score += 10;
                    console.log(`[MPEG2-TS] Collected PID=${pidHex} — VALID | +10pts | score=${this.score}`);
                    this._showPopup(`✓ PID ${pidHex} — Valid!\n+10 points`, 700);
                } else {
                    this.score -= 5;
                    console.log(`[MPEG2-TS] Collected PID=${pidHex} — WRONG PROGRAM | -5pts | score=${this.score}`);
                    this._showPopup(`✗ PID ${pidHex} — Wrong program\n-5 points`, 700);
                }
            }
        }
    }

    _handleRTCP(delta) {
        // PROTOCOL: RTCP — Receiver Report every 5 seconds
        this.rtcpTimer -= delta;
        if (this.rtcpTimer <= 0) {
            this.rtcpTimer = 5000;
            const report = this.physics.buildRTCPReport();

            // Animate RTCP packet flying to server
            this._animateRTCPPacket();

            // PROTOCOL: If fraction_lost > 20% → reduce enemy difficulty
            if (report.fractionLost > 0.20) {
                console.log('[RTCP] High loss rate — server reducing difficulty by 30%');
                this._showPopup(
                    `📊 RTCP Report sent!\nLoss: ${(report.fractionLost*100).toFixed(1)}% — server adapts difficulty`, 2500
                );
            } else {
                this._showPopup(
                    `📊 RTCP Report | Loss: ${(report.fractionLost*100).toFixed(1)}% | Jitter: ${report.jitter.toFixed(0)}ms`, 2000
                );
            }
        }
    }

    _animateRTCPPacket() {
        const { width, height } = this.scale;
        const pkt = this.add.circle(this.playerX - this.cameras.main.scrollX + 10, height - 100, 6, 0x1D9E75, 1)
            .setScrollFactor(0).setDepth(50);
        const lbl = this.add.text(pkt.x, pkt.y - 16, 'RTCP RR', {
            fontSize: '8px', color: '#1D9E75'
        }).setScrollFactor(0).setDepth(51);

        this.tweens.add({
            targets: [pkt, lbl], x: width - 50, y: 40,
            duration: 1200, ease: 'Quad.easeOut',
            onComplete: () => { pkt.destroy(); lbl.destroy(); }
        });
    }

    _checkLevelEnd() {
        if (this.playerX > WORLD_W - 200 && !this.levelDone) {
            this.levelDone = true;
            const lossFrac = this.physics.getLossFraction();
            const success  = lossFrac < 0.20;
            const msg = success
                ? `🎉 STREAM COMPLETE!\nScore: ${this.score}\nLoss: ${(lossFrac*100).toFixed(1)}% (<20% ✓)\nYou survived RTP Land!`
                : `📺 STREAM DEGRADED\nScore: ${this.score}\nLoss: ${(lossFrac*100).toFixed(1)}% (>20% ✗)`;
            console.log(`[RTP] Level ended | score=${this.score} | loss=${(lossFrac*100).toFixed(1)}%`);
            this._showPopup(msg, 99999);
            this.time.delayedCall(5000, () => {
                this.scene.stop('HUDScene');
                this.scene.start('MenuScene');
            });
        }
    }

    _drawPlayer() {
        const g = this.playerGfx;
        g.clear();
        g.x = this.playerX;
        g.y = this.playerY;

        const col = this.switchingChannel ? 0xaaaa00 : 0x378ADD;
        g.fillStyle(col, 1);
        g.fillRoundedRect(-PLAYER_W / 2, -PLAYER_H, PLAYER_W, PLAYER_H, 4);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(-5, -PLAYER_H + 7, 4);
        g.fillCircle(5,  -PLAYER_H + 7, 4);
        g.fillStyle(0x111111, 1);
        g.fillCircle(-4, -PLAYER_H + 7, 2);
        g.fillCircle(6,  -PLAYER_H + 7, 2);
        // RTP antenna
        g.lineStyle(2, 0x78aaff, 1);
        g.lineBetween(0, -PLAYER_H, 0, -PLAYER_H - 10);
        g.fillStyle(0x78aaff, 1);
        g.fillCircle(0, -PLAYER_H - 12, 3);
    }

    _updateCameraFollow() {
        this.cameras.main.scrollX = Phaser.Math.Clamp(
            this.playerX - this.scale.width / 2,
            0, WORLD_W - this.scale.width
        );
    }

    _updateHUD() {
        const jitter = this.physics.currentJitter;
        const ip     = this.igmp.channels[this.currentChannel]?.ip ?? '—';
        const name   = this.igmp.getChannelName(this.currentChannel);

        this.game.events.emit('hudUpdate', {
            zone: 'RTP',
            jitter,
            quality: `Ch.${this.currentChannel}`,
            abrDecision:
                `Dij = (Rj-Ri)-(Sj-Si)\nJitter: ${jitter.toFixed(0)}ms\nScore: ${this.score}`,
            loss: `${this.physics.packetsLost}/${this.physics.packetsTotal} = ${this.physics.getLossPercent()}%`,
            igmpStatus: `Channel: ${name} (${ip}) | TTL: ${this.igmp.TTL}`,
        });

        // Forward IGMP log
        if (this.igmp.log.length > 0) {
            this.game.events.emit('igmpLog', this.igmp.log.slice());
        }
    }
}
