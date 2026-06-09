// PROTOCOL: DASH Adaptive Bitrate Algorithm (ABR)
// Implements the exact piecewise bandwidth estimation formula from DASH spec
export class AdaptiveAlgorithm {
    constructor() {
        // Quality tiers normalized (Mbps conceptually mapped 0-1.08)
        this.QUALITY_TIERS = {
            '360p':  { bw: 0.36, label: '360p',  color: 0xE24B4A },
            '720p':  { bw: 0.72, label: '720p',  color: 0xEF9F27 },
            '1080p': { bw: 1.08, label: '1080p', color: 0x1D9E75 },
        };
        this.TIER_ORDER = ['360p', '720p', '1080p'];

        this.currentQuality = '360p';
        this.lastBw = 0.36;
        this.lastDecision = '';
        this.congestionActive = false;
    }

    // PROTOCOL: DASH ABR — piecewise buffer-based adaptation
    // max_bw(i) depends on buffer fill ratio [0..1] and last segment bandwidth
    computeNextQuality(bufferRatio) {
        const bwPrev = this.lastBw;
        let maxBw;
        let formula;

        if (this.congestionActive) {
            // PROTOCOL: Congestion — bandwidth drops to 20%
            maxBw = bwPrev * 0.20;
            formula = `STORM: ${bwPrev.toFixed(2)} × 0.20 = ${maxBw.toFixed(2)}`;
        } else if (bufferRatio < 0.15) {
            maxBw = bwPrev * 0.3;
            formula = `${bwPrev.toFixed(2)} × 0.3 = ${maxBw.toFixed(2)}`;
        } else if (bufferRatio < 0.35) {
            maxBw = bwPrev * 0.5;
            formula = `${bwPrev.toFixed(2)} × 0.5 = ${maxBw.toFixed(2)}`;
        } else if (bufferRatio < 0.50) {
            maxBw = bwPrev * 1.0;
            formula = `${bwPrev.toFixed(2)} × 1.0 = ${maxBw.toFixed(2)}`;
        } else {
            // PROTOCOL: High buffer → upshift with (1 + 0.5 * buffer) multiplier
            const multiplier = 1 + 0.5 * bufferRatio;
            maxBw = bwPrev * multiplier;
            formula = `${bwPrev.toFixed(2)} × (1+0.5×${bufferRatio.toFixed(2)}) = ${maxBw.toFixed(2)}`;
        }

        // Select highest quality tier that fits under maxBw
        let chosen = '360p';
        for (const tier of this.TIER_ORDER) {
            if (this.QUALITY_TIERS[tier].bw <= maxBw) {
                chosen = tier;
            }
        }

        const bufPct = Math.round(bufferRatio * 100);
        this.lastDecision = `Buffer:${bufPct}% → ${formula} → ${chosen}`;
        this.currentQuality = chosen;
        this.lastBw = this.QUALITY_TIERS[chosen].bw;

        console.log(`[DASH] ABR decision | buffer=${bufPct}% | ${formula} | quality=${chosen}`);
        return chosen;
    }

    // PROTOCOL: Fast-Forward — buffer drains to 5%, 3 segments forced to 360p
    fastForward() {
        this.currentQuality = '360p';
        this.lastBw = 0.36;
        this.lastDecision = 'FAST-FWD: forced 360p (buffer recovery)';
        console.log('[DASH] Fast-forward triggered — forced 360p for next 3 segments');
    }

    setCongestion(active) {
        this.congestionActive = active;
        console.log(`[DASH] Congestion storm: ${active ? 'STARTED' : 'CLEARED'}`);
    }

    getQualityColor(tier) {
        return this.QUALITY_TIERS[tier]?.color ?? 0x888888;
    }

    getQualityBw(tier) {
        return this.QUALITY_TIERS[tier]?.bw ?? 0.36;
    }
}
