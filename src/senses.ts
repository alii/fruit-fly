import type {ChannelName} from './channels.generated.ts';
import type {NeuronTable} from './format.ts';
import type {Lif} from './lif.ts';
import type {Neurons} from './neurons.ts';
import {concat, range} from './util.ts';

/** A named group of sensory neurons that are driven together. */
export interface Channel {
	readonly name: ChannelName;
	readonly neurons: Uint32Array;
}

export interface SenseInfo {
	readonly path: string;
	readonly channels: readonly Channel[];
	readonly neurons: Uint32Array;
}
export interface SenseActions {
	/** Drive every neuron under this node at `level * maxHz`. Level 0 stops the drive. */
	readonly set: (brain: Lif, level: number) => void;
	readonly off: (brain: Lif) => void;
}
/** A node in the sense tree. Leaves hold one channel, inner nodes hold every channel below them. */
export type Sense = SenseInfo & SenseActions;

type Head<S extends string> = S extends `${infer H}/${string}` ? H : S;
type Tail<S extends string, H extends string> = S extends `${H}/${infer T}` ? T : never;
type Prefix<S extends string> = S extends `${infer H}/${infer T}` ? H | `${H}/${Prefix<T>}` : never;

/** `Sense` plus one property per child, typed from the channel names in the data. */
export type SenseTree<S extends string = ChannelName> = Sense & {
	readonly [H in Head<S>]: [Tail<S, H>] extends [never] ? Sense : SenseTree<Tail<S, H>>;
};

/** Any channel name or any prefix of one, e.g. "leg", "leg/front", "leg/front/L/touch". */
export type SensePath = ChannelName | Prefix<ChannelName>;

export type Senses = SenseTree & {
	/** The node at a path. Same as walking the tree. */
	at(path: SensePath): Sense;
};

export interface SensesOptions {
	/** firing rate at level 1. default 100 */
	maxHz?: number;
}

/**
 * Every sensory neuron in the data, grouped into a tree of named channels.
 * The eyes are handled separately by `Eye`.
 */
export function senses(neurons: Neurons, opts: SensesOptions = {}): Senses {
	const maxHz = opts.maxHz ?? 100;
	const t = neurons.table;
	const named = range(neurons.size)
		.filter(i => channelName(t, i) !== null)
		.reduce(
			(m, i) =>
				m.set(channelName(t, i) as ChannelName, [
					...(m.get(channelName(t, i) as ChannelName) ?? []),
					i,
				]),
			new Map<ChannelName, number[]>(),
		);
	const channels = [...named]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, ids]): Channel => ({name, neurons: Uint32Array.from(ids)}));
	const root = node('', channels, maxHz);
	const at = (path: SensePath): Sense =>
		path.split('/').reduce<Sense>((n, seg) => (n as unknown as Record<string, Sense>)[seg]!, root);
	return {...root, at} as Senses;
}

function node(path: string, channels: readonly Channel[], maxHz: number): Sense {
	const all = concat(channels.map(c => c.neurons));
	const depth = path === '' ? 0 : path.split('/').length;
	const children = Map.groupBy(
		channels.filter(c => c.name.split('/').length > depth),
		c => c.name.split('/')[depth]!,
	);
	const kids = Object.fromEntries(
		[...children].map(([seg, cs]) => [seg, node(path === '' ? seg : `${path}/${seg}`, cs, maxHz)]),
	);
	return {
		...kids,
		path,
		channels,
		neurons: all,
		set: (brain, level) => brain.setDrive(all, level * maxHz),
		off: brain => brain.setDrive(all, 0),
	};
}

const SENSORY = new Set(['vnc_sensory', 'cb_sensory', 'sensory_ascending']);

const LEG_BY_NERVE: Readonly<Record<string, string>> = {
	ProLN: 'front',
	ProAN: 'front',
	ProCN: 'front',
	DProN: 'front',
	VProN: 'front',
	MesoLN: 'middle',
	MetaLN: 'hind',
};

interface Labels {
	readonly type: string;
	readonly side: string;
	readonly sub: string;
	readonly nerve: string;
	readonly leg: string | undefined;
}

/** Channel name for one neuron, or null if it is not a sensory neuron. */
export function channelName(t: NeuronTable, i: number): string | null {
	const l = labels(t, i);
	if (l.type.startsWith('OCG')) return `ocelli/${l.side}`;
	if (!SENSORY.has(t.superclass[i] ?? '')) return null;
	const namer = BY_CLASS[SUBCLASS_TO_CLASS[l.sub] ?? t.class[i] ?? ''];
	return namer ? namer(l) : unknownSensory(l);
}

function labels(t: NeuronTable, i: number): Labels {
	const nerve = t.nerve[i] ?? '';
	const side = t.side[i];
	return {
		type: t.type[i] ?? '',
		side: side === 'L' || side === 'R' ? side : '?',
		sub: t.subclass[i] ?? '',
		nerve,
		leg: LEG_BY_NERVE[nerve],
	};
}

/** subclasses whose class label is missing or too broad in the data */
const SUBCLASS_TO_CLASS: Readonly<Record<string, string>> = {
	'taste bristle': 'gustatory',
	'mechanosensory bristle': 'mechanosensory_tactile',
};

const stripPrefix = (s: string, prefix: string, fallback: string) =>
	s.startsWith(prefix) ? s.slice(prefix.length) : fallback;

const BY_CLASS: Readonly<Record<string, (l: Labels) => string>> = {
	olfactory: l => `smell/${stripPrefix(l.type, 'ORN_', 'other')}`,
	thermosensory: l => `temperature/${stripPrefix(l.type, 'TRN_', 'other')}`,
	hygrosensory: l => `humidity/${stripPrefix(l.type, 'HRN_', 'other')}`,
	gustatory: taste,
	chemosensory: taste,
	mechanosensory: mechanosensory,
	mechanosensory_proprioceptive: proprioceptive,
	mechanosensory_tactile: tactile,
};

const TASTE_BY_SUBCLASS: Readonly<Record<string, string>> = {
	'labellar bristle': 'labellum',
	'taste peg': 'labellum',
	'pharyngeal sensillum': 'pharynx',
	'wing bristle': 'wing',
	'abdomen': 'abdomen',
};
function taste(l: Labels): string {
	const part = TASTE_BY_SUBCLASS[l.sub] ?? (l.leg ? `leg/${l.leg}` : 'other');
	return `taste/${part}/${l.side}`;
}

const MECHANO_BY_SUBCLASS: Readonly<Record<string, (l: Labels) => string>> = {
	'auditory': l => `hear/${l.side}`,
	'wind_gravity': l => `antenna/${l.side}/wind_gravity`,
	'grooming': l => `antenna/${l.side}/touch`,
	'pharyngeal sensillum': l => `mouth/pharynx/${l.side}`,
};
function mechanosensory(l: Labels): string {
	const bySub = MECHANO_BY_SUBCLASS[l.sub];
	if (bySub) return bySub(l);
	if (l.type.startsWith('JO')) return `antenna/${l.side}/other`;
	if (l.type === 'BM_InOm') return `head/eyes/${l.side}`;
	if (l.type.startsWith('BM_') || l.type.startsWith('TPMN')) return `head/mouth/${l.side}`;
	return `head/other/${l.side}`;
}

const PROPRIO_BY_SUBCLASS: Readonly<Record<string, (l: Labels) => string>> = {
	haltere: l => `haltere/${l.side}`,
	wing: l => `wing/${l.side}/strain`,
	notum: l => `back/${l.side}/position`,
	abdomen: l => `abdomen/${l.side}/stretch`,
	neck: l => `neck/${l.side}`,
};
const PROPRIO_BY_NERVE: Readonly<Record<string, (l: Labels) => string>> = {
	DMetaN: l => `haltere/${l.side}`,
	ADMN: l => `wing/${l.side}/strain`,
	PrN: l => `neck/${l.side}`,
};
const LEG_PROPRIO_BY_SUBCLASS: Readonly<Record<string, string>> = {
	'chordotonal organ': 'joint',
	'campaniform sensilla': 'load',
	'hair plate': 'position',
};
function proprioceptive(l: Labels): string {
	const namer = PROPRIO_BY_SUBCLASS[l.sub] ?? PROPRIO_BY_NERVE[l.nerve];
	if (namer) return namer(l);
	if (l.leg) return `leg/${l.leg}/${l.side}/${LEG_PROPRIO_BY_SUBCLASS[l.sub] ?? 'other'}`;
	return `proprioception/other/${l.side}`;
}

function tactile(l: Labels): string {
	if (l.nerve === 'ADMN') return `wing/${l.side}/touch`;
	if (l.nerve === 'DMetaN') return `haltere/${l.side}`;
	if (l.nerve === 'PDMN' || l.sub === 'notum') return `back/${l.side}/touch`;
	if (l.leg) return `leg/${l.leg}/${l.side}/touch`;
	return `touch/other/${l.side}`;
}

function unknownSensory(l: Labels): string {
	if (l.sub === 'abdomen' || l.nerve.startsWith('AbN')) return `abdomen/${l.side}/touch`;
	if (l.sub === 'wing' || l.nerve === 'ADMN') return `wing/${l.side}/other`;
	if (l.sub === 'haltere') return `haltere/${l.side}`;
	if (l.leg) return `leg/${l.leg}/${l.side}/other`;
	if (l.nerve === 'AN') return `antenna/${l.side}/other`;
	return `other/${l.side}`;
}
