# What is next

Agreed ideas, roughly in the order they are worth doing. Nothing here is committed to a date.

## 1. Sliders that can build structure, not only adjust it

**The problem, measured.** Start an INIT voice in the classic editor, switch to Interactive, and
the sliders barely do anything. That is not a bug in the sliders; it is what the sliders are.
An INIT voice is algorithm 1 with OP1 at level 99 and OP2–OP6 silent, so:

- `brighten` works on *active* modulators (level above zero). There are none, so it falls to its
  all-carrier branch, which only touches carriers at ratio 1.5 or above. OP1 is at ratio 1, so
  brightness stays at exactly 1.00 however far the control is pushed.
- Six controls are switched off outright, with reasons shown: tine level, tine pitch, tine touch,
  sustain tone, layer balance and chorus width. They need layers the voice does not have.
- Grit sets feedback, but the feedback operator in algorithm 1 is OP6, which is silent, so even
  that does nothing audible.

Every macro edits structure that already exists. A designed voice arrives with modulators at
work, so everything has something to take hold of; one sine wave offers nothing.

**The fix.** Let the controls bring an operator in when one is needed, the way the hammer control
already restructures a voice through `freeOperator`. Asking for brightness on a voice with no
active modulator should raise the modulator feeding the loudest carrier, from a sensible ratio
and envelope, and say so in "why it sounds like this". The same for grit (move feedback to an
operator that is actually sounding) and for the layer controls (build the layer rather than
refusing). The DX7's own INIT is one carrier, so the authentic behaviour belongs in the classic
editor: it is the shaping side that should adapt.

## 2. More intuitive sliders

Worth thinking through properly rather than adding names. Candidates that came up: a "body"
versus "air" balance, "pluck" (how much of the attack is a separate short layer), "growl" for
low-frequency modulator beating, "bell tail" for what happens after the note stops, "breath"
(see below), and a "played harder" control that sweeps velocity response rather than level.
Each needs a measurable target, or it cannot be searched for and will drift back to a guess.

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
