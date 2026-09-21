# Audio credits and licences

## Bundled arena radio

WST bundles three **unchanged recorded instrumental tracks** for offline arena
radio. They are not copies, stems, covers, or sound-alikes of any commercial
song. Each track is available under the Creative Commons Attribution 4.0
International licence. The app's radio tuner displays the title, artist and
licence, and this document retains the required attribution and source links.

| Bundled file | Credit and required attribution | Official source | Licence |
| --- | --- | --- | --- |
| `apps/web/public/audio/music/big-rock.mp3` | “Big Rock” Kevin MacLeod (incompetech.com) | [Track page](https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1100305) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `apps/web/public/audio/music/cool-rock.mp3` | “Cool Rock” Kevin MacLeod (incompetech.com) | [Track page](https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1100279) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `apps/web/public/audio/music/hotrock.mp3` | “Hotrock” Kevin MacLeod (incompetech.com) | [Track page](https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1100201) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

The selected tracks were recorded as kit, bass, and electric-guitar rock; the
official pages describe Big Rock as power-chord rock, Cool Rock as energetic
and driving, and Hotrock as power guitar rock. The downloaded MP3 metadata was
checked for Kevin MacLeod and its declared title before bundling.

### Attribution text

```text
“Big Rock” Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
https://creativecommons.org/licenses/by/4.0/

“Cool Rock” Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
https://creativecommons.org/licenses/by/4.0/

“Hotrock” Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
https://creativecommons.org/licenses/by/4.0/
```

The radio also offers a **Your Track** picker. It plays a local audio file using
an in-memory Object URL, never uploads that file, and revokes the URL when the
track is replaced, a bundled station is selected, or the tuner is disposed.

## Fight effects

The twelve recorded fight-foley files under `apps/web/public/audio/` are
renamed selections from Kenney's **Impact Sounds** and **RPG Audio** packs.
They supply the impact, guard, footstep, landing, cloth, and whoosh layers
listed in `apps/web/src/audio/index.ts`; Web Audio adds the in-game synthesis
and the twenty-one signature textures around those recordings.

| Pack | Official source | Licence |
| --- | --- | --- |
| Kenney Impact Sounds | [kenney.nl/assets/impact-sounds](https://kenney.nl/assets/impact-sounds) | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) |
| Kenney RPG Audio | [kenney.nl/assets/rpg-audio](https://kenney.nl/assets/rpg-audio) | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) |

Kenney's CC0 release is a public-domain dedication: no attribution is required,
but this source and licence record is retained with the game. These effects are
not mixed into the radio catalogue. The radio honours the global mute setting
and has its own stored music-volume setting.
