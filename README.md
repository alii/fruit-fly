# fly

Run a fruit fly brain in TypeScript.

The neurons and connections come from the [Janelia male CNS connectome](https://male-cns.janelia.org/), which maps every neuron in one fly. You give input to the sensory neurons and get spikes out of the motor neurons.

```ts
import { openBrain, runWorld, type World } from '@fly/brain';

const { brain, neurons } = await openBrain('data');

const world: World = {
	outputs: n => n.find({ superclass: 'vnc_motor' }),
	sense(t, brain, n) {
		brain.setDrive(n.find({ class: 'gustatory' }), t < 200 ? 50 : 0);
	},
	act(t, spikes, _b, n) {
		for (const i of spikes) console.log(t, n.describe(i));
	},
};

runWorld(brain, neurons, world, { ms: 500 });
```

`sense` is where you set firing rates. `act` runs whenever an output neuron fires. `neurons.find` looks up neurons by `type`, `class`, `side` and so on, using the names from the Janelia annotations.

All times are simulated time, not wall clock time. The brain advances in steps of 0.1 ms, and `runWorld` is a plain loop that runs those steps as fast as it can, then returns. `ms: 500` means 500 ms of simulated time, which is 5000 steps. `sense` is called every 10 ms of simulated time by default, since sensory input rarely changes faster than that, and you can change it with `senseEveryMs`.

The simulated clock exists because the neuron model is built from time constants measured in real flies, such as a 20 ms membrane time constant and a 1.8 ms synaptic delay.

## Setup

You need bun and uv installed.

```sh
cd data
for f in body-annotations-male-cns-v1.0-minconf-0.5.feather \
         body-neurotransmitters-male-cns-v1.0.feather \
         connectome-weights-male-cns-v1.0-minconf-0.5.feather; do
  curl -LO "https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/$f"
done

cd ../packages/brain
bun run build:data
bun run example
```

The download is about 1.2 GB. `build:data` turns it into a compact binary the simulator loads directly. The example drives the LC4 and LPLC2 looming detectors and prints when the giant fiber fires.

## Files

| path                                     | contents                             |
| ---------------------------------------- | ------------------------------------ |
| `packages/brain/src/world.ts`            | `World` and `runWorld`               |
| `packages/brain/src/lif.ts`              | the simulator                        |
| `packages/brain/src/neurons.ts`          | neuron lookup                        |
| `packages/brain/src/format.ts`           | reads `brain.bin` and `neurons.json` |
| `packages/brain/examples/giant-fiber.ts` | escape reflex example                |
| `scripts/build_brain.py`                 | feather files to `brain.bin`         |

## Model details

Neuron parameters follow Shiu et al. 2024: rest and reset -52 mV, threshold -45 mV, membrane time constant 20 ms, synaptic time constant 5 ms, refractory 2.2 ms, delay 1.8 ms, 0.275 mV per synapse. They can be overridden when constructing `Lif`.

A connection's weight is its synapse count times 0.275 mV. It is negative if the presynaptic neuron's consensus transmitter is GABA, glutamate or histamine. Neurons whose transmitter is "unclear" (most of them) are treated as excitatory. Connections with fewer than 5 synapses are dropped; pass a different cutoff as an argument to `build:data`. Only neurons with status "Traced" are included, which is about 165k neurons and 6 million connections.

The sign table and cutoff live in `scripts/build_brain.py`.
