/**
 * Drives the LC4 and LPLC2 looming detectors directly and reports spikes of the
 * giant fiber (DNp01), the descending neuron for the escape jump.
 */
import { openBrain, runWorld, type World } from "../src/index.ts";

const { brain, neurons } = await openBrain(
  new URL("../../../data", import.meta.url).pathname,
);
console.log(`neurons: ${brain.graph.n}  synapses: ${brain.graph.e}`);

const lc4 = neurons.find({ type: "LC4" });
const lplc2 = neurons.find({ type: "LPLC2" });
const gf = neurons.find({ type: "DNp01" });
console.log(`LC4: ${lc4.length}  LPLC2: ${lplc2.length}  GF: ${gf.length}`);

const gfSet = new Set(gf);
const world: World = {
  outputs: () => gf,
  sense(t, b) {
    const on = t >= 100 && t < 300;
    b.setDrive(lc4, on ? 100 : 0);
    b.setDrive(lplc2, on ? 100 : 0);
  },
  act(t, spikes, _b, n) {
    for (const i of spikes)
      if (gfSet.has(i))
        console.log(`t=${t.toFixed(1)}ms  ${n.describe(i)} FIRED`);
  },
};

const t0 = performance.now();
runWorld(brain, neurons, world, { ms: 400 });
const dt = performance.now() - t0;
console.log(`sim 400 ms in ${dt.toFixed(0)} ms wall`);

const top = [...brain.counts]
  .map((c, i) => [c, i] as const)
  .filter((x) => x[0] > 0)
  .sort((a, b) => b[0] - a[0])
  .slice(0, 15);
console.log("top firing neurons:");
for (const [c, i] of top)
  console.log(`  ${String(c).padStart(4)}  ${neurons.describe(i)}`);
