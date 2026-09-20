# What is next

Agreed ideas, roughly in the order they are worth doing. Nothing here is committed to a date.

## 1. Sliders that can build structure, not only adjust it — mostly done

**What it was.** An INIT voice is algorithm 1 with OP1 at 99 and OP2–OP6 silent. Every macro
edited structure that already existed, so brightness measured exactly 1.00 however far it was
pushed, six controls switched off, and grit set a feedback loop on a silent operator.

**What it does now.** When a control needs structure that is not there, it builds it, the way
the hammer control already did:

- Asking for a brighter or bitier sound brings an operator in to modulate the loudest carrier,
  at ratio 1 with the carrier's own envelope. Brightness on an INIT voice now reaches 2.37.
- The tine controls build a tine layer: a high-ratio, fast-decaying modulator (14:1 as in
  E.Piano 1), so the attack sparkle appears where there was none.
- Grit moves the feedback loop onto an operator that can be heard, which for algorithm 1 means
  stepping to algorithm 2 — the same routing with feedback on the operator that is sounding.
- Controls are reported unavailable only when the structure genuinely cannot be built.
- Asking for something *darker* builds nothing: there would be nothing to darken.

**What is left.** Sustain tone and layer balance still need a sustain-layer builder, and chorus
width still needs two parallel carriers, which no control can conjure from one. Attack bite on a
freshly built modulator is weaker than it should be.

## 2. More intuitive sliders — three added, chosen from data

Rather than inventing names, 39,961 distinct voices were surveyed to find what programmers
actually vary that OWL could not reach (the table is in docs/research.md). Three controls came
out of it: **Growl** (a sub-unity modulator ratio, in 32% of real patches), **Tail after the
decay** (the two-stage envelope, 16%) and **Where it thins out** (the level-scaling break
point, 72% use scaling, almost always breaking near middle C).

Still on the list, now with evidence behind them: a "pluck" control for how much of the attack
is a separate short layer, and a "played harder" control that sweeps the velocity response
rather than the level. The strongest remaining lead is fixed-frequency operators: a third of
all patches use one, and OWL only uses them for the hammer.

## 3. A breath and noise layer

A fixed-frequency operator with feedback produces usable noise. That is what flutes, breathy
voices, wind and bowed attacks need, and OWL currently cannot make any of them convincingly.
It needs the same structural work as item 1, so the two belong together.

## 4. Library voices for the thin families

Marimba and mallets have no sourced recipe in `docs/research.md`, so descriptions that ask for
them land somewhere else. Bowed strings, choir and wind are similarly thin. Each new entry needs
a source, not an invention.

## 5. Small things

- The classic editor's envelope boxes can be dragged; the pitch EG and the parameter rows now
  behave the same way. Consider the same gesture on the algorithm number.
- A hardware check-list for whoever eventually tests against a real DX7 (see the note in
  `README.md` about what Dexed can and cannot stand in for).

## Done recently

Classic editor tab · audition loop with diagnostic patterns · monitoring reverb and level ·
MIDI in and out including SysEx receive · deploy-time cache stamping.
