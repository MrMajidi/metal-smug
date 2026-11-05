# METAL SMUG — a playable game made only of GPT Image 2.6 GIFs

## Concept
A Metal Slug parody mini run-and-gun. Every character and effect on screen is a
looping animated GIF generated in ChatGPT with Images 2.6. The game logic is a
thin vanilla-JS engine that swaps GIF states and moves sprites. One hero:
**SARGE SMUG**, a chibi soldier with an enormous smug grin who has never once
been worried.

## Hero reference (generate FIRST, save as ChatGPT reference image)
Chibi Metal Slug-style soldier, big head, red bandana, sunglasses pushed up on
his forehead, huge self-satisfied smug grin, olive tank top, camo pants,
oversized heavy machine gun, chunky boots. Detailed cartoon/pixel-art hybrid
sprite style, side view facing right.

STYLE BLOCK (append to every generation prompt):
"same character as the reference image, detailed cartoon sprite with pixel-art
flavour, side view facing right, full body, SOLID FLAT MAGENTA background
(#FF00FF), no text, no watermark, looping animated GIF, short loop"

The magenta background is keyed out locally after download; consistency comes
from always using the saved hero reference.

## GIF state list (16)
Hero (folder hero/):
1. idle.gif — standing, breathing, smug grin, occasional thumbs-up
2. run.gif — running cycle to the right, gun in hand
3. shoot.gif — standing, firing the machine gun right, muzzle flashes, shell casings
4. run_shoot.gif — running while firing right
5. jump.gif — jumping arc pose loop (up, hang, down)
6. crouch.gif — crouched, aiming right, smug
7. hit.gif — knocked back, stars circling his head, grin wobbling
8. death.gif — dramatic fall backwards, ghost/star swirl, X X eyes
9. victory.gif — victory dance, thumbs up, huge grin
10. grenade.gif — lobbing a grenade with a smug underarm toss

Enemies & effects (folder enemy/, fx/):
11. grunt_walk.gif — enemy soldier with tiny helmet marching left, nervous face
12. grunt_death.gif — enemy soldier comically exploding into a poof and stars
13. lobber.gif — enemy on a sandbag mound lobbing grenades
14. tank_idle.gif — squat cartoon tank, barrel bobbing, treads idle
15. tank_boom.gif — the tank exploding in a big cartoon fireball
16. explosion.gif — standalone cartoon explosion burst on magenta

Plus one still (not a GIF): bg.png — wide side-scrolling battlefield backdrop,
jungle military base at dusk, Metal Slug mood, empty of characters, 16:9.

## Gameplay (engine spec for the build phase)
- DOM/canvas stage 960×540, battlefield bg, ground line.
- Hero starts left. Move ←/→ (or A/D), jump Space/W/↑, shoot J/Z (hold),
  grenade K/X (limited, arc + explosion), crouch ↓/S.
- Shooting swaps hero GIF to shoot/run_shoot; enemies walk in from the right;
  bullets are small DOM pellets; on hit, enemy swaps to grunt_death then despawns (+100).
- Enemy contact or grenade hit: hero hit.gif, lose 1 of 3 hearts, brief invulnerability.
- 3 waves of grunts + lobbers, then the tank boss (HP bar, slow advance, lobs shells).
- Tank destroyed → tank_boom + victory.gif overlay + score. Hearts gone → death.gif + GAME OVER.
- On-screen touch buttons for mobile. Score, wave banner, mute-able chiptune? (skip audio v1 unless trivial: simple WebAudio bleeps are fine.)
- States are swapped by changing the <img> src; positions are engine-driven.

## Delivery
- Repo: MrMajidi/metal-smug (public), static site, no build step.
- Deploy: Cloudflare Pages (per standing infra rule: live user-facing deploys on Cloudflare).
- README with how it was made + controls.
