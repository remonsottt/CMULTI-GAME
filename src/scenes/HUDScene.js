export class HUDScene extends Phaser.Scene {
    constructor() {
        super({ key: 'HUDScene' });
        this.zone = 'DASH';
    }
    init(data) { this.zone = data?.zone ?? 'DASH'; }
    create() {
        const W = this.scale.width;
        this.zoneLbl = this.add.text(12, 10, '', { fontSize: '13px', color: '#ffffff', backgroundColor: '#00000099', padding: { x: 6, y: 3 } }).setDepth(100);
        this.barBg = this.add.rectangle(12, 40, 210, 18, 0x333333).setOrigin(0, 0).setDepth(100);
        this.barSegments = [];
        for (let i = 0; i < 7; i++) {
            const seg = this.add.rectangle(14 + i * 30, 42, 28, 14, 0x555555).setOrigin(0, 0).setDepth(101);
            this.barSegments.push(seg);
        }
        this.barLabel = this.add.text(12, 62, 'Buffer: 0/7', { fontSize: '10px', color: '#cccccc' }).setDepth(100);
        this.qualityBadge = this.add.text(12, 80, '360p', { fontSize: '16px', color: '#E24B4A', fontStyle: 'bold', backgroundColor: '#00000099', padding: { x: 6, y: 3 } }).setDepth(100);
        this.abrPanel = this.add.text(W - 12, 10, '', { fontSize: '10px', color: '#ffffff', backgroundColor: '#00000099', padding: { x: 6, y: 3 }, align: 'right', wordWrap: { width: 220 } }).setOrigin(1, 0).setDepth(100);
        this.lossPanel = this.add.text(W - 12, 100, '', { fontSize: '10px', color: '#EF9F27', backgroundColor: '#00000099', padding: { x: 6, y: 3 }, align: 'right' }).setOrigin(1, 0).setDepth(100);
        this.igmpStatus = this.add.text(W - 12, 125, 'Channel: — | TTL: 1', { fontSize: '10px', color: '#378ADD', backgroundColor: '#00000099', padding: { x: 6, y: 3 }, align: 'right' }).setOrigin(1, 0).setDepth(100);
        const H = this.scale.height;
        this.add.rectangle(0, H - 40, W, 40, 0x000000, 0.75).setOrigin(0, 0).setDepth(99);
        this.igmpLogText = this.add.text(8, H - 37, '', { fontSize: '9px', color: '#378ADD', wordWrap: { width: W * 0.6 } }).setDepth(100);
        this.controlsText = this.add.text(W - 8, H - 37, this._controlsHint(), { fontSize: '9px', color: '#aaaaaa', align: 'right' }).setOrigin(1, 0).setDepth(100);
        this.game.events.on('hudUpdate', this._onHudUpdate, this);
        this.game.events.on('igmpLog',   this._onIgmpLog,   this);
        this.updateZoneLabel();
    }
    _controlsHint() {
        return this.zone === 'DASH'
            ? '← → Move  |  SPACE Jump  |  F Fast-Fwd  |  ESC Menu'
            : '← → Move  |  SPACE Jump  |  1/2/3 Channel  |  ESC Menu';
    }
    updateZoneLabel() {
        const proto = this.zone === 'DASH' ? 'HTTP DASH (ABR)' : 'RTP/IGMP (IPTV)';
        this.zoneLbl.setText(`Zone: ${this.zone} Land\n${proto}`);
    }
    _onHudUpdate(data) {
        if (data.zone) { this.zone = data.zone; this.updateZoneLabel(); this.controlsText.setText(this._controlsHint()); }
        if (data.buffer !== undefined) {
            const filled = Math.round((data.buffer ?? 0) * 7);
            const quality = data.quality ?? '360p';
            const colors = { '1080p': 0x1D9E75, '720p': 0xEF9F27, '360p': 0xE24B4A, 'FROZEN': 0x888888 };
            const col = colors[quality] ?? 0x555555;
            this.barSegments.forEach((seg, i) => seg.setFillStyle(i < filled ? col : 0x333333));
            this.barLabel.setText(`Buffer: ${filled}/7 segments`);
            this.qualityBadge.setText(quality).setColor(
                quality === '1080p' ? '#1D9E75' : quality === '720p' ? '#EF9F27' : quality === 'FROZEN' ? '#888888' : '#E24B4A'
            );
        }
        if (data.jitter !== undefined) {
            const jPct = Math.min(1, data.jitter / 200);
            const filled = Math.round(jPct * 7);
            const col = jPct > 0.75 ? 0xE24B4A : jPct > 0.4 ? 0xEF9F27 : 0x1D9E75;
            this.barSegments.forEach((seg, i) => seg.setFillStyle(i < filled ? col : 0x333333));
            this.barLabel.setText(`Jitter: ${data.jitter.toFixed(0)}ms`);
        }
        if (data.abrDecision) this.abrPanel.setText(`ABR:\n${data.abrDecision}`);
        if (data.loss !== undefined) this.lossPanel.setText(`Loss: ${data.loss}`);
        if (data.igmpStatus) this.igmpStatus.setText(data.igmpStatus);
    }
    _onIgmpLog(log) { this.igmpLogText.setText(log.slice(-3).join('\n')); }
    destroy() {
        this.game.events.off('hudUpdate', this._onHudUpdate, this);
        this.game.events.off('igmpLog',   this._onIgmpLog,   this);
        super.destroy();
    }
}
