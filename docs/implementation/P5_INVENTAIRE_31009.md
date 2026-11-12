# Inventory of 31009-1 Small Cottage: OMR file against official inventory

**Sources (outside the repository)**: OMR file `31009-1.mpd` (SHA-256 `97b83517…333d`); official inventory on the last pages of booklet 1 of the LEGO instructions (6038244.pdf, pp. 79–80).
**Method**: PDF text extraction (quantity "Nx" + LEGO element number); decoding of the old 6-digit element numbers as *part number + LEGO color code*; LEGO color → LDraw conversion through the `LEGOID` comments of `LDConfig.ldr`. 7-digit numbers cannot be decoded offline: their identification is **visual** (inventory thumbnails rendered at 300%), hence less reliable.

## Totals

| | Official inventory (box) | OMR file |
|---|---|---|
| Parts | 271 | 270 occurrences |
| Lines | 90 elements | 92 part/color pairs |
| File-side classification | — | 258 construction parts, 10 minifig parts, 2 subassemblies (`2429c01` hinges ×2) |

## 1. Verifiable matches (decoded element number)

33 elements / 119 parts decoded:
- **31 identical** to the file (reference, color, quantity);
- **2 proven discrepancies**:

| Element | Part | Color | Inventory | File | Deviation |
|---|---|---|---|---|---|
| 302001 | 3020 Plate 2×4 | white | 4 | 2 | **+2 in the box** |
| 306901 | 3069 Tile 1×2 | white | 6 | 4 (`3069b`) | **+2 in the box** |

Check: none of these parts appears elsewhere in the file in another color. The green `3020` and the dark gray and medium blue `3069b` match their own inventory lines. This is therefore **not** a color error in the file.

## 2. Visual identification (7-digit numbers, 57 elements / 152 parts)

56 elements have an equivalent in the file, with the **same quantity** (excluding minifig, see below) and a shape and color consistent to the eye (e.g. 4199519 → `3958` plate 6×6 blue ×1; 4578094 → `3037` slope 2×4 dark blue ×10; 4211428 → `3622` brick 1×3 light gray ×7; 4611777 → `91405` plate 16×16 light green ×1). Internal ambiguities with no effect on the totals: 4578099 / 4568711 against `3046` / `3038` (dark blue, 4 each), and 4211087 / 4611703 against `88072` (dark gray).

**Minifig**: the box counts 6 elements (assembled legs 4107623, torso with arms and hands 4275813, head, hair, bar holder 48729b, accessory 4520952). The file represents them as **10** occurrences: `3815c01`, `973`, `3818`, `3819`, `3820` ×2, `3626cp8k`, `62810`, `48729b`, `33078`. The difference of 4 is a **difference of representation**, not a missing part.

Arithmetic check: 152 undecoded inventory parts against 155 unmatched occurrences in the file, i.e. 155 − 152 = 3 = +4 (minifig) − 1 (element below).

**No equivalent in the file**: **1 element**, 4211087 ×1, dark gray (brick 1×2 with side element, approximate visual identification).

## 3. Summary

| Item | Parts |
|---|---|
| Box | 271 |
| − elements absent from the file (2 × `3020` white, 2 × `3069` white, 1 × 4211087) | −5 |
| + minifig decomposition (10 occurrences for 6 elements) | +4 |
| **= file** | **270** ✓ |

The gap of 270 against 271 is therefore **entirely localized**: 5 elements of the box do not exist in the file, 4 of them identified with certainty and 1 visually. The minifig representation difference partly compensates.

## 4. What is NOT proven

31009 is a 3-in-1 set: the inventory describes the **contents of the box**, not the parts of the main model alone. The 5 missing elements may be:
- (a) parts that the main model does not use (reserved for alternative models, or spare parts): the file would then be **complete**;
- (b) parts of the main model forgotten by the file: it would then be **incomplete**.

The sum of the quantities announced in the step boxes of booklet 1 (main model) is 267, against 266 element equivalents in the file. But these boxes may contain subassembly multipliers ("2x"), which makes this check **inconclusive**. The steps of booklet 1 that use white 2×4 plates and 1×2 tiles would need to be checked visually.

## Verdict

**UNDETERMINED.** The gap is localized and quantified, but it cannot be proven offline whether these 5 elements belong to the main model. The application displays a **compatibility warning** for this exact file (local registry `src/domain/import/known-validations.ts`, indexed by SHA-256). For 31040: **CONSISTENT** (65/65, 30/30, exact match).
