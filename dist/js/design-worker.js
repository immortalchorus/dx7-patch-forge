// Runs the designer off the main thread; each design renders dozens of test notes.
import { design, cartridgeVoices } from "./designer.js";

self.onmessage = ({ data }) => {
  const { id, prompt, variation } = data;
  try {
    const { intent, results } = design(prompt, { variation });
    self.postMessage({
      id,
      intent: { dims: intent.dims, families: intent.families, cues: intent.cues },
      results: results.map((r) => ({
        name: r.name,
        voice: r.voice,
        features: r.features,
        base: r.base,
        targets: r.targets,
        applied: r.applied,
        score: r.score,
        source: { name: r.entry.voice.name, family: r.entry.family, origin: r.entry.source },
      })),
      cartridge: cartridgeVoices(results),
    });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) });
  }
};
