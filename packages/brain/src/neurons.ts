import type {NeuronTable} from './format.ts';
import {range} from './util.ts';

export interface NeuronQuery {
	type?: string | RegExp;
	superclass?: string;
	class?: string;
	subclass?: string;
	nerve?: string;
	side?: 'L' | 'R' | 'M';
	nt?: string;
	bodyId?: number;
}

const EXACT_FIELDS = ['superclass', 'class', 'subclass', 'nerve', 'side', 'nt', 'bodyId'] as const;

type Check = (i: number) => boolean;

/** Lookup helpers over the neuron metadata table. */
export class Neurons {
	private readonly byBody: ReadonlyMap<number, number>;
	constructor(readonly table: NeuronTable) {
		this.byBody = new Map(table.bodyId.map((b, i) => [b, i]));
	}
	get size(): number {
		return this.table.bodyId.length;
	}

	/** index of a neuron by its Janelia body id, or undefined */
	index(bodyId: number): number | undefined {
		return this.byBody.get(bodyId);
	}

	/** neuron indices matching every given field */
	find(q: NeuronQuery): Uint32Array {
		const checks = this.checks(q);
		return range(this.size).filter(i => checks.every(c => c(i)));
	}

	private checks(q: NeuronQuery): readonly Check[] {
		const t = this.table;
		const exact = EXACT_FIELDS.filter(k => q[k] !== undefined).map(
			(k): Check =>
				i =>
					t[k][i] === q[k],
		);
		const type = q.type;
		if (type === undefined) return exact;
		const byType: Check =
			typeof type === 'string' ? i => t.type[i] === type : i => type.test(t.type[i] ?? '');
		return [...exact, byType];
	}

	describe(i: number): string {
		const t = this.table;
		return `${t.instance[i] ?? t.type[i] ?? '?'} [${t.superclass[i] ?? '-'}/${t.nt[i] ?? '?'}] #${t.bodyId[i]}`;
	}
}
