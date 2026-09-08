/**
 * Drives the LC4 and LPLC2 looming detectors directly and reports spikes of the
 * giant fiber (DNp01), the descending neuron for the escape jump.
 */
import {openBrain, runWorld, type World} from '../src/index.ts';

const {brain, neurons} = await openBrain(new URL('../../../data', import.meta.url).pathname);
console.log(`neurons: ${brain.graph.n}  synapses: ${brain.graph.e}`);

const lc4 = neurons.find({type: 'LC4'});
const lplc2 = neurons.find({type: 'LPLC2'});
const gf = neurons.find({type: 'DNp01'});
console.log(`LC4: ${lc4.length}  LPLC2: ${lplc2.length}  GF: ${gf.length}`);

const world: World = {
	outputs: () => gf,
	sense(t, b) {
		// looming stimulus between 100 ms and 300 ms
		const hz = t >= 100 && t < 300 ? 100 : 0;
		b.setDrive(lc4, hz);
		b.setDrive(lplc2, hz);
	},
	act(t, spikes, _b, n) {
		spikes.forEach(i => console.log(`t=${t.toFixed(1)}ms  ${n.describe(i)} FIRED`));
	},
};

const t0 = performance.now();
runWorld(brain, neurons, world, {ms: 400});
console.log(`sim 400 ms in ${(performance.now() - t0).toFixed(0)} ms wall`);

const top = Array.from(brain.counts, (c, i) => [c, i] as const)
	.filter(([c]) => c > 0)
	.sort((a, b) => b[0] - a[0])
	.slice(0, 15);
console.log('top firing neurons:');
top.forEach(([c, i]) => console.log(`  ${String(c).padStart(4)}  ${neurons.describe(i)}`));
