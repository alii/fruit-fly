/**
 * Lists every sense channel, then drives each top-level sense on its own for 150 ms
 * and reports which descending and motor neuron types fired most.
 */
import { openBrain, runWorld, Senses, defaultOutputs, type World } from "../src/index.ts";

const { brain, neurons } = await openBrain(new URL("../../../data", import.meta.url).pathname);
const senses = new Senses(neurons);

console.log("channels:");
for (const { name, count } of senses.list()) console.log(`  ${name.padEnd(32)} ${count}`);

const outputs = defaultOutputs(neurons);
const outSet = new Set(outputs);
const t = neurons.table;
const probes = [
  "smell", "taste/labellum", "taste/leg", "hear", "antenna/L/wind_gravity", "antenna/R/wind_gravity",
  "temperature", "humidity", "head/eyes", "leg/front/L/touch", "leg/hind/R/touch", "leg/middle/L/joint",
  "leg/front/R/load", "neck", "wing/L/touch", "wing/R/strain", "haltere/L", "haltere/R", "back", "abdomen", "ocelli",
];
console.log("\nreflexes (150 ms at level 0.5):");
for (const name of probes) {
  brain.reset();
  const byType = new Map<string, number>();
  const world: World = {
    outputs: () => outputs,
    sense(_t, b) { senses.set(b, name, 0.5); },
    act(_t, spikes) { for (const i of spikes) if (outSet.has(i)) byType.set(t.type[i]!, (byType.get(t.type[i]!) ?? 0) + 1); },
  };
  runWorld(brain, neurons, world, { ms: 150 });
  const n = senses.match(name).reduce((a, c) => a + c.neurons.length, 0);
  const top = [...byType].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}:${v}`).join("  ");
  console.log(`  ${name.padEnd(24)} ${String(n).padStart(5)} cells -> ${top || "(no output spikes)"}`);
}
