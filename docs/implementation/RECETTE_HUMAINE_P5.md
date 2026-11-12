# P5 manual acceptance test — to be done by the owner (Chrome and Safari, Mac)

> This acceptance test is **separate from the automated tests**: the Playwright tests drive the mouse by script and do not replace a real trial.

## Result (2026-11-04)

**Acceptance test performed by the owner: OK.** Reported result: "je viens de tout faire, c'est good" (I just did everything, it's good), i.e. the full scenario below in Chrome and Safari, on the local production server (`npm run build && npm run start`, commit `8480fa2`). The detailed grid was not sent: no KO or annoyance was reported.

Estimated duration: 20–30 min per browser (40–60 min if you build the whole 31040 twice).

## 0. Setup (once)

Expected local files (outside the repository, already present on this Mac):
- model: `~/Documents/brick-lab-data/models/31040-1/31040-1.mpd`
- instructions: `~/Documents/brick-lab-data/instructions/31040-1/31040-1_notice_6145903.pdf`
- LDraw library: `~/Documents/brick-lab-data/ldraw` (declared in the worktree's `.env.local`)

Start the **production** server (more representative than dev mode):

```bash
cd ~/Documents/brick-build-worktrees/p5-omr-validation
npm run build
npm run start
```

Then open **http://127.0.0.1:3000** in Chrome, then later in Safari.

Before each browser: start from an empty progress. If the home page lists "Sessions récentes" (Recent sessions) for 31040, import the file then click "Abandonner" (Abandon).

## 1. Controls reminder

| Action | Mouse | Trackpad |
|---|---|---|
| Pick up a part | click the part in the bottom bar | click/tap |
| Place | hover the spot **on a surface** (floor or top of a brick) then click | same (tap or click) |
| Rotate the camera | drag with the left button | one-finger click-drag / three fingers |
| Zoom | wheel | pinch / two fingers |
| Rotate the part by 90° | `R` (`Shift+R` opposite direction) | — |
| Tilt the part a quarter turn around another axis | `X` / `Y` / `Z` (`Shift`: opposite direction) | X / Y / Z − + buttons of the bar at the top of the 3D view |
| Change orientation (part lying down, flipped…) | `O` | — |
| Manual level (fallback) | `PageUp` / `PageDown` (on MacBook: `Fn+↑` / `Fn+↓`); `A` returns to automatic | — |
| Drop the part | `Esc` | — |
| Undo the last placement | "Annuler" (Undo) button or `Cmd+Z` | — |

Visual cue: when the held part is on a valid location, the bar displays **"emplacement trouvé, clic pour poser"** (location found, click to place) and the part snaps exactly.

## 2. Scenario (identical for Chrome then Safari)

| # | Step | Expected |
|---|---|---|
| A1 | Import `31040-1.mpd` ("Importer un modèle" (Import a model)) | 3D render of the jeep in under ~2 s; "65 pièces" (65 parts), "11 étapes" (11 steps), badge "Jouable avec étapes 3D" (Playable with 3D steps), "0 référence manquante" (0 missing references); green line "Inventaire officiel vérifié : 65 pièces…" (Official inventory verified: 65 parts…) |
| A2 | Rotate / zoom the camera | Smooth, no visible stutter |
| B1 | "Commencer — mode guidé" (Start — guided mode) | "Étape 1 / 11" (Step 1 / 11), step locations in translucent blue |
| B2 | Place the parts of **step 1** by hovering the blue ghosts | The part snaps onto the ghost, "emplacement trouvé", the click places it; N/65 counter goes up |
| B3 | Deliberately make a **bad placement** (far away, or wrong rotation) | Clear message ("Trop loin…" (Too far…) or "mauvaise orientation…" (wrong orientation…)), nothing is placed |
| B4 | Continue until at least **step 4** (ideally all 11 steps, 65/65) | Steps advance on their own; parts are placed **on** already placed parts without using PageUp/PageDown |
| B5 | For a part lying down or flipped: use `O` then `R` | The orientation ends up matching; a symmetric part rotated by 180° is accepted |
| B6 | `Annuler` twice | The last two parts disappear, the step goes back if needed |
| B7 | Reload the page (`Cmd+R`) then re-import `31040-1.mpd` | "Progression restaurée : N/65" (Progress restored: N/65), same step, same parts visible |
| C1 | "Abandonner", re-import, "Montage libre (avec notice)" (Free building (with instructions)) | No step indicator; full stock in the bar |
| C2 | "Notice PDF" (Instructions PDF) tab → import `31040-1_notice_6145903.pdf` | Page 1/32 displayed; ◀ ▶ and zoom work; no error message |
| C3 | Follow the instructions page by page and place about ten parts **at different heights** (floor, 1st floor, roof) | The height follows the hovered surface; changing PDF page does not change the 3D |
| C4 | Uncheck/check "Montrer les emplacements" (Show locations) | The ghosts appear/disappear; with ghosts, hovering a ghost snaps the part onto it |
| C5 | Try `PageUp`/`PageDown` then `A` | "Niveau manuel k/n" (Manual level k/n) then "Niveau auto (surface)" (Auto level (surface)) |
| D1 | Throughout the test: browser console (Chrome: `Cmd+Option+J`; Safari: Develop → Show Console) | No repeated red error; note any error |
| D2 | (optional) Import `31009-1.mpd` | Orange warning "Inventaire indéterminé…" (Undetermined inventory…) visible; render OK |

## 3. Results grid to send back to me

Copy this table into your reply and fill it in (OK / KO / comment).

| # | Chrome | Safari | Comment |
|---|---|---|---|
| A1 Import & render | | | |
| A2 Smooth camera | | | |
| B2 Placement on ghosts | | | |
| B3 Bad placement refused | | | |
| B4 Placement on placed parts without PageUp | | | |
| B5 O / R / symmetry | | | |
| B6 Undo | | | |
| B7 Resume after reload | | | |
| C2 Instructions PDF | | | |
| C3 Heights in free building | | | |
| C4 Locations on/off | | | |
| C5 Manual level + A | | | |
| D1 Console errors | | | |
| Full build 65/65? (yes/no, duration) | | | |
| Pleasant to play? (1–5) | | | |
| Annoyances | | | |

Mac / browsers used (versions): …
Mouse or trackpad: …

## 4. After the acceptance test

- Everything OK in both browsers → I can propose the final **GO** for PR #2.
- A KO → I fix on the same branch, rerun the tests, then ask you for a targeted acceptance test again.
