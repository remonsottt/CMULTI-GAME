// PROTOCOL: RTP Jitter and Packet Loss Simulation
export class PacketPhysics {
    constructor() {
        this.maxJitter = 200;
        this.lossRate  = 0.10; // PROTOCOL: UDP 10% packet loss
        this.packetsTotal = 0;
        this.packetsLost  = 0;
        this.currentJitter = 0;
        this.MAX_ACCEPTABLE_DELAY = 150; // PROTOCOL: RTP discard threshold
    }
    // PROTOCOL: RTP Jitter Dij = (Rj - Ri) - (Sj - Si)
    computeJitter(sendDelta, receiveDelta) {
        const dij = receiveDelta - sendDelta;
        this.currentJitter = Math.abs(dij);
        return dij;
    }
    simulatePacketArrival() {
        this.packetsTotal++;
        if (Math.random() < this.lossRate) {
            this.packetsLost++;
            console.log(`[RTP] Packet LOST (${this.packetsLost}/${this.packetsTotal})`);
            return { arrived: false, delay: 0 };
        }
        const delay = Math.random() * this.maxJitter;
        const jitter = Math.abs(this.computeJitter(33, 33 + (Math.random() * 40 - 20)));
        if (delay > this.MAX_ACCEPTABLE_DELAY) {
            console.log(`[RTP] Packet DISCARDED — ${delay.toFixed(0)}ms > 150ms`);
            return { arrived: false, delay, tooLate: true };
        }
        return { arrived: true, delay, jitter };
    }
    platformJitter() { return Math.random() * this.maxJitter; }
    isPlatformLost() { return Math.random() < this.lossRate; }
    getLossPercent() {
        if (this.packetsTotal === 0) return 0;
        return ((this.packetsLost / this.packetsTotal) * 100).toFixed(1);
    }
    getLossFraction() {
        if (this.packetsTotal === 0) return 0;
        return this.packetsLost / this.packetsTotal;
    }
    buildRTCPReport() {
        const fractionLost = this.getLossFraction();
        console.log(`[RTCP] RR | fraction_lost=${(fractionLost*100).toFixed(1)}% | jitter=${this.currentJitter.toFixed(0)}ms`);
        return { fractionLost, totalLost: this.packetsLost, jitter: this.currentJitter };
    }
}
