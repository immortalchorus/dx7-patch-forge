# OWL and SpaceAge: the contract between them

OWL writes patches that SpaceAge loads. That makes SpaceAge's `.ssynth` format and its 80s FM
parameter mapping a shared interface, and this file records what OWL depends on, how each point
was verified, and what to check when SpaceAge changes. Everything here was read from
`immortalchorus/sample-squad-spaceage` (private; readable with
`gh api repos/immortalchorus/sample-squad-spaceage/contents/<path>`), not inferred.

## What OWL writes

`dist/js/ssynth.js` produces a `.ssynth` file: canonical JUCE JSON, keys sorted, CRLF line
endings, numbers as doubles, with two SHA-256 integrity fields (`parameterIntegrity` and
`patchIntegrity`). It carries **186 parameters** for `engine: 15` ("80s FM"). `tests/ssynth.test.js`
asserts the parameter count and that a written patch reads back to the same voice, so a change in
the parameter set fails the suite rather than producing a file SpaceAge quietly rejects.

OWL also writes Yamaha-compatible `.syx` (163-byte single voice, 4104-byte 32-voice cartridge)
and sends single voices over MIDI. Those are the DX7's format, not SpaceAge's, and do not move
when SpaceAge does.

## Verified points of the contract

| What | Where it is decided | What OWL does |
| --- | --- | --- |
| Feedback is stored **normalised 0–1**, multiplied by 7 to make the DX7 byte | `Source/Ops7Dx7Converter.cpp` (`byteValue(voice.feedback, 7)`, `normalized("Feedback", 7)`) | writes `fm80feedback: feedback / 7`, reads back `× 7` |
| A DX7 voice name is the patch name's **first ten characters**, uppercased | `Ops7Dx7Converter.cpp` (`voice.name.toUpperCase().substring(0, 10)`) | the DX7-name box defaults to exactly that, so a patch exported both ways carries one name |
| The patch name field allows far more than ten characters | OWL writes up to 128; the UI allows 64 | the title is what the file is called and what travels inside it |
| Each voice's carrier sum is scaled by **0.5** and hard-clipped at ±1 | `Source/PluginProcessor.cpp` | OWL's preview copies this, and auto-levels every designed voice to peak 1 dB under the clip point |
| Operator level, and other bounded values, are normalised 0–1 in the JSON | `ssynth.js` `ssynthParameters` | written and read as fractions, not DX7 integers |

## What to check when SpaceAge's FM engine changes

Work through these; each one silently corrupts exports if it moves and OWL is not updated.

1. **The parameter list for engine 15** — any added, removed or renamed `fm80*` key. OWL's list is
   in `dist/js/ssynthParameters` (`dist/js/ssynth.js`); the test pins the count at 186.
2. **Normalisation of any parameter** — the feedback case shows how invisible this is. A value
   OWL writes as `1` meaning "maximum" becomes `1` meaning "one seventh" if SpaceAge changes to
   raw DX7 units, and nothing errors.
3. **How the two integrity hashes are computed**, and over what canonical form. OWL reproduces
   JUCE's JSON exactly — sorted keys, CRLF, double formatting — because the hash is over that text.
4. **The engine id** (15) and `engineName` ("80s FM").
5. **Defaults for anything OWL does not write**, since SpaceAge fills the rest.
6. **The DX7 import path** (`Ops7Dx7Converter.cpp`), if OWL's `.syx` files are ever loaded through
   SpaceAge rather than opened directly.

## If a bridge engine is ever built

A cross-modulated pair of voices (see `roadmap.md`) cannot be expressed in engine 15: its 186
parameters have no room for a second voice or the coupling between them. It would need a new
engine id with its own schema, and OWL would need to write that schema. It also cannot be a `.syx`
at all, so the export story would be: two DX7 voices plus a SpaceAge patch that carries the bridge.

## House rules that apply to both projects

- Verify, then claim. Say what was not verified.
- OWL's own labels say "6-operator FM"; brand names appear only in factual compatibility
  statements. SpaceAge has its own, stricter rule: `README.md` is hash-bound in
  `Resources/PublicClaimsRegistry.json` and enforced by a test.
- Public copy uses curly quotes and apostrophes, and the Oxford comma.
