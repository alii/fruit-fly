/**
 * A dark disc grows in the middle of the right eye over 300 ms. Reports spikes of
 * the LC4 looming detectors and the giant fiber (DNp01).
 */
import {
  Eye,
  openBrain,
  runWorld,
  type Frame,
  type World,
} from "../src/index.ts";

const { brain, neurons } = await openBrain(
  new URL("../../../data", import.meta.url).pathname,
);
const eye = new Eye(neurons, "R");
console.log(`right eye: ${eye.columns.length} columns`);

const W = 64,
  H = 64;
function frame(radius: number): Frame {
  const data = new Float32Array(W * H).fill(1); // bright background
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if ((x - W / 2) ** 2 + (y - H / 2) ** 2 < radius * radius)
        data[y * W + x] = 0; // dark disc
  return { width: W, height: H, data };
}

const watch = {
  LC4: neurons.find({ type: "LC4", side: "R" }),
  LPLC2: neurons.find({ type: "LPLC2", side: "R" }),
  GF: neurons.find({ type: "DNp01" }),
};
const world: World = {
  outputs: () => Uint32Array.from([...watch.LC4, ...watch.LPLC2, ...watch.GF]),
  sense(t, b) {
    if (t < 100)
      eye.see(b, frame(0)); // blank
    else if (t < 400)
      eye.see(b, frame((((t - 100) / 300) * W) / 2)); // grow to fill the eye
    else eye.see(b, frame(W / 2)); // hold
  },
  act(t, spikes, _b, n) {
    for (const i of spikes)
      if (watch.GF.includes(i))
        console.log(`t=${t.toFixed(1)}ms  ${n.describe(i)} FIRED`);
  },
};
runWorld(brain, neurons, world, { ms: 500, senseEveryMs: 5 });

const counts = brain.counts;
const sum = (ids: Uint32Array) => {
  let s = 0;
  for (const i of ids) s += counts[i]!;
  return s;
};
for (const [k, ids] of Object.entries(watch))
  console.log(`${k.padEnd(6)} ${ids.length} cells, ${sum(ids)} spikes`);
let total = 0;
for (const c of counts) total += c;
console.log("total spikes", total);
