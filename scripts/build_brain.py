"""Turn the Janelia male-cns v1.0 flat files into a compact binary the TS sim can mmap.

Output (in data/):
  brain.bin      CSR graph. header + rowPtr(u32[N+1]) + col(u32[E]) + w(f32[E])  (w in mV, signed)
  neurons.json   columnar metadata, index-aligned with the graph
"""
import json, struct, sys
from pathlib import Path
import numpy as np
import pyarrow.feather as feather

ROOT = Path(__file__).resolve().parent.parent / "data"
MIN_SYN = int(sys.argv[1]) if len(sys.argv) > 1 else 5
W_SYN_MV = 0.275

SIGN = {
    "acetylcholine": +1, "glutamate": -1, "gaba": -1, "histamine": -1,
    "dopamine": +1, "octopamine": +1, "serotonin": +1, "unclear": +1,
}

ann = feather.read_feather(ROOT / "body-annotations-male-cns-v1.0-minconf-0.5.feather")
ann = ann[ann["status"] == "Traced"].reset_index(drop=True)
print(f"traced neurons: {len(ann)}")

nt = feather.read_feather(ROOT / "body-neurotransmitters-male-cns-v1.0.feather",
                          columns=["body", "consensus_nt"])
nt = dict(zip(nt["body"].to_numpy(), nt["consensus_nt"].to_numpy()))
ann["nt"] = [nt.get(b, "unclear") or "unclear" for b in ann["bodyId"]]

body_to_idx = {int(b): i for i, b in enumerate(ann["bodyId"].to_numpy())}

w = feather.read_feather(ROOT / "connectome-weights-male-cns-v1.0-minconf-0.5.feather")
print("weights columns:", list(w.columns), "rows:", len(w))
pre_col = next(c for c in w.columns if "pre" in c.lower() and "body" in c.lower())
post_col = next(c for c in w.columns if "post" in c.lower() and "body" in c.lower())
w_col = next(c for c in w.columns if c.lower() in ("weight", "count", "n", "syn", "synapses"))

pre_b = w[pre_col].to_numpy()
post_b = w[post_col].to_numpy()
cnt = w[w_col].to_numpy()
del w

keep = cnt >= MIN_SYN
pre_i = np.array([body_to_idx.get(int(b), -1) for b in pre_b[keep]], dtype=np.int64)
post_i = np.array([body_to_idx.get(int(b), -1) for b in post_b[keep]], dtype=np.int64)
cnt = cnt[keep]
ok = (pre_i >= 0) & (post_i >= 0)
pre_i, post_i, cnt = pre_i[ok], post_i[ok], cnt[ok]
print(f"edges kept (>= {MIN_SYN} synapses, both ends traced): {len(cnt)}")

sign = np.array([SIGN.get(x, +1) for x in ann["nt"]], dtype=np.float32)
weight = (cnt.astype(np.float32) * W_SYN_MV * sign[pre_i]).astype(np.float32)

order = np.lexsort((post_i, pre_i))
pre_i, post_i, weight = pre_i[order], post_i[order], weight[order]
N, E = len(ann), len(weight)
row_ptr = np.zeros(N + 1, dtype=np.uint32)
np.add.at(row_ptr, pre_i + 1, 1)
row_ptr = np.cumsum(row_ptr, dtype=np.uint32)

with open(ROOT / "brain.bin", "wb") as f:
    f.write(b"FLYB")
    f.write(struct.pack("<III", 1, N, E))
    f.write(row_ptr.tobytes())
    f.write(post_i.astype(np.uint32).tobytes())
    f.write(weight.tobytes())

def col(name):
    return [None if (isinstance(v, float) and np.isnan(v)) or v is None else v for v in ann[name].tolist()]

meta = {
    "bodyId": [int(b) for b in ann["bodyId"]],
    "type": col("type"), "superclass": col("superclass"), "class": col("class"),
    "side": col("somaSide"), "nt": col("nt"), "instance": col("instance"),
}
(ROOT / "neurons.json").write_text(json.dumps(meta, separators=(",", ":")))
print("wrote", ROOT / "brain.bin", ROOT / "neurons.json")
