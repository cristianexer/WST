# Generated art

All visual assets were created with the built-in imagegen tool for this project. No external stock artwork is required. Source renders are preserved in the workspace as PNG with their original alpha channels.

- `apps/web/public/assets/roster-atlas.png`: 7×3 grid of the user's 21 delegates, in roster order.
- `apps/web/public/assets/summit-showdown.png`: original Trump/Xi matchup key art.
- `apps/web/public/assets/summit-arena.png`: original summit stage plate with a clear fighting lane.
- `apps/web/public/assets/fighters/{character-id}-base-v2.png`: repaired base 4×2 atlas with guard, movement, strikes, compact low/air knee kicks and recoil.
- `apps/web/public/assets/fighters/{character-id}-motion.png`: four footwork frames, crouch, jump preparation, airborne tuck and landing.
- `apps/web/public/assets/fighters/{character-id}-combat.png`: light/heavy/kick preparation and recovery, plus that delegate’s signature windup and release.

## Approved direction and prompt set

The user approved the Trump sprite sheet on 21 September 2026 and requested the same treatment for every delegate. The shared production prompt is:

> One game animation sprite atlas of the named real-person digital double. Highly recognizable facial proportions and signature hair, realistic adult anatomy, tailored clothing matching that delegate, skin pores, lifelike eyes and detailed woven fabric. AAA photorealistic 3D-rendered style, not caricatures or toy geometry. Four equal columns by two equal rows, eight isolated full-body copies of the same identity and outfit. Stable orthographic three-quarter camera facing screen right. Poses in row order: neutral guard, advancing, straight punch, heavy cross, low kick, high guard, airborne kick, recoiling. Keep all limbs inside their cell. Real transparent alpha, no floor, no ground shadows, no labels or weapons. Match the approved Trump reference's lighting and pose layout; use the roster portrait to preserve each individual's likeness.

Per-character prompts add the name, facial structure, hair, facial hair/glasses and specific wardrobe. The generation prompts and provenance are recorded in `docs/asset-generation-prompts.json`. The expanded library contains 63 sheets: three eight-pose sheets per delegate, 24 poses each and 504 poses overall. Expansion prompts are recorded in `docs/asset-expansion-prompts.json`; each new sheet references that delegate’s approved base sheet to preserve identity and wardrobe. Final source paths, byte counts and SHA-256 hashes are recorded in `docs/asset-final-provenance.json`; the base-sheet repair prompts are in `docs/asset-base-repairs.json`. The runtime uses measured silhouette rectangles in each atlas, including hands that extend beyond a nominal column. Where two rectangles overlap, small texture-mapped strip meshes isolate each assigned silhouette. Both techniques preserve source pixels and alpha. This prevents adjacent-frame body fragments without editing the generated likeness.

The renderer flips the same atlas for opposite facing. This is a 2.5D art pipeline; it cannot supply arbitrary camera or true 3D mesh deformation. Cloth, face and body details are rendered into each pose.

Only the two selected delegates’ three sheets load for a match. The renderer swaps atlas frames at authoritative action phases, while footwork follows elapsed animation time. The source alpha is used directly; there is no runtime background removal. `tools/art/analyze_atlases.py` reads alpha connected components to produce the frame metadata in `apps/web/src/game/fighter-atlas-frames.json`; it never rewrites the PNGs.
