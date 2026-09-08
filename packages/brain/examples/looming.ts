/**
 * A dark disc grows in the middle of the right eye over 300 ms. Reports spikes of
 * the LC4 looming detectors and the giant fiber (DNp01).
 */
import {
  openBrain,
  runWorld,
  Eye,
  type Frame,
  type World,
} from "../src/index.ts";

const { brain, neurons } = await openBrain(
  new URL("../../../data", import.meta.url).pathname,
);
const eye = new Eye(neurons, "R");
console.log(`right eye: ${eye.columns.length} columns`);

const W = 64;
const H = 64;
/** bright background with a dark disc of the given radius in the middle */
const frame = (radius: number): Frame => ({
  width: W,
  height: H,
  data: Float32Array.from({ length: W * H }, (_, p) =>
    ((p % W) - W / 2) ** 2 + (Math.floor(p / W) - H / 2) ** 2 < radius ** 2
      ? 0
      : 1,
  ),
});
/** disc radius at time t: blank, then growing over 300 ms, then held */
const radiusAt = (t: number) =>
  t < 100 ? 0 : t < 400 ? ((t - 100) / 300) * (W / 2) : W / 2;

const watch = {
  LC4: neurons.find({ type: "LC4", side: "R" }),
  LPLC2: neurons.find({ type: "LPLC2", side: "R" }),
  GF: neurons.find({ type: "DNp01" }),
};
const gf = new Set(watch.GF);
const world: World = {
  outputs: () => Uint32Array.from([...watch.LC4, ...watch.LPLC2, ...watch.GF]),
  sense: (t, b) => eye.see(b, frame(radiusAt(t))),
  act: (t, spikes, _b, n) =>
    spikes
      .filter((i) => gf.has(i))
      .forEach((i) =>
        console.log(`t=${t.toFixed(1)}ms  ${n.describe(i)} FIRED`),
      ),
};
runWorld(brain, neurons, world, { ms: 500, senseEveryMs: 5 });

const sum = (ids: Uint32Array) =>
  ids.reduce((acc, i) => acc + brain.counts[i]!, 0);
Object.entries(watch).forEach(([k, ids]) =>
  console.log(`${k.padEnd(6)} ${ids.length} cells, ${sum(ids)} spikes`),
);
console.log(
  "total spikes",
  brain.counts.reduce((a, c) => a + c, 0),
);
