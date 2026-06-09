// PROTOCOL: DASH Adaptive Bitrate Algorithm (ABR)
export class AdaptiveAlgorithm {
    constructor() {
        this.QUALITY_TIERS = {
            '360p':  { bw: 0.36, color: 0xE24B4A },
            '720p':  { bw: 0.72, color: 0xEF9F27 },
            '1080p': { bw: 1.08, color: 0x1D9E75 },
        };
        this.TIER_ORDER = ['360p', '720p', '1080p'];
        this.currentQuality = '360p';
        this.lastBw = 0.36;
        this.lastDecision = '';
        this.congestionActive = false;
    }
    // PROTOCOL: DASH ABR piecewise buffer-based adaptation formula
    computeNextQuality(bufferRatio) {
        const bwPrev = this.lastBw;
        let maxBw, formula;
        if (this.congestionActive) {
            maxBw = bwPrev * 0.20;
            formula = `STORM: ${bwPrev.toFixed(2)}×0.20=${maxBw.toFixed(2)}`;
        } else if (bufferRatio < 0.15) {
            maxBw = bwPrev * 0.3;
            formula = `${bwPrev.toFixed(2)}×0.3=${maxBw.toFixed(2)}`;
        } else if (bufferRatio < 0.35) {
            maxBw = bwPrev * 0.5;
            formula = `${bwPrev.toFixed(2)}×0.5=${maxBw.toFixed(2)}`;
        } else if (bufferRatio < 0.50) {
            maxBw = bwPrev * 1.0;
            formula = `${bwPrev.toFixed(2)}×1.0=${maxBw.toFixed(2)}`;
        } else {
            const m = 1 + 0.5 * bufferRatio;
            maxBw = bwPrev * m;
            formula = `${bwPrev.toFixed(2)}×(1+0.5×${bufferRatio.toFixed(2)})=${maxBw.toFixed(2)}`;
        }
        let chosen = '360p';
        for (const tier of this.TIER_ORDER) {
            if (this.QUALITY_TIERS[tier].bw <= maxBw) chosen = tier;
        }
        const bufPct = Math.round(bufferRatio * 100);
        this.lastDecision = `Buf:${bufPct}% → ${formula} → ${chosen}`;
        this.currentQuality = chosen;
        this.lastBw = this.QUALITY_TIERS[chosen].bw;
        console.log(`[DASH] ABR | buf=${bufPct}% | ${formula} | quality=${chosen}`);
        return chosen;
    }
    fastForward() {
        this.currentQuality = '360p'; this.lastBw = 0.36;
        this.lastDecision = 'FAST-FWD: forced 360p';
        console.log('[DASH] Fast-forward — forced 360p x3 segments');
    }
    setCongestion(active) {
        this.congestionActive = active;
        console.log(`[DASH] Congestion storm: ${active ? 'STARTED' : 'CLEARED'}`);
    }
    getQualityColor(tier) { return this.QUALITY_TIERS[tier]?.color ?? 0x888888; }
}
