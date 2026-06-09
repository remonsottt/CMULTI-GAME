// ZONE 2 — RTP Land
import { IGMPManager  } from '../utils/IGMPManager.js';
import { PacketPhysics } from '../utils/PacketPhysics.js';

const MOVE_SPEED    = 165;
const GRAVITY       = 850;
const JUMP_VEL      = -470;
const PLAYER_W      = 22;
const PLAYER_H      = 28;
const WORLD_W       = 5200;
const SYNC_INTERVAL = 188;

export class RTPScene extends Phaser.Scene {
    constructor() { super({ key: 'RTPScene' }); }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        this.groundY = H - 55;
        this.igmp    = new IGMPManager(this);
        this.physics = new PacketPhysics();
        this.playerX = 55; this.playerY = this.groundY;
        this.velX = 0; this.velY = 0; this.onGround = true;
        this.currentCh = 1; this.switching = false;
        this.score = 0; this.syncMissed = 0; this.rtcpTimer = 5000; this.levelDone = false;
        this.validPIDs = [0x100, 0x200]; this.collectedPIDs = [];

        this.add.rectangle(0, 0, WORLD_W, H, 0x1a1a2e).setOrigin(0, 0);
        this._buildGrid();
        this.cameras.main.setBounds(0, 0, WORLD_W, H);
        this._buildGround();
        this.platGroup = []; this._buildChannelPlatforms(1);
        this.syncPts = []; this._buildSyncPoints();
        this.coins = [];   this._buildCoins();
        this._buildTowers();
        this._buildEndServer();

        this.playerGfx = this.add.graphics().setDepth(10);
        this._drawPlayer();
        this.cameras.main.startFollow(this.playerGfx, true, 0.1, 0.1);

        this.popupBg = this.add.rectangle(W / 2, H / 2 - 55, 380, 100, 0x000000, 0.85)
            .setScrollFactor(0).setDepth(89).setOrigin(0.5).setVisible(false);
        this.popupText = this.add.text(W / 2, H / 2 - 55, '', {
            fontSize: '12px', color: '#ffffff', align: 'center', wordWrap: { width: 360 }
        }).setScrollFactor(0).setDepth(90).setOrigin(0.5).setVisible(false);

        this.cursors = this.input.keyboard.createCursorKeys();
        this.key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
        this.key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
        this.key3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
        this.keyESC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

        this.igmp.currentGroup = this.igmp.channels[1].ip;
        this.igmp.onChannelChange = (ch) => this._onChannelChanged(ch);
        this._showPMT(); this._updateHUD();
    }

    _buildGrid() {
        const g = this.add.graphics().setDepth(0);
        g.lineStyle(1, 0x223344, 0.35);
        for (let x = 0; x < WORLD_W; x += 60) g.lineBetween(x, 0, x, this.scale.height);
        for (let y = 0; y < this.scale.height; y += 60) g.lineBetween(0, y, WORLD_W, y);
    }

    _buildGround() {
        const g = this.add.graphics().setDepth(1);
        g.fillStyle(0x223344, 1); g.fillRect(0, this.groundY + 2, WORLD_W, this.scale.height);
        g.fillStyle(0x334466, 1); g.fillRect(0, this.groundY, WORLD_W, 3);
    }

    _buildChannelPlatforms(channel) {
        this.platGroup.forEach(p => { p.gfx.destroy(); if (p.jLabel) p.jLabel.destroy(); });
        this.platGroup = [];
        const patterns = {
            1: [0,-70,0,-120,-70,0,-120,0,-70,-120,0,-70,-120,0,-70,0,-120,-70,0,-120,0,-70,0,-120,-70,0,-120,0,-70,0],
            2: [-85,-85,0,0,-85,-85,0,0,-85,0,-85,0,-85,-85,0,-85,0,0,-85,-85,0,0,-85,0,-85,-85,0,-85,0,0],
            3: [-120,-60,0,-60,-120,0,-60,-120,-60,0,-120,-60,0,-120,0,-60,-120,0,-60,-120,0,-60,-120,-60,0,-120,0,-60,-120,-60],
        };
        const pat = patterns[channel] ?? patterns[1];
        const chColors = { 1: 0x1D9E75, 2: 0xEF9F27, 3: 0x8855cc };
        const col = chColors[channel] ?? 0x378ADD;
        let x = 200;
        for (let i = 0; i < 32; i++) {
            if (this.physics.isPlatformLost()) { x += 140; continue; }
            const jitter = this.physics.platformJitter();
            if (jitter > 150) { x += 140; continue; }
            const py = this.groundY + pat[i % pat.length];
            const plat = { gfx: this.add.graphics().setDepth(2), x, y: py, w: 115, h: 16, jitter, visible: false, jLabel: null };
            this.time.delayedCall(jitter, () => {
                if (!plat.gfx.active) return;
                plat.visible = true;
                const g = plat.gfx;
                g.fillStyle(col, 0.88); g.fillRoundedRect(plat.x, plat.y, plat.w, plat.h, 3);
                g.fillStyle(0xffffff, 0.13); g.fillRect(plat.x + 2, plat.y + 2, plat.w - 4, 4);
                plat.jLabel = this.add.text(plat.x + plat.w / 2, plat.y - 13,
                    `J:${jitter.toFixed(0)}ms`, { fontSize: '8px', color: jitter > 100 ? '#EF9F27' : '#378ADD' }
                ).setOrigin(0.5).setDepth(3);
            });
            this.platGroup.push(plat); x += 140;
        }
    }

    _buildSyncPoints() {
        for (let sx = SYNC_INTERVAL; sx < WORLD_W - 300; sx += SYNC_INTERVAL) {
            const gfx = this.add.graphics().setDepth(4);
            gfx.fillStyle(0x378ADD, 0.9); gfx.fillCircle(sx, this.groundY - 12, 9);
            gfx.fillStyle(0xffffff, 0.7); gfx.fillCircle(sx, this.groundY - 12, 4);
            const lbl = this.add.text(sx, this.groundY - 28, '0x47', { fontSize: '8px', color: '#78aaff' }).setOrigin(0.5).setDepth(5);
            this.syncPts.push({ gfx, lbl, x: sx, touched: false });
        }
    }

    _buildCoins() {
        const pidPool = [0x100, 0x200, 0x300, 0x400, 0x1FFF, 0x100, 0x200, 0x1FFF, 0x300, 0x400, 0x100, 0x200];
        for (let i = 0; i < pidPool.length; i++) {
            const cx = 400 + i * 370, pid = pidPool[i];
            const col = pid === 0x1FFF ? 0x666688 : this.validPIDs.includes(pid) ? 0xffdd44 : 0xcc3333;
            const gfx = this.add.graphics().setDepth(6);
            gfx.fillStyle(col, 1); gfx.fillCircle(cx, this.groundY - 48, 10);
            const lbl = this.add.text(cx, this.groundY - 62, '0x' + pid.toString(16).toUpperCase(), { fontSize: '8px', color: '#aaccff' }).setOrigin(0.5).setDepth(7);
            this.coins.push({ gfx, lbl, x: cx, y: this.groundY - 48, pid, collected: false });
        }
    }

    _buildTowers() {
        [{ ch:1, x:380, name:'Canal+', ip:'224.3.1.1', col:0x1D9E75 },
         { ch:2, x:1900, name:'La1', ip:'224.3.1.2', col:0xEF9F27 },
         { ch:3, x:3400, name:'HBO', ip:'224.3.1.3', col:0x8855cc }].forEach(t => {
            const g = this.add.graphics().setDepth(2);
            g.fillStyle(t.col, 1); g.fillRect(t.x - 9, this.groundY - 110, 18, 110);
            g.fillStyle(t.col, 0.7); g.fillTriangle(t.x - 16, this.groundY - 110, t.x + 16, this.groundY - 110, t.x, this.groundY - 145);
            this.add.text(t.x, this.groundY - 162, `${t.name}\n${t.ip}\n[Press ${t.ch}]`, {
                fontSize: '9px', color: '#ffffff', align: 'center', backgroundColor: '#00000088', padding: { x: 3, y: 2 }
            }).setOrigin(0.5).setDepth(3);
        });
    }

    _buildEndServer() {
        const ex = WORLD_W - 120; this.endX = ex;
        const g = this.add.graphics().setDepth(2);
        g.fillStyle(0x1D9E75, 1); g.fillRect(ex - 25, this.groundY - 100, 50, 100);
        g.fillStyle(0x0d5533, 1); [10,28,46,64].forEach(dy => g.fillRect(ex - 21, this.groundY - 100 + dy, 42, 12));
        this.add.text(ex, this.groundY - 115, 'STREAM\nEND', { fontSize: '11px', color: '#1D9E75', fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setDepth(3);
    }

    update(time, delta) {
        if (this.levelDone) return;
        const dt = delta / 1000;
        this._handleInput(dt); this._applyPhysics(dt);
        this._checkSyncPoints(); this._checkCoins();
        this._handleRTCP(delta); this._checkEnd();
        this._drawPlayer(); this._updateHUD();
        if (Phaser.Input.Keyboard.JustDown(this.keyESC)) { this.scene.stop('HUDScene'); this.scene.start('MenuScene'); }
    }

    _handleInput(dt) {
        this.velX = this.cursors.right.isDown ? MOVE_SPEED : this.cursors.left.isDown ? -MOVE_SPEED : 0;
        if (Phaser.Input.Keyboard.JustDown(this.cursors.space) && this.onGround) this.velY = JUMP_VEL;
        if (!this.switching) {
            if (Phaser.Input.Keyboard.JustDown(this.key1)) this._switchChannel(1);
            if (Phaser.Input.Keyboard.JustDown(this.key2)) this._switchChannel(2);
            if (Phaser.Input.Keyboard.JustDown(this.key3)) this._switchChannel(3);
        }
    }

    _applyPhysics(dt) {
        this.velY += GRAVITY * dt;
        const prevY = this.playerY;
        this.playerX += this.velX * dt; this.playerY += this.velY * dt;
        this.playerX = Phaser.Math.Clamp(this.playerX, 10, WORLD_W - 10);
        this.onGround = false;
        for (const p of this.platGroup) {
            if (!p.visible) continue;
            const inX = this.playerX + PLAYER_W / 2 > p.x && this.playerX - PLAYER_W / 2 < p.x + p.w;
            if (inX && prevY <= p.y + 1 && this.playerY >= p.y && this.playerY <= p.y + p.h + 5 && this.velY >= 0) {
                this.playerY = p.y; this.velY = 0; this.onGround = true; break;
            }
        }
        if (this.playerY >= this.groundY) { this.playerY = this.groundY; this.velY = 0; this.onGround = true; }
    }

    _switchChannel(ch) {
        if (ch === this.currentCh) return;
        const prev = this.currentCh; this.currentCh = ch; this.switching = true;
        this.igmp.switchChannel(ch);
        this._showPopup(`Switching to ${this.igmp.getChannelName(ch)} (${this.igmp.getChannelIP(ch)})\nIGMP Leave → Query → JOIN\nChannel switch lag ~1s…`, 2500);
    }

    _onChannelChanged(ch) { this.switching = false; this._buildChannelPlatforms(ch); }

    _checkSyncPoints() {
        for (const sp of this.syncPts) {
            if (sp.touched) continue;
            if (Math.abs(this.playerX - sp.x) < 18 && this.playerY >= this.groundY - 30) {
                sp.touched = true;
                sp.gfx.clear(); sp.gfx.fillStyle(0x44ff88, 1); sp.gfx.fillCircle(sp.x, this.groundY - 12, 9);
                sp.lbl.setColor('#44ff88'); this.syncMissed = 0;
            } else if (this.playerX > sp.x + 25) {
                sp.touched = true; this.syncMissed++;
                sp.gfx.clear(); sp.gfx.fillStyle(0xE24B4A, 0.7); sp.gfx.fillCircle(sp.x, this.groundY - 12, 9);
                sp.lbl.setColor('#E24B4A');
                if (this.syncMissed >= 3) this._triggerDesync();
            }
        }
    }

    _triggerDesync() {
        this.syncMissed = 0;
        this._showPopup('📺 DESYNC!\n3 sync bytes missed — respawning', 2500);
        this.cameras.main.shake(500, 0.018); this.cameras.main.flash(350, 255, 0, 0);
        this.playerX = 60; this.velX = 0; this.velY = 0;
    }

    _checkCoins() {
        for (const coin of this.coins) {
            if (coin.collected || Math.hypot(this.playerX - coin.x, this.playerY - coin.y) > 22) continue;
            coin.collected = true; coin.gfx.setVisible(false); coin.lbl.setVisible(false);
            const hex = '0x' + coin.pid.toString(16).toUpperCase();
            if (coin.pid === 0x1FFF) {
                this._showPopup(`PID ${hex} — Null packet\n(no effect)`, 900);
            } else if (this.validPIDs.includes(coin.pid)) {
                this.score += 10; this._showPopup(`✓ PID ${hex} — Valid!\n+10 points`, 800);
            } else {
                this.score = Math.max(0, this.score - 5); this._showPopup(`✗ PID ${hex} — Wrong program\n-5 points`, 800);
            }
        }
    }

    _handleRTCP(delta) {
        this.rtcpTimer -= delta;
        if (this.rtcpTimer > 0) return;
        this.rtcpTimer = 5000;
        const report = this.physics.buildRTCPReport();
        this._animateRTCP();
        const lossPct = (report.fractionLost * 100).toFixed(1);
        this._showPopup(`📊 RTCP RR | Loss:${lossPct}% | Jitter:${report.jitter.toFixed(0)}ms${report.fractionLost > 0.2 ? '\nServer adapts: difficulty −30%' : ''}`, 2500);
    }

    _animateRTCP() {
        const { width, height } = this.scale;
        const pkt = this.add.circle(width / 2, height - 80, 7, 0x1D9E75, 1).setScrollFactor(0).setDepth(50);
        const lbl = this.add.text(width / 2, height - 96, 'RTCP RR', { fontSize: '9px', color: '#1D9E75' }).setScrollFactor(0).setDepth(51).setOrigin(0.5);
        this.tweens.add({ targets: [pkt, lbl], x: width - 40, y: 30, duration: 1200, ease: 'Quad.easeOut', onComplete: () => { pkt.destroy(); lbl.destroy(); } });
    }

    _checkEnd() {
        if (this.playerX < this.endX - 40 || this.levelDone) return;
        this.levelDone = true;
        const loss = this.physics.getLossFraction();
        const lossPct = (loss * 100).toFixed(1);
        this._showPopup(loss < 0.20
            ? `🎉 STREAM COMPLETE!\nScore: ${this.score} | Loss: ${lossPct}% (<20% ✓)`
            : `📺 STREAM DEGRADED\nScore: ${this.score} | Loss: ${lossPct}% (>20% ✗)`, 99999);
        this.time.delayedCall(5000, () => { this.scene.stop('HUDScene'); this.scene.start('MenuScene'); });
    }

    _drawPlayer() {
        this.playerGfx.x = this.playerX; this.playerGfx.y = this.playerY;
        const g = this.playerGfx; g.clear();
        g.fillStyle(this.switching ? 0xaaaa22 : 0x378ADD, 1);
        g.fillRoundedRect(-PLAYER_W / 2, -PLAYER_H, PLAYER_W, PLAYER_H, 5);
        g.fillStyle(0xffffff, 0.2); g.fillRoundedRect(-PLAYER_W / 2 + 3, -PLAYER_H + 3, PLAYER_W - 6, 8, 3);
        g.fillStyle(0xffffff, 1); g.fillCircle(-5, -PLAYER_H + 9, 4); g.fillCircle(5, -PLAYER_H + 9, 4);
        g.fillStyle(0x111144, 1); g.fillCircle(-4, -PLAYER_H + 9, 2); g.fillCircle(6, -PLAYER_H + 9, 2);
        g.lineStyle(2, 0x88ccff, 1); g.lineBetween(0, -PLAYER_H, 0, -PLAYER_H - 12);
        g.fillStyle(0x88ccff, 1); g.fillCircle(0, -PLAYER_H - 14, 3);
    }

    _showPMT() {
        this._showPopup('MPEG2-TS PMT received!\nProgram 1: Video PID=0x100 | Audio PID=0x200\nCollect valid PIDs for +10pts | Wrong = -5pts\nPID=0x1FFF → Null (ignore)', 5000);
    }

    _showPopup(msg, dur) {
        this.popupBg.setVisible(true); this.popupText.setText(msg).setVisible(true);
        if (dur < 99000) this.time.delayedCall(dur, () => { this.popupBg.setVisible(false); this.popupText.setVisible(false); });
    }

    _updateHUD() {
        const jitter = this.physics.currentJitter;
        const ip = this.igmp.channels[this.currentCh]?.ip ?? '—';
        this.game.events.emit('hudUpdate', {
            zone: 'RTP', jitter, quality: `Ch.${this.currentCh}`,
            abrDecision: `Dij=(Rj-Ri)-(Sj-Si)\nJitter: ${jitter.toFixed(0)}ms\nScore: ${this.score}`,
            loss: `${this.physics.packetsLost}/${this.physics.packetsTotal} = ${this.physics.getLossPercent()}%`,
            igmpStatus: `Channel: ${this.igmp.getChannelName(this.currentCh)} (${ip}) | TTL: ${this.igmp.TTL}`,
        });
        if (this.igmp.log.length > 0) this.game.events.emit('igmpLog', this.igmp.log.slice());
    }
}
