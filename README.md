# Ceiling Wave Generator

Plan and print a wavy LED ceiling.

Enter room size and wall distance, pick curve size, get wave ceiling plan with every circle centre measured. Live plan on screen, one-page A4 PDF for the ladder.

Live app (private until shared): https://claude.ai/artifact/3LGSk477h8fAav6S9uJmQh

---

## 1. What gets built

Whole ceiling drops **12 cm** as one plasterboard surface. Lit groove runs round it as closed wave, island floats inside perimeter band. LED profile sits centred on groove's top face. Groove width is setting, **10 cm default** (original build: 13 wide, 8 deep).

Build marked out from circle centres: fix point at each centre, swing arc with drilled batten. App exists to produce those centres, radii and distances.

**Coordinates:** origin `(0, 0)` = **bottom-left corner**, X right along length wall, Y **up**. Geometry runs y-down internally (SVG). Every figure shown to user goes through `fy(y) = H - y` — new read-outs must too.

---

## 2. Geometry

### 2.1 Principle

Loop = circular arcs, **all one radius `R`**, meeting tangentially. Neighbour arcs curve opposite ways, so centres sit exactly `2R` apart and meet at midpoint of line joining them. Consequences:

1. Centres form closed equilateral polygon, every side `2R`.
2. Each arc runs between midpoints of two polygon sides at its centre — no join table needed.
3. **On-site check = one number.** Every neighbouring pair of centres `2R` apart → loop closes, no kink.

- **Lobe** (`'L'`) — bulges out towards wall. Centre inside loop. Inner radius `R − groove`.
- **Tuck** (`'T'`) — pulls in towards room. Centre outside loop. Inner radius `R + groove`.

### 2.2 Corner lobes, any size — `ringCorner(gh, gv, R)` (default)

Lobes in all four corners; each wall carries **as many lobe/tuck waves as fit at chosen radius**. Bigger ceiling → more waves, not bigger circles.

```
xL..xR = gh+R .. W-gh-R        lobe line along the top and bottom walls
yT..yB = gv+R .. H-gv-R        lobe line along the left and right walls
nx = waveCount(xR-xL, R)       intervals along top/bottom; ny likewise
s  = span / n                  lobe spacing on that wall
h  = sqrt(4R^2 - s^2/4)        tuck: midway between two lobes, h towards the wall
```

`waveCount` rounds `span / (3.6 R)` (`PITCH`), min 1, adds waves until `s < 3.95 R` (`PITCH_MAX`) — at `s = 4R` tuck can't be `2R` from both lobes. 3.6 matches owner's reference sketch: 355 × 228 → 2 × 1 waves, 12 centres. Centre count `4 (nx + ny)`.

Each `V` entry `[x, y, kind, group, nX, nY]`; `(nX, nY)` = outward wall normal, used by `arcs()` and label placement instead of "away from room centre" (wrong on long walls). `ring` also returns `groups`, `dimX/dimY` (wall-gap callouts), `depths` (tuck depth lines), `wide`, `islandW/islandH`, `nx/ny`.

### 2.3 Classic twelve-arc ring — `ringClassic(gh, gv, R)` (**Tucks** switch)

Original approved shape: lobes at ends and sides, tucks in corners and mid long sides. Closed form:

```
p  = HW - gh - R          x-offset of the end-lobe centre (sits on the X axis)
r2 = HH - gv - R          y-offset of the side-lobe centres
r1 = min(0.552p, 1.9R)    x-offset of the side-lobe centres   [free parameter]

V1 = (CX + p,  CY)        end lobe
V3 = (CX + r1, CY - r2)   side lobe
V2 = intersection of two circles of radius 2R about V1 and V3,
     taking whichever of the two is FURTHER from the room centre   (corner tuck)
s  = r2 + sqrt(4R^2 - r1^2)
V4 = (CX, CY - s)         mid tuck, on the Y axis
```

One quarter, mirrored ×4 → 12 centres. `r1` only free knob (`0.552p` reproduces approved shape; `1.9R` keeps sqrt real). Won't stretch past ~**3 : 1** — page refuses, reports longest length that fits.

Original approved build (355 × 227, gaps 35/35, R 40, Tucks): outer 7.48 m, batten holes 27/40/53.

### 2.4 Failure

`ring` returns `{bad: message}` when geometry collapses (lobe line ≤ 2–4 cm, circles can't reach, island pinches shut). Callers check `.bad` first, then `degenerate()` — rejects self-crossing loops (tuck sweep ≥ 175° or lobe ≥ 250°).

---

## 3. What page shows

- **Plan:** outer edge (solid), inner edge (dashed), centres (filled = lobe, hollow = tuck; off-ceiling centres in `--warn-line`), hover/click tooltip with `(x, y)`.
- **Wall gap** marked at top-left corner lobe (`dimX/dimY`).
- **Tuck depths:** line from wall through tuck centre to deepest point of solid line, labelled (`rg.depths`, `depthMarks()`). Corner shape: one top/bottom + one left/right tuck; classic: mid tuck.
- **Card pinned top-left of plan** (`.readout`): **Ceiling area** (`#areaLabel`) and **wave profile length**, one below the other (outer edge, `#profileLen`: `len(o)` = Σ `radius × sweep` of drawn outer arcs, in m).
- **Save PDF** pinned top-right (`#print.pdfbtn`).
- **Legend** under caption, inside SVG (`legend()`), shrinks to fit.

Sidebar: room size, wall distances (+ same-distance toggle), Corners Lobes/Tucks, radius, groove width, presets (with pinned **Approved plan**).

**Approved plan** = `DEF`: 355 × 228, gap 18/18, R 40, groove 10, corner lobes. First-visit default + undeletable top preset. Gives profile 10.39 m, tuck depths 44.8 / 40.9 cm.

---

## 4. Rules — do not break

1. **Every lobe sits exactly requested distance from its wall.** Verify by sampling drawn path (§8), not by reading params.
2. **Every neighbouring centre pair stays `2R` apart.** On-site check depends on it.
3. **Never hard-code centre count.** 12 only in classic; corner = `4 (nx + ny)`. Read from `rg.V`.
4. **`ring()` + `degenerate()`, always both.**
5. **Read-outs come from drawn arcs**, never construction params.
6. **Page, PDF and print sheet** are separate renderers of same geometry — change one, change others.

`ensureValid()` on room change: current numbers work → nothing. Else pull **radius** into `radiusRange()`. Only if no radius works, shrink **both distances** (×0.85 … ×0.1, never below slider min). Radius first, distances last.

---

## 5. Code

```
index.html   markup only; every SVG group is filled by JS
style.css    theme tokens, two-pane shell, components, print sheet
app.js       everything else — one IIFE, no dependencies
```

No build step. Only external request: Google Fonts (offline falls back to system fonts).

Main path: `setRoom` → `retuneControls` + `buildChrome` (static layer). Any control → `render(save)` → `draw(gh, gv, R)` → `ring` → `arcs(rg, 0)` outer / `arcs(rg, groove)` inner → SVG, dims, profile → `buildPrint`. PDF built on demand from `lastDraw`.

**Scale `u`** = `max(W,H) / 355`. SVG works in cm; every on-screen stroke/font/marker is multiple of `u` so drawing looks same at any size. Print sheet uses own `k` (same def); PDF sizes text in points.

**`index.html` contract** — `app.js` addresses IDs directly, throws if renamed:
- Controls: `roomW roomH swap gh ghNum ghMax ghHint gv gvNum gvMax gvHint rad radNum radMin radMax grv grvNum link patCorner patClassic print reset approvedInfo pname save presets phint`
- Read-outs: `areaLabel profile profileLen`
- SVG groups, paint order = z-order: `grid roomFill band axes roomOutline inner outer screws dims origin chrome msg tip` (`band` under edges, `tip` last)
- Print: `printsheet pspec psvg ptables pfoot`, plus `<style id="pagestyle">` for `@page`

Layout: `.app` grid `392px minmax(0,1fr)`; `.side` scrolls, `.stage` pinned (no `min-width` on SVG — brings scrolling back). Below 1000 px panes stack. Theme tokens on `:root`, dark under `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`; scrollbars themed.

---

## 6. PDF

**Save PDF** writes real one-page A4 PDF in browser, **no library, no network** (`buildPDF`).

- Fonts: base-14 `Courier` / `Courier-Bold`, nothing embedded. `pdfEsc()` strips non-ASCII (`·`→`-`, `×`→`x`, `°`→` deg`).
- Arcs → cubic Béziers ≤ 90° each, `k = 4/3 × tan(Δ/4)` (`arcOps`, `loopOps`).
- `T(x, y)` maps cm → points, flips Y. Landscape when `W >= H`. Spec strip shrinks to fit page.
- Hand-built xref, latin1 string → `Uint8Array`.

Sheet: spec strip (ceiling, radius, inner radii, wall gap, wave profile); grid + rulers; origin bottom-left; loop; each centre labelled with coords; wall gap + tuck depth dims; two footnote lines.

**Label placement** (`placeLabels`, shared with print sheet): tries 8 positions round each centre at 1, 1.9, 2.8, 4, 5.5 × gap, preferred side first (lobes in, tucks out). Takes first box crossing nothing — frame, loops, dots, labels, rulers, dims, origin. Far labels get leader line. `fitLabels` starts 8 pt, steps down to 5.5 pt only if needed.

**Why not `window.print()`:** artifact runs in sandboxed iframe without `allow-modals`, print silently ignored. So:
- in artifact → `downloads` capability (`claude.use('downloads')`, `save({filename, data})`). claude.ai shows own confirm dialog; can't be skipped, can't open Windows viewer.
- standalone → Blob + `<a download>`.

**Print sheet** (`@media print`, Ctrl+P): fallback, black on white. SVG height capped in `#pagestyle` or it spills to page 2.

---

## 7. Stored state

Per-browser `localStorage`, every access in `try/catch`. Old keys `waveExplorerV3` / `waveExplorerPresets` copied to new ones on first load (old left alone).

| Key | Holds |
|---|---|
| `ceilingWaveState` | `W, H, gh, gv, R, linked, cornerLobes, groove` (missing `cornerLobes` → lobes, missing `groove` → 10) |
| `ceilingWavePresets` | JSON `{name, w, h, gh, gv, r, pat, g}`; `pat` `'corner'`/`'classic'`. Old presets: no size → 355 × 227, no `pat` → classic, no `g` → 13 (`LEGACY`) |

---

## 8. Run and test

```sh
python -m http.server 8080
# then open http://localhost:8080
```

`file://` works but may block `localStorage` (presets).

**Check that matters** — sample drawn path, every local minimum of wall distance must equal requested gap:

```js
const outer = document.getElementById('outer');
const L = outer.getTotalLength(), d = [];
for (let i = 0; i <= 1200; i++) {
  const p = outer.getPointAtLength(L * i / 1200);
  d.push(Math.min(p.x, W - p.x, p.y, H - p.y));
}
// collect the local minima of d — they should all equal the requested gap
```

One distinct value = correct. Check PDFs by rendering them, not reading code.

**Traps:**
- Synthetic events skip hit-testing — use `page.mouse.move()`.
- `emulateMedia({media:'screen'})` before `page.pdf()` puts whole UI in PDF.
- Check both themes; SVG children don't inherit component styles (tooltip has own `--tip-*` tokens).
- Quote SVG attributes: `stroke-width=1.2/>` swallows slash.

---

## 9. Tried and rejected

- Quarter-turn pattern selector: rotation exact but fits few radii; closed form strands lobes (15 vs 41 cm); proper Newton solver worked but broke fixed 12-centre count. Superseded by corner-lobe shape.
- Four-different-radii loop (20 centres) — didn't match reference photo.
- Screws wording, dashed centre polygon, stats panel, centre table, off-ceiling text warning — removed by owner.

---

## 10. Publishing to artifact

Artifact runtime supplies own `<!doctype>`/`<head>`/`<body>`: publish `index.html` with skeleton stripped (keep `<title>`, fonts link, `style.css` link, body, `<script src="app.js">`), plus `style.css` and `app.js` via `files`, to existing URL above so it updates in place. `downloads` capability stored on artifact, carries forward on republish.
