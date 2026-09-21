# Character artist and technical animator brief

## Assignment
Produce two individually approved, recognisable leader likenesses for a cinematic fictional arcade game. The exact people are selected by the producer after office/source and rights review. This file is a commissioning specification, not permission to reuse reference photographs or another game's character assets.

## Target appearance
High-quality realistic digital humans, not giant-head cartoons or unlabelled authentic-looking political footage. Neutral expressions, believable skin/eyes, good hair silhouette and carefully fitted formal clothing. Test recognition in neutral lighting before filmic grading. Every avatar has the same canonical combat envelope and moves; visual choices do not describe real strength, fitness or personality.

## Deliverables per person
1. Source/provenance reference manifest: front, profiles, three-quarter, relevant expressions, source dates and usage notes.
2. Editable high-resolution head sculpt; retopologised head/neck; canonical-fit body and primary wardrobe, with mirror-match material variation.
3. Hair-card and facial-hair assets, eyes/corneas/lashes, teeth/mouth cavity and approved visible accessories.
4. Common skeleton binding with <=90 deform joints, four weights/vertex, required sockets, scale 1 and correct bind pose.
5. All 24 facial morphs from PRD 13.4, tested individually and in intended combinations.
6. Skin/clothing/accessory PBR masters and runtime textures. Base colour uses colour encoding; normal and packed ORM data are handled as non-colour data. The adopted ORM convention is R=occlusion, G=roughness, B=metallic. Test normal orientation through the actual glTF renderer. Source basis: glTF specification, PRD [S06].
7. Four mesh LODs with caps of 120k/60k/30k/12k triangles including hair and clothing; 2K fight textures and optional on-demand 4K face detail.
8. Four original person-specific presentation clips: entrance, subtle idle layer, victory and selection pose. No authentic political speech or medical-symptom imitation.
9. Compressed runtime bundle <=12 MiB standard incremental transfer, portraits, hash manifest, licence/rights record and technical export report.
10. Neutral-light turntable, deformation/contact review and all V1 action/morph test captures.

## Animation requirements
The shared library has 62 V1 clips in the supplied animation register. A single rig does not eliminate per-body and garment corrections. Match gameplay markers, contact anchors and facing; export gameplay events separately rather than relying on application-specific timeline markers. Extract root displacement for the simulation; do not leave duplicate root movement in the runtime clips. Paired throws need attacker and victim clips aligned to the same event timeline.

## Acceptance gates
- Neutral identity readable from front/profile/three-quarter and at fight-camera distance.
- Eyelids close fully; gaze correctly aligned; mouth has believable interior geometry.
- No visible clothing/skin penetration in the curated V1 action matrix.
- Planted foot slide <=2 cm and marked paired contacts <=3 cm in the canonical scene.
- All four LODs preserve essential likeness and avoid visible transition holes.
- Skin, cloth, eyes, hair and shoes have distinct material response without baked specular highlights.
- Hair alpha overdraw, material count, texture residency and shadow contribution profiled in the browser.
- All publication/provenance checks completed; restricted references excluded from public exports.

## Review sequence and change control
Reference/neutral sculpt -> retopology and wardrobe -> rig/face -> animation/contact -> materials/LODs -> browser review -> final source/runtime delivery. Approve each stage once; reopen only for a material defect or scope change. Agree source-file ownership, revision allowance and permitted deployment/redistribution before work starts.
