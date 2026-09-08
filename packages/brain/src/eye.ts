import type { Lif } from "./lif.ts";
import type { Neurons } from "./neurons.ts";
import { range } from "./util.ts";

/**
 * A grayscale image, row-major. Values are 0..255 for Uint8Array and
 * Uint8ClampedArray data, 0..1 for anything else.
 */
export interface Frame {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
}

export interface EyeOptions {
  /** peak firing rate for a pixel that just went fully on or off. default 300 */
  maxHz?: number;
  /** peak firing rate of the steady luminance cells. default 20 */
  steadyHz?: number;
  /** how long an on/off response lasts after the change, ms. default 100 */
  tauMs?: number;
  /** which lamina cell types get luminance increase, decrease, and steady luminance */
  onTypes?: readonly string[];
  offTypes?: readonly string[];
  steadyTypes?: readonly string[];
}

/** One column of the optic lobe: a pixel, with its position in 0..1 and its lamina cells. */
export interface Column {
  readonly hex1: number;
  readonly hex2: number;
  readonly u: number;
  readonly v: number;
  readonly on: Uint32Array;
  readonly off: Uint32Array;
  readonly steady: Uint32Array;
}

type Role = "on" | "off" | "steady";

/**
 * One compound eye. Maps a frame onto the optic lobe's hex grid of about 880 columns
 * and drives the lamina cells in each column. Each column has a position u,v in 0..1.
 * L1 is driven by luminance increases, L2 by decreases, L3 by luminance.
 */
export class Eye {
  readonly columns: readonly Column[];
  readonly maxHz: number;
  readonly steadyHz: number;
  readonly tauMs: number;
  private prev: Float32Array;
  private on: Float32Array; // decaying on/off response per column
  private off: Float32Array;
  private lastT = 0;

  constructor(
    readonly neurons: Neurons,
    readonly side: "L" | "R",
    opts: EyeOptions = {},
  ) {
    this.maxHz = opts.maxHz ?? 300;
    this.steadyHz = opts.steadyHz ?? 20;
    this.tauMs = opts.tauMs ?? 100;
    const roles = new Map<string, Role>([
      ...(opts.onTypes ?? ["L1"]).map((t): [string, Role] => [t, "on"]),
      ...(opts.offTypes ?? ["L2"]).map((t): [string, Role] => [t, "off"]),
      ...(opts.steadyTypes ?? ["L3"]).map((t): [string, Role] => [t, "steady"]),
    ]);
    this.columns = buildColumns(neurons, side, roles);
    this.prev = new Float32Array(this.columns.length);
    this.on = new Float32Array(this.columns.length);
    this.off = new Float32Array(this.columns.length);
  }

  /** Sample a frame at each column's position. Returns per-column luminance 0..1. */
  sample(frame: Frame): Float32Array {
    const scale =
      frame.data instanceof Uint8Array ||
      frame.data instanceof Uint8ClampedArray
        ? 1 / 255
        : 1;
    return Float32Array.from(this.columns, (c) => {
      const x = Math.min(frame.width - 1, Math.floor(c.u * frame.width));
      const y = Math.min(frame.height - 1, Math.floor(c.v * frame.height));
      return frame.data[y * frame.width + x]! * scale;
    });
  }

  /**
   * Show the eye a frame. Sets drives on the lamina cells. Call from World.sense.
   * A change in a pixel starts a response that decays over `tauMs`.
   */
  see(brain: Lif, frame: Frame): void {
    const decay = Math.exp(-(brain.timeMs - this.lastT) / this.tauMs);
    this.lastT = brain.timeMs;
    const lum = this.sample(frame);
    this.on = Float32Array.from(lum, (l, k) =>
      Math.max(this.on[k]! * decay, l - this.prev[k]!),
    );
    this.off = Float32Array.from(lum, (l, k) =>
      Math.max(this.off[k]! * decay, this.prev[k]! - l),
    );
    this.prev = lum;
    this.columns.forEach((c, k) => {
      brain.setDrive(c.on, this.maxHz * this.on[k]!);
      brain.setDrive(c.off, this.maxHz * this.off[k]!);
      brain.setDrive(c.steady, this.steadyHz * lum[k]!);
    });
  }

  /** Stop driving this eye. */
  dark(brain: Lif): void {
    this.columns.forEach((c) => {
      brain.setDrive(c.on, 0);
      brain.setDrive(c.off, 0);
      brain.setDrive(c.steady, 0);
    });
    this.prev = new Float32Array(this.columns.length);
    this.on = new Float32Array(this.columns.length);
    this.off = new Float32Array(this.columns.length);
  }
}

interface Cell {
  readonly i: number;
  readonly hex1: number;
  readonly hex2: number;
  readonly role: Role;
}

function buildColumns(
  neurons: Neurons,
  side: "L" | "R",
  roles: ReadonlyMap<string, Role>,
): readonly Column[] {
  const t = neurons.table;
  const cells = Array.from(range(neurons.size))
    .filter(
      (i) =>
        t.side[i] === side &&
        t.hex1[i] !== null &&
        t.hex2[i] !== null &&
        roles.has(t.type[i] ?? ""),
    )
    .map((i): Cell => ({
      i,
      hex1: t.hex1[i]!,
      hex2: t.hex2[i]!,
      role: roles.get(t.type[i]!)!,
    }));
  const grouped = [...Map.groupBy(cells, (c) => c.hex1 * 64 + c.hex2).values()];
  // the hex grid is skewed: each row of hex2 shifts hex1 by half a step. undo that,
  // then normalise to 0..1 so u,v index into an ordinary image.
  const xs = grouped.map((g) => g[0]!.hex1 - g[0]!.hex2 / 2);
  const ys = grouped.map((g) => g[0]!.hex2);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const ids = (g: readonly Cell[], role: Role) =>
    Uint32Array.from(
      g.filter((c) => c.role === role),
      (c) => c.i,
    );
  return grouped.map((g, k): Column => ({
    hex1: g[0]!.hex1,
    hex2: g[0]!.hex2,
    u: (xs[k]! - minX) / (maxX - minX),
    v: (ys[k]! - minY) / (maxY - minY),
    on: ids(g, "on"),
    off: ids(g, "off"),
    steady: ids(g, "steady"),
  }));
}
