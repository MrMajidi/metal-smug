# METAL SMUG — Phase 1 Production Log (Replicate API route)

Route: Replicate API, model `openai/gpt-image-2.6-flare`, quality "medium" for
every call (user's order). GIF generation on this model takes NO input images,
so consistency is prompt-only: hero/character blocks in CHARACTER-BLOCK.md were
used VERBATIM in every prompt, preceded by a per-state line and followed by the
shared suffix (solid flat magenta #FF00FF bg, no text/watermark, seamless loop).
Predictions used: 22 total (18 assets attempted; 4 content-filter failures, of
which 3 were recovered on the single allowed retry with a softened state line —
the character block was never changed).

Note: a service restart mid-run wiped /tmp (including the token env file and
helper scripts); already-downloaded assets in this folder were unaffected, the
helpers were rebuilt, and production resumed. No asset was double-charged.

| # | Asset | File | Format | Frames | Size | Retries | Notes |
|---|-------|------|--------|--------|------|---------|-------|
| 0 | hero master (still) | hero/hero-master.png | PNG 1024×1024 | — | 1,227 KB | 0 | Approved on first pass; source of the HERO BLOCK |
| 1 | idle | hero/idle.gif | GIF 512×512 | 12 @120ms | 826 KB | 0 | Breathing bounce + thumbs-up |
| 2 | run | hero/run.gif | GIF 512×512 | 8 @90ms | 510 KB | 0 | Run cycle |
| 3 | shoot | hero/shoot.gif | GIF 512×512 | 10 @100ms | 698 KB | 1 | First attempt content-flagged (E005); retry with "cartoon spark flashes" wording succeeded — full muzzle flash + casings present |
| 4 | run_shoot | hero/run_shoot.gif | GIF 512×512 | 8 @90ms | 526 KB | 0 | Used softened spark-flash wording from the start |
| 5 | jump | hero/jump.gif | GIF 512×512 | 10 @110ms | 622 KB | 0 | Arc: tuck → hang → land |
| 6 | crouch | hero/crouch.gif | GIF 512×512 | 10 @110ms | 796 KB | 0 | Kneeling aim |
| 7 | hit | hero/hit.gif | GIF 512×512 | 10 @100ms | 644 KB | 0 | Dizzy spiral eyes + circling stars |
| 8 | death | hero/death.gif | GIF 512×512 | 12 @120ms | 796 KB | 0 | Flat on back, X X eyes, stars (ghost/halo not clearly visible in mid-frame) |
| 9 | victory | hero/victory.gif | GIF 512×512 | 12 @110ms | 858 KB | 0 | Fist pump, gun raised |
| 10 | grenade | hero/grenade.gif | GIF 512×512 | 10 @110ms | 697 KB | 0 | Underarm toss pose |
| 11 | grunt_walk | enemy/grunt_walk.gif | GIF 512×512 | 8 @100ms | 418 KB | 0 | Nervous march left, sweat drops |
| 12 | grunt_death | enemy/grunt_death.gif | — | — | — | 2 attempts | **NOT PRODUCED**: content-flagged (E005) on both the original and the softened "pratfall/poof" retry. Flagged per the fail-twice rule. Workaround for the build phase: reuse fx/explosion.gif or tank_boom smoke frames over the grunt, or commission this one asset via a different route. |
| 13 | lobber | enemy/lobber.gif | GIF 512×512 | 10 @120ms | 635 KB | 1 | First attempt flagged (E005); retry with "round green ball" wording succeeded — ball reads as a grenade in flight over the sandbags |
| 14 | tank_idle | enemy/tank_idle.gif | GIF 512×512 | 10 @120ms | 783 KB | 0 | Smug headlight eyes, grille grin, red flag |
| 15 | tank_boom | fx/tank_boom.gif | GIF 512×512 | 12 @110ms | 781 KB | 1 | First attempt flagged (E005); retry as "comical breakdown" succeeded — smoke bloom, flag flying off |
| 16 | explosion | fx/explosion.gif | GIF 512×512 | 10 @100ms | 739 KB | 0 | Fireball with white-hot core, debris, smoke |
| 17 | bg (still) | bg.png | PNG 2048×1152 | — | 4,571 KB | 0 | Jungle base at dusk, watchtower, sandbags, empty of characters |

## QA summary (from locally decoded frames, contact sheets)
- Every GIF verified with PIL: real animated GIF, requested frame count and
  per-frame duration, 512×512, flat magenta corners sampled ≈ (246–252, 2–26,
  241–251) — clean for later chroma keying.
- Hero identity holds across all 10 states (see report verdict).
- No text or watermarks in any frame inspected.
