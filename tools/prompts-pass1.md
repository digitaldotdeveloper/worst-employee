# GEMINI STUDIO PROMPTS — PASS 1: STYLE EXPLORATION

**No reference images.** This pass exists to pick an art direction. The same
character is described identically in every style prompt, so the only variable
is the style itself — that is what makes them comparable.

Once a direction is chosen, **PASS 2** regenerates it as production sheets with
the winning image attached as the reference (`attach:[{kind:"up",file:"..."}]`),
on flat pure green `#00FF00`, following the consistency rules in
`_CONTINUE-HERE.md` §4.

Submit with `tools/send-prompts.js`. Prompts are separated by a line containing
only `---`, which the dashboard turns into one job each.

---

## THE CHARACTER (identical in every style prompt)

> A young male office worker in his early twenties, medium-brown skin, short
> black hair, wearing a rumpled light-blue button-up shirt with the sleeves
> rolled up, a loosened dark navy tie, grey slacks and white sneakers, with a
> staff ID badge hanging from a blue lanyard around his neck. His expression is
> mischievous and completely unbothered — the look of someone about to do
> something he absolutely should not do.

Rules baked into every character prompt:

- exactly ONE figure, no duplicate, no turnaround sheet
- full body, head to feet, nothing cropped
- three-quarter view facing right (this is a side-scrolling game)
- hair as one solid shape with a crisp edge, never fine wispy strands
- readable silhouette at small size — he will be ~62px tall in game

---

## STYLE A — bold flat vector cartoon

Thick black outlines, flat fills, limited palette, chunky exaggerated
proportions. The safest choice for a mobile beat-em-up: reads instantly at
small size and is the cheapest to animate.

## STYLE B — hand-drawn ink comic

Scratchy expressive linework, cel shading, slightly wobbly. Strongest for
comedy, hardest to keep consistent across animation frames.

## STYLE C — clean modern flat illustration

No outlines, geometric shapes, muted corporate palette with one hot accent.
Most "designed" looking, risks reading as a corporate website rather than a game.

## STYLE D — polished stylized cartoon

Soft shading, rim light, more realistic proportions, premium mobile-game finish.
Best looking, most expensive per frame, most drift risk between poses.

---

## ALSO IN PASS 1

- **Office environment** — the side-scrolling stage, flat side-on elevation
- **Boss, five anger stages** — one sheet, so he stays one person
- **Props sheet** — the physics objects, intact states

---

## AFTER THE STYLE IS PICKED (pass 2, not yet run)

1. Regenerate the chosen character on flat pure green `#00FF00`
2. Attach that image, generate each animation set from `assets/manifest.json`
3. Attach it again for each **paper-doll layer** — same body, same pose,
   only the garment changes. That alignment is what makes the layer system work.
4. Slice by connected component at one shared scale
