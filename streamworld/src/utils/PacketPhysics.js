// PROTOCOL: RTP Jitter and Packet Loss Simulation
// Models real network delay variance and UDP unreliability
export class PacketPhysics {
    constructor() {
        // PROTOCOL: Jitter — delay variance between consecutive packets
        this.maxJitter = 200;     // ms — max one-way jitter
        this.lossRate  = 0.10;    // 10% packet loss (UDP — no retransmit)
        this.packetsTotal = 0;
        this.packetsLost  = 0;

        // For Dij formula tracking
        this.lastSendTime    = 0;
        this.lastReceiveTime = 0;
        this.currentJitter   = 0;

        // PROTOCOL: RTP max acceptable one-way delay
        this.MAX_ACCEPTABLE_DELAY = 150; // ms
    }

    // PROTOCOL: RTP Jitter formula — Dij = (Rj - Ri) - (Sj - Si)
    // where R = receive timestamp, S = send timestamp for packets i and j
    computeJitter(sendTimeDelta, receiveTimeDelta) {
        const dij = receiveTimeDelta - sendTimeDelta;
        this.currentJitter = Math.abs(dij);
        console.log(`[RTP] Jitter Dij = (${receiveTimeDelta.toFixed(0)} - ${sendTimeDelta.toFixed(0)}) = ${dij.toFixed(0)}ms`);
        return dij;
    }

    // Simulate packet arrival with random jitter
    // Returns { arrived: bool, delay: number, jitter: number }
    simulatePacketArrival() {
        this.packetsTotal++;

        // PROTOCOL: UDP packet loss — no retransmit, just gone
        if (Math.random() < this.lossRate) {
            this.packetsLost++;
            console.log(`[RTP] Packet LOST (${this.packetsLost}/${this.packetsTotal} = ${this.getLossPercent()}%)`);
            return { arrived: false, delay: 0, jitter: 0 };
        }

        // Random delay between 0 and maxJitter
        const delay = Math.random() * this.maxJitter;
        const sendDelta = 33; // nominal 33ms between packets
        const receiveDelta = sendDelta + (Math.random() * 40 - 20); // slight variance
        const jitter = Math.abs(this.computeJitter(sendDelta, receiveDelta));

        const tooLate = delay > this.MAX_ACCEPTABLE_DELAY;
        if (tooLate) {
            // PROTOCOL: RTP — late packets are discarded, no buffering
            console.log(`[RTP] Packet discarded — arrived ${delay.toFixed(0)}ms late (>${this.MAX_ACCEPTABLE_DELAY}ms threshold)`);
            return { arrived: false, delay, jitter, tooLate: true };
        }

        return { arrived: true, delay, jitter };
    }

    // Generate per-platform jitter offset (ms)
    platformJitter() {
        return Math.random() * this.maxJitter;
    }

    // Determine if a platform is lost
    isPlatformLost() {
        return Math.random() < this.lossRate;
    }

    getLossPercent() {
        if (this.packetsTotal === 0) return 0;
        return ((this.packetsLost / this.packetsTotal) * 100).toFixed(1);
    }

    getLossFraction() {
        if (this.packetsTotal === 0) return 0;
        return this.packetsLost / this.packetsTotal;
    }

    // PROTOCOL: RTCP Receiver Report fields
    buildRTCPReport() {
        const fractionLost = this.getLossFraction();
        const report = {
            fractionLost,
            totalLost: this.packetsLost,
            jitter: this.currentJitter,
            timestamp: Date.now(),
        };
        console.log(`[RTCP] Receiver Report | fraction_lost=${(fractionLost * 100).toFixed(1)}% | jitter=${this.currentJitter.toFixed(0)}ms`);
        return report;
    }

    reset() {
        this.packetsTotal = 0;
        this.packetsLost  = 0;
        this.currentJitter = 0;
    }
}
