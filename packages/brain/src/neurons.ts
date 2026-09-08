import type { NeuronTable } from "./format.ts";

export interface NeuronQuery {
  type?: string | RegExp;
  superclass?: string;
  class?: string;
  side?: "L" | "R" | "M";
  nt?: string;
  bodyId?: number;
}

/** Lookup helpers over the neuron metadata table. */
export class Neurons {
  private byBody = new Map<number, number>();
  constructor(readonly table: NeuronTable) {
    table.bodyId.forEach((b, i) => this.byBody.set(b, i));
  }
  get size() {
    return this.table.bodyId.length;
  }

  index(bodyId: number): number {
    const i = this.byBody.get(bodyId);
    if (i === undefined) throw new Error(`unknown bodyId ${bodyId}`);
    return i;
  }

  /** neuron indices matching every given field */
  find(q: NeuronQuery): Uint32Array {
    const t = this.table;
    const out: number[] = [];
    for (let i = 0; i < this.size; i++) {
      if (q.bodyId !== undefined && t.bodyId[i] !== q.bodyId) continue;
      if (q.superclass !== undefined && t.superclass[i] !== q.superclass)
        continue;
      if (q.class !== undefined && t.class[i] !== q.class) continue;
      if (q.side !== undefined && t.side[i] !== q.side) continue;
      if (q.nt !== undefined && t.nt[i] !== q.nt) continue;
      if (q.type !== undefined) {
        const ty = t.type[i];
        if (ty === null) continue;
        if (ty === undefined) continue;
        if (typeof q.type === "string" ? ty !== q.type : !q.type.test(ty))
          continue;
      }
      out.push(i);
    }
    return Uint32Array.from(out);
  }

  describe(i: number): string {
    const t = this.table;
    return `${t.instance[i] ?? t.type[i] ?? "?"} [${t.superclass[i] ?? "-"}/${t.nt[i] ?? "?"}] #${t.bodyId[i]}`;
  }
}
