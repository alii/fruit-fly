/** On-disk brain graph: CSR (compressed sparse row) by presynaptic neuron. */
export interface Graph {
  n: number; // neurons
  e: number; // edges
  rowPtr: Uint32Array; // n+1. edges of neuron i are [rowPtr[i], rowPtr[i+1])
  col: Uint32Array; // e. postsynaptic neuron index
  w: Float32Array; // e. signed weight, mV. negative = inhibitory
}

export interface NeuronTable {
  bodyId: number[];
  type: (string | null)[];
  superclass: (string | null)[];
  class: (string | null)[];
  subclass: (string | null)[];
  side: (string | null)[];
  nt: (string | null)[];
  instance: (string | null)[];
  nerve: (string | null)[]; // nerve the neuron enters the CNS through, for sensory neurons
  receptor: (string | null)[];
  hex1: (number | null)[]; // optic lobe column coordinates, for eye neurons
  hex2: (number | null)[];
}

const MAGIC = "FLYB";
const VERSION = 1;
const HEADER_BYTES = 16;

export async function loadGraph(path: string): Promise<Graph> {
  const buf = await Bun.file(path).arrayBuffer();
  const dv = new DataView(buf);
  if (new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== MAGIC)
    throw new Error("not a brain.bin");
  const version = dv.getUint32(4, true);
  if (version !== VERSION)
    throw new Error(`unsupported brain.bin version ${version}`);
  const n = dv.getUint32(8, true);
  const e = dv.getUint32(12, true);
  const rowPtrAt = HEADER_BYTES;
  const colAt = rowPtrAt + (n + 1) * 4;
  const wAt = colAt + e * 4;
  return {
    n,
    e,
    rowPtr: new Uint32Array(buf, rowPtrAt, n + 1),
    col: new Uint32Array(buf, colAt, e),
    w: new Float32Array(buf, wAt, e),
  };
}

export async function loadNeurons(path: string): Promise<NeuronTable> {
  return (await Bun.file(path).json()) as NeuronTable;
}
