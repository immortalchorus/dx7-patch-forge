# FM programming research behind OWL

OWL's sound-shaping controls are meant to do what experienced DX7 programmers do by hand. This file records the practices each control is based on and where they come from, so a feature can be traced back to a teacher rather than a guess. Everything here is paraphrased; see the sources for the original wording.

Source groups:

- **PD**: Power DX7's YouTube tutorials (41 videos, 2017–2019): electric piano, Tubular Bells, Mega Bass, Vibes, algorithm fundamentals, quick tips, Dexed, 4-operator basics. Channel: https://www.youtube.com/@powerdx7383
- **JC**: John Chowning, *The Synthesis of Complex Audio Spectra by Means of Frequency Modulation*, JAES 1973. https://ccrma.stanford.edu/sites/default/files/user/jc/fm_synthesis_paper.pdf
- **MR**: Martin Russ, *Practically FM* parts 1–6, *Sound On Sound* 1988. https://www.muzines.co.uk/articles/practically-fm/3527 (series)
- **BT**: Bo Tomlyn with Jim Aikin, *How to Program the DX7*, *Keyboard* 1985. https://yamahablackboxes.com/articles/how-to-program-yamaha-dx7/
- **MP**: Mark Phillips, *Basic FM Synthesis on the Yamaha DX7*. https://www.deepsonic.ch/deep/docs_manuals/yamaha_dx7_basic_fm_synthesis.pdf
- **MF**: Manny Fernandez, *Manny's Modulation Manifesto* (written for reface DX; FM principles carry over, reface-only features do not). https://yamahasynth.com/learn/synth-programming/
- **SR**: Gordon Reid, *Synth Secrets* 12–13, *Sound On Sound* 2000. https://www.soundonsound.com/techniques/introduction-frequency-modulation
- **EMM**: *Understanding the DX7*, *Electronics & Music Maker* 1984. https://www.muzines.co.uk/articles/understanding-the-dx7/7900
- **KS**: Ken Shirriff, DX7 chip reverse engineering (algorithm chart, feedback). https://www.righto.com/2021/12/yamaha-dx7-chip-reverse-engineering.html
- **DX**: Dexed source (routing table and algorithm display). https://github.com/asb2m10/dexed

## Brightness and loudness

- A modulator's output level and envelope control brightness (modulation index). A carrier's output level and envelope control loudness. Modulators act like a filter envelope, carriers like an amplifier envelope. (PD, JC, MR, BT, MP, SR)
- Useful ranges: carriers about 90–99; modulators about 70–90. Above about 90 a modulator adds unwanted partials and noise, and changes above 70 are very sensitive. An added attack modulator sounds best around 65 or below. (PD; MR gives 75–85)
- Envelope levels and output level work together: reshaping a modulator's envelope changes its overall modulation, so its output level usually needs re-balancing. (PD)
- **Supports:** Brightness, Tine level, Sustain tone, automatic levelling.

## Velocity

- Modulators get more velocity sensitivity than carriers, so soft playing is soft and mellow and hard playing brings out harmonics and attack. (PD, JC, MR, MP, EMM)
- Per layer: the tine or attack modulator gets high sensitivity (up to 7), sustain modulators little, and a hammer layer a moderate amount (about 3). (PD)
- Adding velocity sensitivity lowers the level at normal playing strength; raise output or envelope level to compensate. (PD, MR)
- **Supports:** Velocity → brightness, Velocity → volume, Tine touch, Hammer touch.

## Ratios and layers ("towers")

- Algorithms with parallel towers (for example 5) are used as additive layers, each tower making one part of the sound, then mixed. (PD "divide and conquer"; BT uses separate body, tine and thump branches for electric piano)
- 1:1 with feedback gives a saw-like tone, 1:2 a square-like odd-harmonic tone, and high or half-integer modulator ratios (1.5, 2.5, 3.5…) or ratios like 1:1.4 give bell and metallic tones. (PD, JC, MR, BT, MF, SR)
- An electric piano tine is a high-ratio modulator (14 in E.Piano 1, 12 in FullTines; 14–18 elsewhere) with a fast decay. A 14:1 tine vanishes on high notes because its partials leave the audible range; 12:1 stays audible across more of the keyboard. (PD; Attack Magazine uses 18)
- An extra attack modulator added to an existing tone should use a multiple of that tone's modulator ratio (7 for a 3.5 bell) to keep its character. Other ratios muddy it. (PD)
- **Supports:** layer detection, Tine pitch, Body (hollow/full), Tuning (metallic/pure).

## Hammer and attack noise

- A hammer or thump is a fixed-frequency operator with a single fast decay: about 100–200 Hz sounds like a hammer, and above about 300 Hz it just adds clang. Output about 80–90, velocity sensitivity about 3, minimal rate scaling. (PD; BT uses about 97 Hz for a Rhodes thud; MF uses fixed-frequency operators for brass lip noise)
- **Supports:** Hammer amount, Hammer pitch, Hammer touch.

## Freeing an operator: algorithm interchangeability

- To add a layer without losing the existing ones, switch to a closely related algorithm that keeps the current towers and frees an operator. Families that swap with minimal change: {1, 2, 14, 15, 18}, {3, 4, 10, 11, 16, 17}, {5, 6, 7, 8, 9, 12, 13}, {20, 21, 26, 27}, {22, 23, 24, 25}. For example, 5 → 13 keeps towers 1–2 and turns operators 5 and 6 into two modulators on operator 3. (PD, single teacher)
- When several modulators feed one carrier, lower their levels, or the combined modulation overdrives it. (PD, MF)
- You rarely know in advance which algorithm will work best, so try several interchangeable ones and compare. (PD)
- Algorithm choice sets harmonic potential: pure-FM algorithms (16–18) reach the richest spectra, carrier-heavy ones (31–32) the thinnest. (PD, MF)
- **Supports:** automatic restructuring when a requested layer needs an operator; candidate comparison across interchangeable algorithms. OWL measures each swap to confirm the existing layers still sound the same.

## Envelopes

- The drop from L1 to L2 sets how strong the attack transient is (99 → 75 is a clear bite, 99 → 95 almost none); the main decay is then set by R3 toward L3. (PD, MR, BT)
- Modulator envelopes usually move faster than carrier envelopes for percussive sounds. For brass, the modulator is slower than the carrier so harmonics bloom in after the note starts. Chowning instead moves the index with amplitude; these differ in degree. (PD, MR, JC)
- Bells: the index decays along with amplitude, so the tail becomes nearly a sine. (JC)
- A completely flat DX7 envelope (rates 99, levels 99) can click; rates around 55 for R2 and R3 avoid it. (PD)
- **Supports:** Attack bite, Timbre over time, Held length, Sustain level.

## Detune and chorus

- Chorus comes from detuning parallel towers against each other, in opposite directions. The larger the difference, the faster the beating. Two moderate opposite settings work better than one extreme one. (PD, MR, MF)
- Set carrier detune first for beat speed, then trim modulator detune: detuning a modulator gives phasing or wobble rather than chorus. (PD, BT, MF)
- A third, undetuned carrier playing the same pitch smooths the chorus. (PD)
- Ratio-mode detune beats faster in higher registers; a fixed Hz offset beats at the same rate everywhere. (MF, JC)
- **Supports:** Chorus speed, Chorus smoothness (replacing the single Detune slider).

## Keyboard scaling

- Negative level scaling above a breakpoint on modulators tames harsh upper notes, or keeps a bass's harmonic layer out of the top range. (PD, MR, BT, MP)
- Rate scaling shortens envelopes on higher notes, like real strings; typical values 2–4. Consistent rate scaling across operators keeps the character stable across the keyboard. (PD, MR, BT)
- **Supports:** Across the keyboard, High notes shorter.

## Movement

- The DX7 has one LFO per voice: vibrato (pitch), tremolo (amp-mod sensitivity on carriers) and timbre wobble (amp-mod sensitivity on modulators) share its rate and delay. The delay fades movement in; it cannot fade out. (PD, MP, DX7 manual)
- **Supports:** Vibrato, Tremolo, Timbre wobble, Movement speed, Movement arrives.

## Pitch envelope

- Used for brass scoops and blips, drum pitch drops and effects. Level 50 is no change. It moves every operator together, and it starts and ends at L4, so an L4 other than 50 also bends the release. The DX7 Mk I pitch envelope behaves slightly differently from later models. (MR, BT, MP, PD)
- **Supports:** Pitch scoop, Pitch fall.

## Output level and clipping

- Keep at least one carrier near full level for resolution, but when several carriers sum, lower them to avoid distortion. (BT, MF)
- SpaceAge and Dexed scale each voice's carrier sum by 0.5 and hard-clip at full scale (SpaceAge `PluginProcessor.cpp`), so OWL levels every forged voice to peak 1 dB under that point.
- **Supports:** automatic levelling, Output level.

## Algorithm chart

- The front panel draws plain numbered boxes with carriers on one output bus, modulators above their targets joined by straight or diagonal lines, and small right-angled feedback loops (on the left for OP2 in algorithms 2, 9, 15 and 17 and OP4 in 8; running down the stack in 4 and 6). Positions were taken from panel photos and cross-checked against KS and DX. (Wikimedia Commons DX7II-D chart photo; KS; DX)

## Known gaps

- No accessible source gives a programming recipe for marimba or mallets beyond Chowning's wood-drum example.
- Chowning & Bristow's *FM Theory & Applications* (1986) and Massey's *The Complete DX7* were not accessible and were not used.
- Algorithm interchangeability as a technique comes from one teacher (PD); OWL treats it as a hypothesis to verify by measurement on every use.
