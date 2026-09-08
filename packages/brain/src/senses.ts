import type { Lif } from "./lif.ts";
import type { Neurons } from "./neurons.ts";
import type { NeuronTable } from "./format.ts";

/** A named group of sensory neurons that are driven together. */
export interface Channel {
  name: string;
  neurons: Uint32Array;
}

export interface SensesOptions {
  /** firing rate at level 1. default 100 */
  maxHz?: number;
}

const LEG_BY_NERVE: Record<string, string> = {
  ProLN: "front", ProAN: "front", ProCN: "front", DProN: "front", VProN: "front",
  MesoLN: "middle",
  MetaLN: "hind",
};

/**
 * Every sensory neuron in the data, grouped into named channels.
 *
 * Names are paths. `set` accepts an exact name or a prefix, so "leg" drives all
 * six legs and "leg/front/L/touch" drives one group of bristles. Use `list` to
 * see what exists. The eyes are handled separately by `Eye`.
 */
export class Senses {
  readonly channels = new Map<string, Channel>();
  readonly maxHz: number;

  constructor(readonly neurons: Neurons, opts: SensesOptions = {}) {
    this.maxHz = opts.maxHz ?? 100;
    const t = neurons.table;
    const groups = new Map<string, number[]>();
    for (let i = 0; i < neurons.size; i++) {
      const name = channelName(t, i);
      if (!name) continue;
      let g = groups.get(name);
      if (!g) groups.set(name, (g = []));
      g.push(i);
    }
    for (const [name, ids] of [...groups].sort()) this.channels.set(name, { name, neurons: Uint32Array.from(ids) });
  }

  /** Channels whose name equals `name` or starts with `name + "/"`. */
  match(name: string): Channel[] {
    const out: Channel[] = [];
    for (const c of this.channels.values()) if (c.name === name || c.name.startsWith(name + "/")) out.push(c);
    return out;
  }

  /** Drive every neuron under `name` at `level * maxHz`. Level 0 stops the drive. */
  set(brain: Lif, name: string, level: number) {
    const cs = this.match(name);
    if (!cs.length) throw new Error(`no sense channel named "${name}"`);
    for (const c of cs) brain.setDrive(c.neurons, level * this.maxHz);
  }

  /** Set several channels at once. */
  apply(brain: Lif, levels: Record<string, number>) {
    for (const [name, level] of Object.entries(levels)) this.set(brain, name, level);
  }

  /** Stop driving every channel. */
  off(brain: Lif) {
    for (const c of this.channels.values()) brain.setDrive(c.neurons, 0);
  }

  list(): { name: string; count: number }[] {
    return [...this.channels.values()].map((c) => ({ name: c.name, count: c.neurons.length }));
  }
}

const SENSORY = new Set(["vnc_sensory", "cb_sensory", "sensory_ascending"]);

/** Channel name for one neuron, or null if it is not a sensory neuron. */
function channelName(t: NeuronTable, i: number): string | null {
  const type = t.type[i] ?? "";
  const side = t.side[i] === "L" || t.side[i] === "R" ? t.side[i]! : "?";
  if (type.startsWith("OCG")) return `ocelli/${side}`;
  if (!SENSORY.has(t.superclass[i] ?? "")) return null;

  const cls = t.class[i] ?? "";
  const sub = t.subclass[i] ?? "";
  const nerve = t.nerve[i] ?? "";
  const leg = LEG_BY_NERVE[nerve];

  if (cls === "olfactory") return `smell/${type.startsWith("ORN_") ? type.slice(4) : "other"}`;
  if (cls === "thermosensory") return `temperature/${type.startsWith("TRN_") ? type.slice(4) : "other"}`;
  if (cls === "hygrosensory") return `humidity/${type.startsWith("HRN_") ? type.slice(4) : "other"}`;

  if (cls === "gustatory" || sub === "taste bristle" || cls === "chemosensory") {
    if (sub === "labellar bristle" || sub === "taste peg") return `taste/labellum/${side}`;
    if (sub === "pharyngeal sensillum") return `taste/pharynx/${side}`;
    if (sub === "wing bristle") return `taste/wing/${side}`;
    if (sub === "abdomen") return `taste/abdomen/${side}`;
    if (leg) return `taste/leg/${leg}/${side}`;
    return `taste/other/${side}`;
  }

  if (cls === "mechanosensory") {
    if (sub === "auditory") return `hear/${side}`;
    if (sub === "wind_gravity") return `antenna/${side}/wind_gravity`;
    if (sub === "grooming") return `antenna/${side}/touch`;
    if (sub === "pharyngeal sensillum") return `mouth/pharynx/${side}`;
    if (type.startsWith("JO")) return `antenna/${side}/other`;
    if (type === "BM_InOm") return `head/eyes/${side}`;
    if (type.startsWith("BM_") || type.startsWith("TPMN")) return `head/mouth/${side}`;
    return `head/other/${side}`;
  }

  if (cls === "mechanosensory_proprioceptive") {
    if (sub === "haltere" || nerve === "DMetaN") return `haltere/${side}`;
    if (sub === "wing" || nerve === "ADMN") return `wing/${side}/strain`;
    if (sub === "notum") return `back/${side}/position`;
    if (sub === "abdomen") return `abdomen/${side}/stretch`;
    if (sub === "neck" || (sub === "hair plate" && nerve === "PrN")) return `neck/${side}`;
    if (leg) {
      if (sub === "chordotonal organ") return `leg/${leg}/${side}/joint`;
      if (sub === "campaniform sensilla") return `leg/${leg}/${side}/load`;
      if (sub === "hair plate") return `leg/${leg}/${side}/position`;
      return `leg/${leg}/${side}/other`;
    }
    return `proprioception/other/${side}`;
  }

  if (cls === "mechanosensory_tactile" || sub === "mechanosensory bristle") {
    if (nerve === "ADMN") return `wing/${side}/touch`;
    if (nerve === "DMetaN") return `haltere/${side}`;
    if (nerve === "PDMN" || sub === "notum") return `back/${side}/touch`;
    if (leg) return `leg/${leg}/${side}/touch`;
    return `touch/other/${side}`;
  }

  if (sub === "abdomen" || nerve.startsWith("AbN")) return `abdomen/${side}/touch`;
  if (sub === "wing" || nerve === "ADMN") return `wing/${side}/other`;
  if (sub === "haltere") return `haltere/${side}`;
  if (leg) return `leg/${leg}/${side}/other`;
  if (nerve === "AN") return `antenna/${side}/other`;
  return `other/${side}`;
}
