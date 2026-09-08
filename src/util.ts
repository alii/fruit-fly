/** Call `fn` with 0 .. n-1. The loop that advances simulated time. */
export function times(n: number, fn: (k: number) => void): void {
	for (let k = 0; k < n; k++) fn(k);
}

/** 0 .. n-1 as a typed array. */
export function range(n: number): Uint32Array {
	return Uint32Array.from({length: n}, (_, i) => i);
}

/** One typed array holding every element of `parts` in order. */
export function concat(parts: readonly Uint32Array[]): Uint32Array {
	return Uint32Array.from(parts.flatMap(p => Array.from(p)));
}
