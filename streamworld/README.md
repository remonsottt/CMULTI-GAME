# StreamWorld — Survive the network

An educational browser game where you ARE a data packet traveling through a network.
All game mechanics are real protocol concepts from HTTP Streaming (DASH), RTP, IGMP, and IPTV.

## How to run

```bash
cd streamworld
python3 -m http.server 8080
```

Open **http://localhost:8080** in Chrome. No npm, no build step, no dependencies to install.

## Zones

### Zone 1 — DASH Land (side-scrolling platformer)
- Collect the **MPD Scroll** to reveal platforms ahead
- Platform colors = quality tier: **Teal=1080p**, **Amber=720p**, **Red=360p**
- **Buffer bar** (top): 7 segments — drains as you move, refills as you download
- Buffer hits 0 → **FREEZE** for 2 seconds (max 3 allowed)
- **Congestion Storm** every 20s: bandwidth drops to 20%, buffer drains 2× faster
- Press **F** to Fast-Forward 5 segments (buffer drains to 5%, forced 360p recovery)
- **ABR formula** runs every segment: `max_bw = bw_prev × f(buffer_ratio)`

### Zone 2 — RTP Land (real-time arcade)
- No buffer — **Jitter meter** instead (delay variance between packets)
- Platforms appear with random jitter delay (0–200ms); >150ms → discarded
- **10% packet loss** → platforms simply don't appear (UDP — no retry)
- Press **1/2/3** to switch IGMP channels (Canal+, La1, HBO)
  - Full IGMP flow: Leave Group → Group-Specific Query → Membership Report → 1s lag
- **RTCP Receiver Report** sent every 5 seconds (animated packet)
- **MPEG2-TS PIDs**: collect coins labeled with PIDs — right program = +10pts, wrong = -5pts
- **Sync byte 0x47** checkpoints every 188px — miss 3 in a row → desync + respawn

## Controls

| Key | DASH Land | RTP Land |
|-----|-----------|----------|
| ← → | Move | Move |
| SPACE | Jump | Jump |
| F | Fast-forward | — |
| 1 / 2 / 3 | — | Switch IGMP channel |
| ESC | Return to menu | Return to menu |

## Protocol concepts implemented

| Concept | Implementation |
|---------|----------------|
| MPD Manifest | Scroll item — must collect before platforms visible |
| DASH ABR formula | Exact piecewise: `bw × f(buffer)` in AdaptiveAlgorithm.js |
| Buffer stall | Freeze mechanic (2s), max 3 allowed |
| Congestion | Storm event — bw × 0.20, drain × 2 |
| Fast-forward | Seek — drain buffer to 5%, 360p recovery |
| RTP jitter | `Dij = (Rj-Ri) - (Sj-Si)`, per-platform delay |
| UDP packet loss | 10% platforms never appear, no retry |
| IGMP Leave Group | Sent to 224.0.0.2 (all-routers) on channel switch |
| IGMP Group Query | Router confirms no other listeners |
| IGMP Report | Sent to new multicast group IP with TTL=1 |
| RTCP RR | fraction_lost + jitter sent every 5s, server adapts |
| MPEG2-TS PIDs | PID coins — PMT table defines valid program PIDs |
| MPEG2-TS sync | 0x47 checkpoints every 188px; desync on 3 misses |

## Project structure

```
streamworld/
  index.html                   ← Phaser CDN + entry point
  src/
    main.js                    ← Phaser config, scene list
    scenes/
      MenuScene.js             ← Title screen, zone selector, protocol table
      DASHScene.js             ← Zone 1 gameplay
      RTPScene.js              ← Zone 2 gameplay
      HUDScene.js              ← Overlay HUD (always on top)
    utils/
      AdaptiveAlgorithm.js     ← Exact DASH ABR formula
      IGMPManager.js           ← IGMP join/leave/query with TTL=1
      PacketPhysics.js         ← Jitter + packet loss simulation
```
