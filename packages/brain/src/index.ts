export { loadGraph, loadNeurons } from "./format.ts";
export type { Graph, NeuronTable } from "./format.ts";
export { Lif, SHIU_2024 } from "./lif.ts";
export type { LifParams } from "./lif.ts";
export { Neurons } from "./neurons.ts";
export type { NeuronQuery } from "./neurons.ts";
export { defaultOutputs, runWorld } from "./world.ts";
export type { RunOptions, World } from "./world.ts";
export { Eye } from "./eye.ts";
export type { Column, Frame, EyeOptions } from "./eye.ts";
export { senses, channelName } from "./senses.ts";
export type {
  Channel,
  Sense,
  SenseInfo,
  SenseActions,
  SenseTree,
  SensePath,
  Senses,
  SensesOptions,
} from "./senses.ts";
export { CHANNEL_NAMES } from "./channels.generated.ts";
export type { ChannelName } from "./channels.generated.ts";

import { loadGraph, loadNeurons } from "./format.ts";
import { Lif, type LifParams } from "./lif.ts";
import { Neurons } from "./neurons.ts";

/** One-call loader. `dir` holds brain.bin + neurons.json. */
export async function openBrain(dir: string, params?: Partial<LifParams>) {
  const [graph, table] = await Promise.all([
    loadGraph(`${dir}/brain.bin`),
    loadNeurons(`${dir}/neurons.json`),
  ]);
  return { brain: new Lif(graph, params), neurons: new Neurons(table), graph };
}
