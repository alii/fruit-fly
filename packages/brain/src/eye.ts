import type { Lif } from "./lif.ts";
import type { Neurons } from "./neurons.ts";

/** A grayscale image. `data` is row-major, values 0..1 or 0..255. */
export interface Frame {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface EyeOptions {
  /** peak firing rate for a pixel that just went fully on or off. default 300 */
  maxHz?: number;
  /** peak firing rate of the steady luminance cells. default 20 */
  steadyHz?: number;
  /** how long an on/off response lasts after the change, ms. default 100 */
  tauMs?: number;
  /** which lamina cell types get luminance increase, decrease, and steady luminance */
  onTypes?: string[];
  offTypes?: string[];
  steadyTypes?: string[];
}

interface Column {
  hex1: number;
  hex2: number;
  u: number;
  v: number;
  on: number[];
  off: number[];
  steady: number[];
}

/**
 * One compound eye. Maps a frame onto the optic lobe's hex grid of about 880 columns
 * and drives the lamina cells in each column. Each column has a position u,v in 0..1.
 * L1 is driven by luminance increases, L2 by decreases, L3 by luminance.
 */
export class Eye {
  readonly columns: Column[] = [];
  private prev: Float32Array;
  private on: Float32Array; // decaying on/off response per column
  private off: Float32Array;
  private lastT = 0;
  readonly maxHz: number;
  readonly steadyHz: number;
  readonly tauMs: number;

  constructor(
    readonly neurons: Neurons,
    readonly side: "L" | "R",
    opts: EyeOptions = {},
  ) {
    this.maxHz = opts.maxHz ?? 300;
    this.steadyHz = opts.steadyHz ?? 20;
    this.tauMs = opts.tauMs ?? 100;
    const on = new Set(opts.onTypes ?? ["L1"]);
    const off = new Set(opts.offTypes ?? ["L2"]);
    const steady = new Set(opts.steadyTypes ?? ["L3"]);
    const t = neurons.table;
    const byKey = new Map<number, Column>();
    for (let i = 0; i < neurons.size; i++) {
      const h1 = t.hex1[i],
        h2 = t.hex2[i],
        ty = t.type[i];
      if (h1 == null || h2 == null || ty == null || t.side[i] !== side)
        continue;
      const which = on.has(ty)
        ? "on"
        : off.has(ty)
          ? "off"
          : steady.has(ty)
            ? "steady"
            : null;
      if (!which) continue;
      const key = h1 * 64 + h2;
      let c = byKey.get(key);
      if (!c) {
        c = { hex1: h1, hex2: h2, u: 0, v: 0, on: [], off: [], steady: [] };
        byKey.set(key, c);
        this.columns.push(c);
      }
      c[which].push(i);
    }
    // the hex grid is skewed: each row of hex2 shifts hex1 by half a step. undo that,
    // then normalise to 0..1 so u,v index into an ordinary image.
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const c of this.columns) {
      const x = c.hex1 - c.hex2 / 2,
        y = c.hex2;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (const c of this.columns) {
      c.u = (c.hex1 - c.hex2 / 2 - minX) / (maxX - minX);
      c.v = (c.hex2 - minY) / (maxY - minY);
    }
    this.prev = new Float32Array(this.columns.length);
    this.on = new Float32Array(this.columns.length);
    this.off = new Float32Array(this.columns.length);
  }

  /** Sample a frame at each column's position. Returns per-column luminance 0..1. */
  sample(frame: Frame): Float32Array {
    const out = new Float32Array(this.columns.length);
    const scale = maxOf(frame.data) > 1 ? 1 / 255 : 1;
    for (let k = 0; k < this.columns.length; k++) {
      const c = this.columns[k]!;
      const x = Math.min(frame.width - 1, Math.floor(c.u * frame.width));
      const y = Math.min(frame.height - 1, Math.floor(c.v * frame.height));
      out[k] = frame.data[y * frame.width + x]! * scale;
    }
    return out;
  }

  /**
   * Show the eye a frame. Sets drives on the lamina cells. Call from World.sense.
   * A change in a pixel starts a response that decays over `tauMs`.
   */
  see(brain: Lif, frame: Frame) {
    const t = brain.timeMs;
    const decay = Math.exp(-(t - this.lastT) / this.tauMs);
    this.lastT = t;
    const lum = this.sample(frame);
    for (let k = 0; k < this.columns.length; k++) {
      const c = this.columns[k]!;
      const l = lum[k]!,
        d = l - this.prev[k]!;
      const on = Math.max(this.on[k]! * decay, d),
        off = Math.max(this.off[k]! * decay, -d);
      this.on[k] = on;
      this.off[k] = off;
      brain.setDrive(c.on, this.maxHz * on);
      brain.setDrive(c.off, this.maxHz * off);
      brain.setDrive(c.steady, this.steadyHz * l);
    }
    this.prev = lum;
  }

  /** Stop driving this eye. */
  dark(brain: Lif) {
    for (const c of this.columns) {
      brain.setDrive(c.on, 0);
      brain.setDrive(c.off, 0);
      brain.setDrive(c.steady, 0);
    }
    this.prev.fill(0);
    this.on.fill(0);
    this.off.fill(0);
  }
}

function maxOf(a: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) if (a[i]! > m) m = a[i]!;
  return m;
}
