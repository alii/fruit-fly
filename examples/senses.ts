/**
 * Lists every sense channel, then drives a selection of senses one at a time for
 * 150 ms and reports which descending and motor neuron types fired most.
 */
import {openBrain, runWorld, senses, defaultOutputs, type Sense, type World} from '../src/index.ts';

const {brain, neurons} = await openBrain(new URL('../data', import.meta.url).pathname);
const s = senses(neurons);

console.log('channels:');
s.channels.forEach(c => console.log(`  ${c.name.padEnd(32)} ${c.neurons.length}`));

const outputs = defaultOutputs(neurons);
const t = neurons.table;
const probes: readonly Sense[] = [
	s.smell,
	s.taste.labellum,
	s.taste.leg,
	s.hear,
	s.antenna.L.wind_gravity,
	s.antenna.R.wind_gravity,
	s.temperature,
	s.humidity,
	s.head.eyes,
	s.leg.front.L.touch,
	s.leg.hind.R.touch,
	s.leg.middle.L.joint,
	s.leg.front.R.load,
	s.neck,
	s.wing.L.touch,
	s.wing.R.strain,
	s.haltere.L,
	s.haltere.R,
	s.back,
	s.abdomen,
	s.ocelli,
];

/** spike counts of output neurons by type, after driving `sense` alone */
function reflex(sense: Sense): ReadonlyMap<string, number> {
	brain.reset();
	const byType = new Map<string, number>();
	const world: World = {
		outputs: () => outputs,
		sense: (_t, b) => sense.set(b, 0.5),
		act: (_t, spikes) =>
			spikes.forEach(i => byType.set(t.type[i]!, (byType.get(t.type[i]!) ?? 0) + 1)),
	};
	runWorld(brain, neurons, world, {ms: 150});
	return byType;
}

console.log('\nreflexes (150 ms at level 0.5):');
probes.forEach(sense => {
	const top = [...reflex(sense)]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 4)
		.map(([k, v]) => `${k}:${v}`)
		.join('  ');
	console.log(
		`  ${sense.path.padEnd(24)} ${String(sense.neurons.length).padStart(5)} cells -> ${top || '(no output spikes)'}`,
	);
});
