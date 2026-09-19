// Runs the designer off the main thread; each design renders dozens of test notes.
import { design, tailor, entryById, patchName, registerEntry } from "./designer.js";

const serialize = (r) => ({
  name: r.name,
  voice: r.voice,
  features: r.features,
  base: r.base,
  targets: r.targets,
  applied: r.applied,
  sliders: r.sliders,
  unavailable: r.unavailable,
  score: r.score,
  entryId: r.entry.id,
  source: { name: r.entry.voice.name, family: r.entry.family, origin: r.entry.source },
});

self.onmessage = ({ data }) => {
  const { id, type } = data;
  try {
    if (type === "design") {
      const { intent, results } = design(data.prompt, { variation: data.variation });
      self.postMessage({
        id,
        type,
        intent: { dims: intent.dims, families: intent.families, cues: intent.cues },
        results: results.map(serialize),
      });
    } else if (type === "load") {
      // A voice from a file: start from it exactly, sliders at zero, name unchanged.
      const entry = registerEntry(data.entry);
      const r = tailor(entry, {});
      r.name = entry.voice.name;
      r.voice.name = r.name;
      self.postMessage({ id, type, result: serialize(r) });
    } else if (type === "tailor") {
      const entry = entryById(data.entryId);
      const r = tailor(entry, data.sliders);
      r.name = entry.source === "Loaded file" && Object.values(r.sliders).every((x) => !x) ? entry.voice.name : patchName(entry.voice.name, r.sliders);
      r.voice.name = r.name;
      self.postMessage({ id, type, result: serialize(r) });
    }
  } catch (err) {
    self.postMessage({ id, type, error: String((err && err.stack) || err) });
  }
};
