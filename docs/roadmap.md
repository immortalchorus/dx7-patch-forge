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

## 6. The bridge: two FM voices introduced to one another

Admirals idea, parked here rather than dropped. Cross-modulating two voices is a twelve-operator
instrument with a two-tier topology: powerful, and mostly mush unless the routing is curated into
a few musical modes - phase (B modulates As carriers, needs harmonic locking), ring, excite (B
drives As modulation index rather than its phase, probably the most reliable), detune, and damp.

Two things settled in discussion. Damping is not the same mechanism as the rest: FM only adds
sidebands, so "B ducks As highs" is SpaceAges filter and "B carves A into its own spectral
shape" is a vocoder - decide which before building. And a bridge patch cannot be a .syx at all,
so it needs a new SpaceAge engine id with its own parameter schema: cross-repo C++ work, which
means OWL can design and audition bridges before SpaceAge can play them.

The reason to do the matcher first: its harmonic tracker does three jobs, not one. It matches a
recording, it shows what a bridge is doing partial by partial, and it collapses a twelve-operator
bridge back into the best six-operator approximation for hardware.

## 7. Tier 2 of sound matching

Tier 1 shipped (see match.js). What it cannot do is reproduce a spectrum partial by partial.
Tier 2: track harmonic amplitudes over time, set carrier ratios analytically from the strongest
partials (never by search - Horner 1997 and Turian & Henry 2020 are unanimous that spectral
losses cannot find frequencies), invert the Bessel spread for modulation indices, fit envelopes
from the measured per-band curves, then refine levels and envelopes with an evolutionary search
scored by relative amplitude spectral error weighted to the low harmonics. Run it per algorithm
across a few parallel-carrier candidates. Target 0.10 relative error; published work puts a
six-oscillator voice at 0.07-0.15 against real instrument tones, which is the edge of audible.

## Done recently

Classic editor tab · audition loop with diagnostic patterns · monitoring reverb and level ·
MIDI in and out including SysEx receive · deploy-time cache stamping · structure-building
controls · three controls chosen from a 39,961-patch survey · sub-octave · tier-one sound
matching · separate patch title and DX7 name.
