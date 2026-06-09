// PROTOCOL: IGMP (Internet Group Management Protocol) v2
// Handles multicast group join/leave/query for IPTV channel switching
export class IGMPManager {
    constructor(scene) {
        this.scene = scene;
        // PROTOCOL: IGMP TTL=1 — messages stay on local LAN segment
        this.TTL = 1;
        this.currentGroup = null;
        this.queryPending = false;
        this.log = [];

        // PROTOCOL: IGMP well-known addresses
        this.ALL_ROUTERS = '224.0.0.2';
        this.ALL_HOSTS   = '224.0.0.1';

        this.channels = {
            1: { ip: '224.3.1.1', name: 'Canal+' },
            2: { ip: '224.3.1.2', name: 'La1'    },
            3: { ip: '224.3.1.3', name: 'HBO'    },
        };

        this.onChannelChange = null; // callback(channelNum)
    }

    // PROTOCOL: IGMP Membership Report — join a multicast group
    sendReport(groupIP) {
        const msg = `[IGMP] Report sent to ${groupIP} | TTL=${this.TTL}`;
        console.log(msg);
        this._addLog(`JOIN → ${groupIP} | TTL=${this.TTL}`);
        this._animatePacket(groupIP, 0x378ADD);
    }

    // PROTOCOL: IGMP Leave Group — sent to all-routers (224.0.0.2)
    sendLeave(groupIP) {
        const msg = `[IGMP] Leave Group sent for ${groupIP} → ${this.ALL_ROUTERS} | TTL=${this.TTL}`;
        console.log(msg);
        this._addLog(`LEAVE ${groupIP} → ${this.ALL_ROUTERS}`);
        this._animatePacket(this.ALL_ROUTERS, 0xE24B4A);
    }

    // PROTOCOL: Group-Specific Query — router checks if anyone still watching
    handleQuery(groupIP) {
        const msg = `[IGMP] Group-Specific Query received for ${groupIP} | TTL=${this.TTL}`;
        console.log(msg);
        this._addLog(`QUERY? ${groupIP} from router`);
        this.queryPending = true;

        // After 100ms, send confirmation report (no other listeners)
        if (this.scene && this.scene.time) {
            this.scene.time.delayedCall(100, () => {
                this.queryPending = false;
                this._addLog(`QUERY ACK: no others on ${groupIP}`);
                console.log(`[IGMP] Query response: no other listeners on ${groupIP}`);
            });
        }
    }

    // Full IGMP channel-switch sequence
    switchChannel(newChannelNum) {
        const newChannel = this.channels[newChannelNum];
        if (!newChannel) return;
        if (this.currentGroup === newChannel.ip) return;

        // Step 1: Leave old group
        if (this.currentGroup) {
            this.sendLeave(this.currentGroup);
            // Step 2: Router sends Group-Specific Query
            this.scene.time.delayedCall(200, () => this.handleQuery(this.currentGroup));
        }

        // Step 3: Join new group after ~300ms
        this.scene.time.delayedCall(400, () => {
            this.currentGroup = newChannel.ip;
            this.sendReport(newChannel.ip);
            console.log(`[IGMP] Now receiving multicast from ${newChannel.name} (${newChannel.ip})`);

            // Step 4: New stream starts after ~1s total delay (channel switch lag)
            this.scene.time.delayedCall(600, () => {
                if (this.onChannelChange) this.onChannelChange(newChannelNum);
            });
        });
    }

    getChannelName(num) {
        return this.channels[num]?.name ?? 'Unknown';
    }

    getChannelIP(num) {
        return this.channels[num]?.ip ?? '0.0.0.0';
    }

    _addLog(msg) {
        this.log.push(msg);
        if (this.log.length > 3) this.log.shift();
        // Notify HUD if available
        if (this.scene.events) {
            this.scene.events.emit('igmpLog', this.log.slice());
        }
    }

    _animatePacket(destIP, color) {
        if (!this.scene || !this.scene.add) return;
        // Small animated circle flying across screen to represent IGMP packet
        const { width, height } = this.scene.scale;
        const pkt = this.scene.add.circle(100, height - 60, 8, color, 0.9);
        pkt.setDepth(50);
        const label = this.scene.add.text(100, height - 75, `→${destIP}`, {
            fontSize: '9px', color: '#ffffff', backgroundColor: '#00000088'
        }).setDepth(51);

        this.scene.tweens.add({
            targets: [pkt, label],
            x: width - 100,
            duration: 800,
            ease: 'Linear',
            onComplete: () => { pkt.destroy(); label.destroy(); }
        });
    }
}
