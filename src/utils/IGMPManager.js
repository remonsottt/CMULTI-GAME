// PROTOCOL: IGMP v2 — multicast group join/leave/query
export class IGMPManager {
    constructor(scene) {
        this.scene = scene;
        this.TTL = 1; // PROTOCOL: IGMP TTL=1 — local LAN only
        this.currentGroup = null;
        this.log = [];
        this.ALL_ROUTERS = '224.0.0.2';
        this.channels = {
            1: { ip: '224.3.1.1', name: 'Canal+' },
            2: { ip: '224.3.1.2', name: 'La1'    },
            3: { ip: '224.3.1.3', name: 'HBO'    },
        };
        this.onChannelChange = null;
    }
    sendReport(groupIP) {
        console.log(`[IGMP] Report sent to ${groupIP} | TTL=${this.TTL}`);
        this._addLog(`JOIN → ${groupIP} | TTL=${this.TTL}`);
        this._animatePacket(groupIP, 0x378ADD);
    }
    sendLeave(groupIP) {
        console.log(`[IGMP] Leave Group ${groupIP} → ${this.ALL_ROUTERS} | TTL=${this.TTL}`);
        this._addLog(`LEAVE ${groupIP} → ${this.ALL_ROUTERS}`);
        this._animatePacket(this.ALL_ROUTERS, 0xE24B4A);
    }
    handleQuery(groupIP) {
        console.log(`[IGMP] Group-Specific Query for ${groupIP} | TTL=${this.TTL}`);
        this._addLog(`QUERY? ${groupIP} from router`);
        if (this.scene?.time) {
            this.scene.time.delayedCall(100, () => {
                this._addLog(`QUERY ACK: no others on ${groupIP}`);
            });
        }
    }
    switchChannel(newCh) {
        const newChannel = this.channels[newCh];
        if (!newChannel || this.currentGroup === newChannel.ip) return;
        if (this.currentGroup) {
            this.sendLeave(this.currentGroup);
            this.scene.time.delayedCall(200, () => this.handleQuery(this.currentGroup));
        }
        this.scene.time.delayedCall(400, () => {
            this.currentGroup = newChannel.ip;
            this.sendReport(newChannel.ip);
            this.scene.time.delayedCall(600, () => {
                if (this.onChannelChange) this.onChannelChange(newCh);
            });
        });
    }
    getChannelName(num) { return this.channels[num]?.name ?? 'Unknown'; }
    getChannelIP(num)   { return this.channels[num]?.ip   ?? '0.0.0.0'; }
    _addLog(msg) {
        this.log.push(msg);
        if (this.log.length > 3) this.log.shift();
        if (this.scene?.events) this.scene.events.emit('igmpLog', this.log.slice());
    }
    _animatePacket(destIP, color) {
        if (!this.scene?.add) return;
        const { width, height } = this.scene.scale;
        const pkt = this.scene.add.circle(100, height - 60, 8, color, 0.9).setDepth(50);
        const lbl = this.scene.add.text(100, height - 75, `→${destIP}`, { fontSize: '9px', color: '#ffffff', backgroundColor: '#00000088' }).setDepth(51);
        this.scene.tweens.add({ targets: [pkt, lbl], x: width - 100, duration: 800, ease: 'Linear', onComplete: () => { pkt.destroy(); lbl.destroy(); } });
    }
}
