// Real-time preview on the audio thread. app.js falls back to running PreviewEngine on the
// main thread if this module cannot be loaded.
import { PreviewEngine } from "./preview-engine.js";

class FmPreview extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new PreviewEngine(sampleRate, (e) => this.port.postMessage(e));
    this.port.onmessage = ({ data }) => this.engine.message(data);
  }
  process(_, outputs) {
    this.engine.render(outputs[0]);
    return true;
  }
}

registerProcessor("fm-preview", FmPreview);
