import type {Lif} from './lif.ts';
import type {Neurons} from './neurons.ts';
import {concat, times} from './util.ts';

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
	senseEveryMs?: number; // default 10
}

export function defaultOutputs(neurons: Neurons): Uint32Array {
	return concat(
		['vnc_motor', 'cb_motor', 'descending_neuron'].map(superclass => neurons.find({superclass})),
	);
}

/** Run the brain for `ms` of simulated time, calling `world.sense` and `world.act` as it goes. */
export function runWorld(brain: Lif, neurons: Neurons, world: World, opts: RunOptions): void {
	const outputs = new Set((world.outputs ?? defaultOutputs)(neurons));
	const steps = Math.round(opts.ms / brain.p.dtMs);
	const senseSteps = Math.max(1, Math.round((opts.senseEveryMs ?? 10) / brain.p.dtMs));
	times(steps, k => {
		if (k % senseSteps === 0) world.sense(brain.timeMs, brain, neurons);
		const fired = brain.tick().filter(i => outputs.has(i));
		if (fired.length > 0) world.act(brain.timeMs, fired, brain, neurons);
	});
}
