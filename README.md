# fly

Run a fruit fly brain in TypeScript.

The neurons and connections come from the [Janelia male CNS connectome](https://male-cns.janelia.org/), which maps every neuron in one fly. You give input to the sensory neurons and get spikes out of the motor neurons.

```ts
import {openBrain, runWorld, type World} from 'flybrain';

const {brain, neurons} = await openBrain('data');

const world: World = {
	outputs: n => n.find({superclass: 'vnc_motor'}),
	sense(t, brain, n) {
		brain.setDrive(n.find({class: 'gustatory'}), t < 200 ? 50 : 0);
	},
	act(t, spikes, _b, n) {
		for (const i of spikes) console.log(t, n.describe(i));
	},
};

runWorld(brain, neurons, world, {ms: 500});
```

`sense` is where you set firing rates. `act` runs whenever an output neuron fires. `neurons.find` looks up neurons by `type`, `class`, `side` and so on, using the names from the Janelia annotations.

All times are simulated time, not wall clock time. The brain advances in steps of 0.1 ms, and `runWorld` is a plain loop that runs those steps as fast as it can, then returns. `ms: 500` means 500 ms of simulated time, which is 5000 steps. `sense` is called every 10 ms of simulated time by default, since sensory input rarely changes faster than that, and you can change it with `senseEveryMs`.

The simulated clock exists because the neuron model is built from time constants measured in real flies, such as a 20 ms membrane time constant and a 1.8 ms synaptic delay.

## Vision

`Eye` maps an image onto one compound eye and drives its lamina cells. Each eye is a hex grid of about 880 columns, and each column is one pixel.

```ts
import {Eye} from 'flybrain';

const eye = new Eye(neurons, 'R');

const world: World = {
	sense(t, brain) {
		eye.see(brain, {width: 64, height: 64, data: pixels});
	},
	act(t, spikes, _b, n) {
		/* ... */
	},
};
```

`data` is grayscale, row-major, 0 to 1 or 0 to 255. Any image source works: a canvas, a screenshot, a game framebuffer. The frame is resampled to the eye's grid, so the size doesn't matter much.

A pixel that gets brighter drives the column's L1 cell, one that gets darker drives L2, and L3 follows brightness. A change starts a response that fades over 100 ms. The rates are chosen so that a dark disc growing on the eye fires the giant fiber escape neuron, which happens through LC4 in the real fly too. See `examples/looming.ts`.

The "got brighter" pathway does not get past the lamina in this model. In the real fly it works by releasing cells from inhibition, and a leaky integrate-and-fire neuron with no background activity has nothing to release. Motion detection here comes from the "got darker" pathway only.

## Other senses

`senses` groups every other sensory neuron in the data into a tree. Every node is typed from the data, so the editor completes the names and a wrong one is a compile error.

```ts
import {senses} from 'flybrain';

const s = senses(neurons);

s.smell.DA1.set(brain, 0.8); // one glomerulus
s.leg.front.L.touch.set(brain, 1); // bristles on one leg
s.haltere.set(brain, 0.5); // every channel under a node
s.at('leg/front/L/touch').set(brain, 1); // same thing by path
s.off(brain);

s.channels; // every channel and its neurons
```

Channel names are paths. The top levels are:

| channel                                                                                           | what it is                                                                 |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `smell/<glomerulus>`                                                                              | olfactory receptor neurons, one channel per glomerulus, 50 of them         |
| `taste/labellum`, `taste/pharynx`, `taste/leg/<front,middle,hind>`, `taste/wing`, `taste/abdomen` | taste neurons by body part                                                 |
| `hear`                                                                                            | Johnston's organ sound neurons in the antenna                              |
| `antenna/<side>/wind_gravity`                                                                     | Johnston's organ wind and gravity neurons                                  |
| `antenna/<side>/touch`                                                                            | antenna bristles                                                           |
| `temperature/<glomerulus>`, `humidity/<glomerulus>`                                               | VP2 is hot, VP3 cold, VP4 dry, VP5 moist                                   |
| `head/eyes`, `head/mouth`, `head/other`                                                           | bristles on the head                                                       |
| `leg/<front,middle,hind>/<side>/<touch,joint,load,position>`                                      | bristles, chordotonal organs, campaniform sensilla and hair plates per leg |
| `neck`                                                                                            | prosternal hair plates, which sense head position                          |
| `wing/<side>/<touch,strain>`                                                                      | wing bristles and wing campaniform sensilla                                |
| `haltere/<side>`                                                                                  | haltere sensory neurons                                                    |
| `back`, `abdomen`                                                                                 | bristles and stretch receptors on the thorax and abdomen                   |
| `ocelli/<side>`                                                                                   | second-order neurons of the three small eyes on top of the head            |

Most channels split by side and end in `L` or `R`. `?` is used where the data has no side. The names come from `src/channels.generated.ts`, which `bun run gen:channels` rebuilds from the data.

Balance comes from several of these at once. Halteres report body rotation in flight, the wind and gravity neurons in the antennae report which way is down, the leg load and position channels report where the weight is when standing, and the ocelli see the horizon.

The channels only say which neurons fire together, not what a level means. For taste, the data does not say which neurons are sugar and which are bitter, so `taste/labellum` drives both. For halteres it does not say which neurons respond to which axis of rotation. `examples/senses.ts` drives each sense on its own and prints which motor and descending neurons respond.

## Install

```sh
bun add github:alii/fruit-fly
```

Then download the prebuilt brain, about 65 MB, into a folder of your choice:

```sh
mkdir -p data
curl -L -o data/brain.bin https://github.com/alii/fruit-fly/releases/download/data/brain.bin
curl -L -o data/neurons.json https://github.com/alii/fruit-fly/releases/download/data/neurons.json
```

`openBrain('data')` loads it. The loader uses `Bun.file`, so it needs bun.

## Building from source

Only needed to change the data build. Needs bun and uv.

```sh
git clone https://github.com/alii/fruit-fly && cd fruit-fly && bun install
cd data
for f in body-annotations-male-cns-v1.0-minconf-0.5.feather \
         body-neurotransmitters-male-cns-v1.0.feather \
         connectome-weights-male-cns-v1.0-minconf-0.5.feather; do
  curl -LO "https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/$f"
done
cd ..
bun run build:data
bun run example
```

The download is about 1.2 GB. `build:data` writes `data/brain.bin` and `data/neurons.json` and takes an optional argument for the minimum synapse count per connection (default 5). The example drives the LC4 and LPLC2 looming detectors and prints when the giant fiber fires.

`bun run lint`, `bun run typecheck` and `bun run format:check` check the code. `bun run gen:channels` regenerates the channel name types after a data change.

## Files

| path                      | contents                             |
| ------------------------- | ------------------------------------ |
| `src/world.ts`            | `World` and `runWorld`               |
| `src/lif.ts`              | the simulator                        |
| `src/neurons.ts`          | neuron lookup                        |
| `src/format.ts`           | reads `brain.bin` and `neurons.json` |
| `examples/giant-fiber.ts` | escape reflex example                |
| `scripts/build_brain.py`  | feather files to `brain.bin`         |

## Model details

Neuron parameters follow Shiu et al. 2024: rest and reset -52 mV, threshold -45 mV, membrane time constant 20 ms, synaptic time constant 5 ms, refractory 2.2 ms, delay 1.8 ms, 0.275 mV per synapse. They can be overridden when constructing `Lif`.

A connection's weight is its synapse count times 0.275 mV. It is negative if the presynaptic neuron's consensus transmitter is GABA, glutamate or histamine. Neurons whose transmitter is "unclear" (most of them) are treated as excitatory. Connections with fewer than 5 synapses are dropped; pass a different cutoff as an argument to `build:data`. Only neurons with status "Traced" are included, which is about 165k neurons and 6 million connections.

The sign table and cutoff live in `scripts/build_brain.py`.
