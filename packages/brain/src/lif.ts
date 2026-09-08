import type { Graph } from "./format.ts";

/** Leaky integrate-and-fire. Defaults are Shiu et al. 2024 (Nature). */
export interface LifParams {
  dtMs: number;
  vRest: number;
  vReset: number;
  vThresh: number;
  tauMembraneMs: number;
  tauSynapseMs: number;
  refractoryMs: number;
  delayMs: number;
}

export const SHIU_2024: LifParams = {
  dtMs: 0.1,
  vRest: -52,
  vReset: -52,
  vThresh: -45,
  tauMembraneMs: 20,
  tauSynapseMs: 5,
  refractoryMs: 2.2,
  delayMs: 1.8,
};

/**
 * Whole-brain LIF simulator over a CSR graph.
 *   dv/dt = (vRest - v + g) / tauM
 *   dg/dt = -g / tauS
 * A presynaptic spike adds w (mV) to g of every postsynaptic neuron after `delayMs`.
 */
export class Lif {
  readonly p: LifParams;
  readonly v: Float32Array;
  readonly g: Float32Array;
  private refractoryUntil: Int32Array;
  private step = 0;
  private delaySteps: number;
  private refractorySteps: number;
  private ring: number[][];
  private drive = new Map<number, number>();
  private spikeCount: Uint32Array;
  /** neurons that fired in the last step() */
  spikes: Uint32Array = new Uint32Array(0);

  constructor(
    readonly graph: Graph,
    params: Partial<LifParams> = {},
  ) {
    this.p = { ...SHIU_2024, ...params };
    const n = graph.n;
    this.v = new Float32Array(n).fill(this.p.vRest);
    this.g = new Float32Array(n);
    this.refractoryUntil = new Int32Array(n).fill(-1);
    this.spikeCount = new Uint32Array(n);
    this.delaySteps = Math.max(1, Math.round(this.p.delayMs / this.p.dtMs));
    this.refractorySteps = Math.round(this.p.refractoryMs / this.p.dtMs);
    this.ring = Array.from({ length: this.delaySteps + 1 }, () => []);
  }

  get timeMs() {
    return this.step * this.p.dtMs;
  }
  get counts() {
    return this.spikeCount;
  }

  /** Force neurons to fire as a Poisson process at `hz`. 0 removes the drive. */
  setDrive(neurons: ArrayLike<number>, hz: number) {
    const prob = (hz * this.p.dtMs) / 1000;
    for (let k = 0; k < neurons.length; k++) {
      const i = neurons[k]!;
      if (prob <= 0) this.drive.delete(i);
      else this.drive.set(i, prob);
    }
  }
  clearDrive() {
    this.drive.clear();
  }

  /** Zero every synapse out of these neurons (silencing). Irreversible on this instance. */
  silence(neurons: ArrayLike<number>) {
    const { rowPtr, w } = this.graph;
    for (let k = 0; k < neurons.length; k++) {
      const i = neurons[k]!;
      w.fill(0, rowPtr[i]!, rowPtr[i + 1]!);
    }
  }

  /** Advance one dt. */
  tick(): Uint32Array {
    const { p, v, g, refractoryUntil, graph } = this;
    const n = graph.n;
    const s = this.step;
    const decayG = Math.exp(-p.dtMs / p.tauSynapseMs);
    const kM = p.dtMs / p.tauMembraneMs;

    const slot = s % this.ring.length;
    const arriving = this.ring[slot]!;
    const { rowPtr, col, w } = graph;
    for (let a = 0; a < arriving.length; a++) {
      const pre = arriving[a]!;
      const end = rowPtr[pre + 1]!;
      for (let e = rowPtr[pre]!; e < end; e++) g[col[e]!]! += w[e]!;
    }
    arriving.length = 0;

    const fired: number[] = [];
    for (let i = 0; i < n; i++) {
      if (s < refractoryUntil[i]!) continue;
      const gi = g[i]! * decayG;
      const vi = v[i]! + kM * (p.vRest - v[i]! + gi);
      if (vi > p.vThresh) {
        fired.push(i);
        v[i] = p.vReset;
        g[i] = 0;
        refractoryUntil[i] = s + this.refractorySteps;
      } else {
        v[i] = vi;
        g[i] = gi;
      }
    }

    if (this.drive.size) {
      for (const [i, prob] of this.drive) {
        if (Math.random() < prob) {
          fired.push(i);
          v[i] = p.vReset;
          g[i] = 0;
          refractoryUntil[i] = s + this.refractorySteps;
        }
      }
    }

    const out = this.ring[(s + this.delaySteps) % this.ring.length]!;
    for (let k = 0; k < fired.length; k++) {
      out.push(fired[k]!);
      this.spikeCount[fired[k]!]!++;
    }

    this.step++;
    this.spikes = Uint32Array.from(fired);
    return this.spikes;
  }

  /** Run for `ms`, calling `onSpikes` after each tick that had spikes. */
  run(ms: number, onSpikes?: (t: number, spikes: Uint32Array) => void) {
    const steps = Math.round(ms / this.p.dtMs);
    for (let k = 0; k < steps; k++) {
      const sp = this.tick();
      if (onSpikes && sp.length) onSpikes(this.timeMs, sp);
    }
  }

  resetCounts() {
    this.spikeCount.fill(0);
  }
}
