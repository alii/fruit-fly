import type { Lif } from "./lif.ts";
import type { Neurons } from "./neurons.ts";

/** Everything outside the brain. Supplies input to sensory neurons and consumes motor output. */
export interface World {
  /** which neurons count as output. default: motor + descending neurons */
  outputs?(neurons: Neurons): Uint32Array;
  /** called every `senseEveryMs`. set drives on sensory neurons here. */
  sense(t: number, brain: Lif, neurons: Neurons): void;
  /** called every tick that any output neuron fired. */
  act(t: number, spikes: Uint32Array, brain: Lif, neurons: Neurons): void;
}

export interface RunOptions {
  ms: number;
  senseEveryMs?: number;
}

export function defaultOutputs(neurons: Neurons): Uint32Array {
  const a = neurons.find({ superclass: "vnc_motor" });
  const b = neurons.find({ superclass: "cb_motor" });
  const c = neurons.find({ superclass: "descending_neuron" });
  const out = new Uint32Array(a.length + b.length + c.length);
  out.set(a, 0);
  out.set(b, a.length);
  out.set(c, a.length + b.length);
  return out;
}

/** Run the brain for `ms` of simulated time, calling `world.sense` and `world.act` as it goes. */
export function runWorld(
  brain: Lif,
  neurons: Neurons,
  world: World,
  opts: RunOptions,
) {
  const senseEvery = opts.senseEveryMs ?? 10;
  const isOutput = new Uint8Array(brain.graph.n);
  for (const i of (world.outputs ?? defaultOutputs)(neurons)) isOutput[i] = 1;
  const steps = Math.round(opts.ms / brain.p.dtMs);
  const senseSteps = Math.max(1, Math.round(senseEvery / brain.p.dtMs));
  for (let k = 0; k < steps; k++) {
    if (k % senseSteps === 0) world.sense(brain.timeMs, brain, neurons);
    const sp = brain.tick();
    if (!sp.length) continue;
    let m = 0;
    for (let j = 0; j < sp.length; j++) if (isOutput[sp[j]!]) m++;
    if (!m) continue;
    const outSp = new Uint32Array(m);
    for (let j = 0, q = 0; j < sp.length; j++)
      if (isOutput[sp[j]!]) outSp[q++] = sp[j]!;
    world.act(brain.timeMs, outSp, brain, neurons);
  }
}
