import type { Graph } from "./format.ts";

/** Leaky integrate-and-fire. Defaults are Shiu et al. 2024 (Nature). */
export interface LifParams {
  dtMs: number; // simulation step
  vRest: number; // mV
  vReset: number; // mV
  vThresh: number; // mV
  tauMembraneMs: number;
  tauSynapseMs: number;
  refractoryMs: number;
  delayMs: number; // axonal/synaptic delay
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
  private readonly refractoryUntil: Int32Array;
  private readonly spikeCount: Uint32Array;
  private readonly delaySteps: number;
  private readonly refractorySteps: number;
  private readonly decayG: number;
  private readonly kM: number;
  private readonly ring: number[][]; // spikes waiting for delivery, indexed by step
  private readonly drive = new Map<number, number>(); // neuron -> firing probability per step
  private step = 0;
  /** neurons that fired in the last tick() */
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
    this.decayG = Math.exp(-this.p.dtMs / this.p.tauSynapseMs);
    this.kM = this.p.dtMs / this.p.tauMembraneMs;
    this.ring = Array.from({ length: this.delaySteps + 1 }, () => []);
  }

  get timeMs(): number {
    return this.step * this.p.dtMs;
  }
  /** spikes per neuron since construction or the last reset */
  get counts(): Uint32Array {
    return this.spikeCount;
  }

  /** Force neurons to fire as a Poisson process at `hz`. 0 removes the drive. */
  setDrive(neurons: ArrayLike<number>, hz: number): void {
    const prob = (hz * this.p.dtMs) / 1000;
    for (let k = 0; k < neurons.length; k++) {
      const i = neurons[k]!;
      if (prob <= 0) this.drive.delete(i);
      else this.drive.set(i, prob);
    }
  }
  clearDrive(): void {
    this.drive.clear();
  }

  /** Zero every synapse out of these neurons. Not reversible on this instance. */
  silence(neurons: ArrayLike<number>): void {
    const { rowPtr, w } = this.graph;
    for (let k = 0; k < neurons.length; k++) {
      const i = neurons[k]!;
      w.fill(0, rowPtr[i]!, rowPtr[i + 1]!);
    }
  }

  /** Advance one dt. Returns the neurons that fired. */
  tick(): Uint32Array {
    this.deliver();
    const fired: number[] = [];
    this.integrate(fired);
    this.applyDrive(fired);
    this.schedule(fired);
    this.step++;
    this.spikes = Uint32Array.from(fired);
    return this.spikes;
  }

  /** Add the synaptic weight of every spike due now to its targets. */
  private deliver(): void {
    const { rowPtr, col, w } = this.graph;
    const g = this.g;
    const arriving = this.ring[this.step % this.ring.length]!;
    for (let a = 0; a < arriving.length; a++) {
      const pre = arriving[a]!;
      const end = rowPtr[pre + 1]!;
      for (let e = rowPtr[pre]!; e < end; e++) g[col[e]!]! += w[e]!;
    }
    arriving.length = 0;
  }

  /** Decay g, move v, fire neurons over threshold. */
  private integrate(fired: number[]): void {
    const { v, g, refractoryUntil, decayG, kM, step } = this;
    const { vRest, vThresh } = this.p;
    for (let i = 0; i < this.graph.n; i++) {
      if (step < refractoryUntil[i]!) continue;
      const gi = g[i]! * decayG;
      const vi = v[i]! + kM * (vRest - v[i]! + gi);
      if (vi > vThresh) {
        this.fire(i, fired);
      } else {
        v[i] = vi;
        g[i] = gi;
      }
    }
  }

  /** Poisson spikes for externally driven neurons. */
  private applyDrive(fired: number[]): void {
    for (const [i, prob] of this.drive)
      if (Math.random() < prob) this.fire(i, fired);
  }

  private fire(i: number, fired: number[]): void {
    fired.push(i);
    this.v[i] = this.p.vReset;
    this.g[i] = 0;
    this.refractoryUntil[i] = this.step + this.refractorySteps;
  }

  /** Queue this step's spikes for delivery after the synaptic delay. */
  private schedule(fired: readonly number[]): void {
    const slot = this.ring[(this.step + this.delaySteps) % this.ring.length]!;
    for (let k = 0; k < fired.length; k++) {
      slot.push(fired[k]!);
      this.spikeCount[fired[k]!]!++;
    }
  }

  /** Run for `ms`, calling `onSpikes` after each tick that had spikes. */
  run(ms: number, onSpikes?: (t: number, spikes: Uint32Array) => void): void {
    const steps = Math.round(ms / this.p.dtMs);
    for (let k = 0; k < steps; k++) {
      const sp = this.tick();
      if (onSpikes && sp.length) onSpikes(this.timeMs, sp);
    }
  }

  /** Return every neuron to rest, drop pending spikes and drives, zero the counts. Time keeps running. */
  reset(): void {
    this.v.fill(this.p.vRest);
    this.g.fill(0);
    this.refractoryUntil.fill(-1);
    for (const r of this.ring) r.length = 0;
    this.drive.clear();
    this.spikeCount.fill(0);
    this.spikes = new Uint32Array(0);
  }

  resetCounts(): void {
    this.spikeCount.fill(0);
  }
}
