/** On-disk brain graph: CSR (compressed sparse row) by presynaptic neuron. */
export interface Graph {
  n: number;
  e: number;
  rowPtr: Uint32Array;
  col: Uint32Array;
  w: Float32Array;
}

export interface NeuronTable {
  bodyId: number[];
  type: (string | null)[];
  superclass: (string | null)[];
  class: (string | null)[];
  side: (string | null)[];
  nt: (string | null)[];
  instance: (string | null)[];
}

export async function loadGraph(path: string): Promise<Graph> {
  const buf = await Bun.file(path).arrayBuffer();
  const dv = new DataView(buf);
  if (new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== "FLYB")
    throw new Error("not a brain.bin");
  const version = dv.getUint32(4, true);
  if (version !== 1)
    throw new Error(`unsupported brain.bin version ${version}`);
  const n = dv.getUint32(8, true);
  const e = dv.getUint32(12, true);
  let off = 16;
  const rowPtr = new Uint32Array(buf, off, n + 1);
  off += (n + 1) * 4;
  const col = new Uint32Array(buf, off, e);
  off += e * 4;
  const w = new Float32Array(buf, off, e);
  return { n, e, rowPtr, col, w };
}

export async function loadNeurons(path: string): Promise<NeuronTable> {
  return (await Bun.file(path).json()) as NeuronTable;
}
