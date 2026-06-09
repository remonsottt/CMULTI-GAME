export class MenuScene extends Phaser.Scene {
    constructor() { super({ key: 'MenuScene' }); }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        this.add.rectangle(0, 0, W, H, 0x1a1a2e).setOrigin(0, 0);
        const g = this.add.graphics();
        g.lineStyle(1, 0x333355, 0.4);
        for (let x = 0; x < W; x += 40) g.lineBetween(x, 0, x, H);
        for (let y = 0; y < H; y += 40) g.lineBetween(0, y, W, y);
        this.packets = [];
        for (let i = 0; i < 15; i++) {
            const p = this.add.rectangle(
                Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), 6, 6,
                Phaser.Utils.Array.GetRandom([0x1D9E75, 0x378ADD, 0xEF9F27]), 0.5
            );
            this.packets.push({ obj: p, speed: Phaser.Math.Between(40, 120) });
        }
        this.add.text(W / 2, 80, 'STREAMWORLD', {
            fontSize: '56px', color: '#1D9E75', fontStyle: 'bold',
            stroke: '#0a5040', strokeThickness: 4
        }).setOrigin(0.5);
        this.add.text(W / 2, 142, 'Survive the network', {
            fontSize: '20px', color: '#aaaacc', fontStyle: 'italic'
        }).setOrigin(0.5);
        this._drawTable(W / 2 - 260, 185);
        this._makeZoneButton(W / 2 - 160, 390, 'DASH Land',
            'Adaptive streaming | Buffer management | Congestion storms',
            '#1D9E75', () => this._startZone('DASH'));
        this._makeZoneButton(W / 2 + 160, 390, 'RTP Land',
            'Real-time packets | No buffer | IGMP multicast channels',
            '#378ADD', () => this._startZone('RTP'));
        this.add.text(W / 2, H - 20, 'StreamWorld — Educational Network Protocol Game', {
            fontSize: '11px', color: '#555577'
        }).setOrigin(0.5);
    }

    _drawTable(x, y) {
        const cols = [180, 100, 80, 110, 160];
        const rows = [
            ['Protocol', 'Latency', 'Scale', 'Multicast', 'Application'],
            ['DASH (HTTP)', 'HIGH 6-30s', 'HIGH', 'NO', 'VoD Streaming'],
            ['RTP/IGMP', 'LOW <150ms', 'LOW', 'YES', 'IPTV Live'],
        ];
        const g = this.add.graphics();
        const rowH = 28;
        const totalW = cols.reduce((a, b) => a + b, 0);
        rows.forEach((row, ri) => {
            const bg = ri === 0 ? 0x22224a : ri === 1 ? 0x1a3a2a : 0x1a2a3a;
            g.fillStyle(bg, 0.9); g.fillRect(x, y + ri * rowH, totalW, rowH);
            g.lineStyle(1, 0x334466, 1); g.strokeRect(x, y + ri * rowH, totalW, rowH);
            let cx = x;
            row.forEach((cell, ci) => {
                const color = ri === 0 ? '#aabbdd' :
                    (ci === 1 && ri === 1) ? '#E24B4A' : (ci === 1 && ri === 2) ? '#1D9E75' :
                    (ci === 3 && ri === 1) ? '#888888' : (ci === 3 && ri === 2) ? '#1D9E75' : '#cccccc';
                this.add.text(cx + 6, y + ri * rowH + 7, cell, {
                    fontSize: '11px', color, fontStyle: ri === 0 ? 'bold' : 'normal'
                });
                cx += cols[ci];
            });
        });
    }

    _makeZoneButton(x, y, title, desc, color, cb) {
        const W = 280, H = 130;
        const bg = this.add.rectangle(x, y, W, H, 0x111133, 0.95)
            .setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(color).color)
            .setInteractive({ useHandCursor: true });
        this.add.text(x, y - 32, title, { fontSize: '22px', color, fontStyle: 'bold' }).setOrigin(0.5);
        this.add.text(x, y + 5, desc, {
            fontSize: '11px', color: '#aaaacc', wordWrap: { width: W - 20 }, align: 'center'
        }).setOrigin(0.5);
        const btn = this.add.text(x, y + 46, '▶  PLAY', {
            fontSize: '14px', color: '#ffffff', backgroundColor: color, padding: { x: 16, y: 6 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => bg.setFillStyle(0x222255));
        bg.on('pointerout',  () => bg.setFillStyle(0x111133));
        bg.on('pointerdown', cb);
        btn.on('pointerdown', cb);
        this.tweens.add({ targets: btn, scaleX: 1.05, scaleY: 1.05, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    _startZone(zone) {
        if (this.scene.isActive('HUDScene')) this.scene.stop('HUDScene');
        this.scene.start(zone === 'DASH' ? 'DASHScene' : 'RTPScene');
        this.scene.launch('HUDScene', { zone });
    }

    update(time, delta) {
        this.packets.forEach(p => {
            p.obj.x += p.speed * delta / 1000;
            if (p.obj.x > this.scale.width + 10) p.obj.x = -10;
        });
    }
}
