/* Ceiling Wave Generator - plan and print a wavy LED ceiling
   ---------------------------------------------------------------------------
   WHAT GETS BUILT
   The whole ceiling drops 12 cm as one plasterboard surface. A lit groove
   (width = the groove control, 10 cm default) runs round it as a closed wave;
   the LED profile sits centred on the groove's top face. It is marked out on
   site from circle centres: a fix point at each centre, an arc swung with a
   drilled batten. This page exists to produce those centres, radii and
   distances.

   COORDINATES
   Origin (0, 0) is the bottom-left corner, X right along the length wall,
   Y up. Geometry runs y-down internally (SVG); every figure shown to the user
   goes through fy(y) = H - y - new read-outs must too.

   PRINCIPLE
   The loop is circular arcs that all share one radius R and meet tangentially.
   Neighbouring arcs curve opposite ways, so their centres sit exactly 2R apart
   and meet at the midpoint of the line joining them. So:
     1. the centres form a closed equilateral polygon, every side 2R;
     2. each arc runs between the midpoints of the two polygon sides at its
        centre - no join table needed;
     3. the on-site check is one number: every neighbouring pair of centres
        2R apart means the loop closes with no kink.
   Lobe ('L') bulges out towards the wall, centre inside the loop, inner
   radius R - groove. Tuck ('T') pulls in, centre outside, inner R + groove.
   Two arrangements: ringCorner (default) and ringClassic (Tucks switch).

   RULES - DO NOT BREAK
     1. Every lobe sits exactly the requested distance from its wall. Verify by
        sampling the drawn path (see TESTING), not by reading params.
     2. Every neighbouring centre pair stays 2R apart.
     3. Never hard-code the centre count: 12 only in classic, 4 (nx + ny) in
        corner. Read it from rg.V.
     4. ring() and degenerate(), always both. Check .bad first.
     5. Read-outs come from the drawn arcs, never construction params.
     6. Page, PDF and print sheet are separate renderers of the same geometry -
        change one, change the others.

   MAIN PATH
   setRoom -> retuneControls + buildChrome (static layer). Any control ->
   render(save) -> draw(gh, gv, R) -> ring -> arcs(rg, 0) outer /
   arcs(rg, groove) inner -> SVG, dims, profile -> buildPrint. The PDF is
   built on demand from lastDraw.
   Scale u = max(W, H) / 355: the SVG works in cm and every on-screen stroke,
   font and marker is a multiple of u, so the drawing looks the same at any
   size. The print sheet uses its own k (same definition); the PDF sizes text
   in points.

   FILES
   index.html  markup only; every SVG group is filled from here. IDs are
               addressed directly - see the contract comment in index.html.
   style.css   theme tokens, two-pane shell, components, print sheet.
   app.js      everything else - one IIFE, no dependencies, no build step.
               Only external request: Google Fonts.

   TESTING
   Serve with `python -m http.server 8080` (file:// may block localStorage).
   The check that matters - sample the drawn path; every local minimum of the
   wall distance must equal the requested gap (one distinct value = correct):
     var outer = document.getElementById('outer'), L = outer.getTotalLength();
     for (var i = 0; i <= 1200; i++) {
       var p = outer.getPointAtLength(L * i / 1200);
       d.push(Math.min(p.x, W - p.x, p.y, H - p.y));
     }
   Check PDFs by rendering them, not by reading code. Traps: synthetic events
   skip hit-testing (use page.mouse.move()); emulateMedia({media:'screen'})
   before page.pdf() puts the whole UI in the PDF; check both themes - SVG
   children don't inherit component styles (the tooltip has its own --tip-*
   tokens); quote SVG attributes (stroke-width=1.2/> swallows the slash).

   PUBLISHING TO THE ARTIFACT
   The artifact runtime supplies its own doctype/head/body: publish index.html
   with the skeleton stripped (keep <title>, the fonts link, the style.css
   link, the body and <script src="app.js">), plus style.css and app.js as
   files, to the existing URL so it updates in place. The `downloads`
   capability is stored on the artifact and carries forward on republish.

   TRIED AND REJECTED
   - Quarter-turn pattern selector: rotation exact but fits few radii; the
     closed form strands lobes (15 vs 41 cm); a Newton solver worked but broke
     the fixed 12-centre count. Superseded by the corner-lobe shape.
   - Four-different-radii loop (20 centres) - didn't match the reference photo.
   - Screws wording, dashed centre polygon, stats panel, centre table,
     off-ceiling text warning - removed by the owner.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var groove = 10;                                     // outer edge to inner edge, cm - set by the groove control
  // the approved plan: restored by the pinned preset, and the first-visit default
  var DEF = { w: 355, h: 228, gh: 18, gv: 18, r: 40, pat: 'corner', g: 10 };
  var LEGACY = { w: 355, h: 227, g: 13 };              // for old presets saved without these
  // Per-browser storage, every access in try/catch.
  //   ceilingWaveState    {W, H, gh, gv, R, linked, cornerLobes, groove}
  //                       (missing cornerLobes -> lobes, missing groove -> 10)
  //   ceilingWavePresets  [{name, w, h, gh, gv, r, pat: 'corner'|'classic', g}]
  //                       (old presets: no size -> LEGACY, no pat -> classic,
  //                       no g -> LEGACY.g)
  var LS_STATE = 'ceilingWaveState', LS_PRESETS = 'ceilingWavePresets';
  // Keys from before the rename. Read once, copied to the new keys on first
  // load so saved state and presets survive; the old entries are left alone.
  try {
    [['waveExplorerV3', LS_STATE], ['waveExplorerPresets', LS_PRESETS]].forEach(function (k) {
      var old = localStorage.getItem(k[0]);
      if (old !== null && localStorage.getItem(k[1]) === null) localStorage.setItem(k[1], old);
    });
  } catch (e) {}

  // room, recomputed whenever the dimensions change
  var W, H, HW, HH, CX, CY, u, gridStep, VB;

  // ---- elements ------------------------------------------------------------
  var $ = function (id) { return document.getElementById(id); };
  var svgEl = $('svg'), gridEl = $('grid'), roomFill = $('roomFill'), roomOutline = $('roomOutline'),
      axesEl = $('axes'), bandEl = $('band'), innerEl = $('inner'), outerEl = $('outer'),
      screwsEl = $('screws'), dimsEl = $('dims'), originEl = $('origin'), chromeEl = $('chrome'),
      msgEl = $('msg'), tipEl = $('tip');
  var profileEl = $('profile');
  var ghEl = $('gh'), gvEl = $('gv'), radEl = $('rad');
  var ghNum = $('ghNum'), gvNum = $('gvNum'), radNum = $('radNum');
  var roomW = $('roomW'), roomH = $('roomH'), linkEl = $('link');
  var grvEl = $('grv'), grvNum = $('grvNum');

  var f1 = function (v) { return (Math.round(v * 10) / 10).toFixed(1); };
  // The geometry runs y-down, as SVG does. Everything shown to the user is in
  // the real coordinate system - origin bottom-left, Y up - via this.
  var fy = function (y) { return f1(H - y); };
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  // ---- room ----------------------------------------------------------------
  function setVars(w, h) { W = w; H = h; HW = W / 2; HH = H / 2; CX = HW; CY = HH; }
  function setRoom(w, h) {
    setVars(w, h);
    u = Math.max(W, H) / 355;                       // everything drawn scales with this
    var steps = [10, 20, 25, 50, 100, 200];
    gridStep = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) {
      if (Math.max(W, H) / steps[i] <= 20) { gridStep = steps[i]; break; }
    }
    var ml = 58 * u, mt = 48 * u, mr = 58 * u, mb = 64 * u;   // bottom: caption + legend
    VB = { x: -ml, y: -mt, w: W + ml + mr, h: H + mt + mb };
    svgEl.setAttribute('viewBox', VB.x + ' ' + VB.y + ' ' + VB.w + ' ' + VB.h);
    retuneControls();
    buildChrome();
  }

  // slider ranges have to follow the room, or a small ceiling offers
  // distances and radii that cannot possibly fit
  function retuneControls() {
    var small = Math.min(HW, HH);
    var gapMax = Math.max(10, Math.round(small * 0.5));
    var radMax = Math.max(20, Math.round(small * 0.75));
    var radMin = Math.max(groove + 4, Math.round(small * 0.08));
    // the wave shape adds waves instead of needing bigger circles, so small
    // radii stay available however big the room is
    if (pattern === 'corner') radMin = groove + 4;
    [ghEl, ghNum, gvEl, gvNum].forEach(function (el) { el.max = gapMax; });
    [radEl, radNum].forEach(function (el) { el.max = radMax; el.min = radMin; });
    ghEl.value = clamp(+ghEl.value, ghEl); gvEl.value = clamp(+gvEl.value, gvEl);
    radEl.value = clamp(+radEl.value, radEl);
    $('ghMax').textContent = gapMax;
    $('gvMax').textContent = gapMax;
    $('radMin').textContent = radMin + ' — tight';
    $('radMax').textContent = radMax + ' — lazy';
    $('ghHint').textContent = 'from the ' + H + ' walls';
    $('gvHint').textContent = 'from the ' + W + ' walls';
    $('areaLabel').textContent = (W * H / 10000).toFixed(2) + ' m²';
  }

  // ---- static parts of the drawing ----------------------------------------
  function buildChrome() {
    var g = '';
    for (var x = 0; x <= W; x += gridStep) g += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '"/>';
    for (var y = H; y >= 0; y -= gridStep) g += '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '"/>';
    gridEl.innerHTML = g;
    gridEl.setAttribute('stroke', 'var(--rule-soft)');
    gridEl.setAttribute('stroke-width', 0.35 * u);

    [roomFill, roomOutline].forEach(function (r) {
      r.setAttribute('x', 0); r.setAttribute('y', 0);
      r.setAttribute('width', W); r.setAttribute('height', H);
    });
    roomFill.setAttribute('fill', 'var(--drop)');
    roomOutline.setAttribute('stroke', 'var(--ink)');
    roomOutline.setAttribute('stroke-width', 1.4 * u);

    axesEl.innerHTML =
      '<line x1="' + CX + '" y1="' + (-8 * u) + '" x2="' + CX + '" y2="' + (H + 8 * u) + '"/>' +
      '<line x1="' + (-8 * u) + '" y1="' + CY + '" x2="' + (W + 8 * u) + '" y2="' + CY + '"/>';
    axesEl.setAttribute('stroke', 'var(--ink-3)');
    axesEl.setAttribute('stroke-width', 0.4 * u);
    axesEl.setAttribute('stroke-dasharray', (10 * u) + ' ' + (3 * u) + ' ' + (2 * u) + ' ' + (3 * u));

    innerEl.setAttribute('stroke', 'var(--led)');
    innerEl.setAttribute('stroke-width', 1.5 * u);
    outerEl.setAttribute('stroke', 'var(--edge)');
    outerEl.setAttribute('stroke-width', 2.1 * u);
    bandEl.setAttribute('fill', 'var(--led-fill)');
    msgEl.setAttribute('x', CX);
    msgEl.setAttribute('y', CY);
    msgEl.setAttribute('font-size', 11 * u);
    msgEl.setAttribute('fill', 'var(--edge)');

    // origin in the bottom-left corner, X to the right, Y up
    var a = 36 * u, head = 2.6 * u, tipLen = 40 * u;
    originEl.innerHTML =
      '<line x1="' + (4 * u) + '" y1="' + H + '" x2="' + a + '" y2="' + H + '" stroke="var(--ink)" stroke-width="' + (1.2 * u) + '"/>' +
      '<polygon points="' + tipLen + ',' + H + ' ' + (33 * u) + ',' + (H - head) + ' ' + (33 * u) + ',' + (H + head) + '" fill="var(--ink)"/>' +
      '<text x="' + (45 * u) + '" y="' + (H + 10 * u) + '" font-size="' + (8 * u) + '" font-weight="600" fill="var(--ink)">X</text>' +
      '<line x1="0" y1="' + (H - 4 * u) + '" x2="0" y2="' + (H - a) + '" stroke="var(--ink)" stroke-width="' + (1.2 * u) + '"/>' +
      '<polygon points="0,' + (H - tipLen) + ' ' + (-head) + ',' + (H - 33 * u) + ' ' + head + ',' + (H - 33 * u) + '" fill="var(--ink)"/>' +
      '<text x="' + (-6 * u) + '" y="' + (H - 40 * u) + '" font-size="' + (8 * u) + '" font-weight="600" fill="var(--ink)" text-anchor="end">Y</text>' +
      '<circle cx="0" cy="' + H + '" r="' + (3.1 * u) + '" fill="var(--ink)"/>' +
      '<text x="' + (-6 * u) + '" y="' + (H + 12 * u) + '" font-size="' + (8.5 * u) + '" font-weight="600" fill="var(--ink)" text-anchor="end">(0, 0)</text>';

    chromeEl.innerHTML =
      '<text x="' + CX + '" y="' + (-34 * u) + '" font-size="' + (7.5 * u) + '" fill="var(--ink-2)" text-anchor="middle" letter-spacing="' + (1.4 * u) + '">' + W + ' cm</text>' +
      '<text x="' + (-16 * u) + '" y="' + CY + '" font-size="' + (7.5 * u) + '" fill="var(--ink-2)" text-anchor="middle" letter-spacing="' + (1.4 * u) + '" transform="rotate(-90 ' + (-16 * u) + ' ' + CY + ')">' + H + ' cm</text>' +
      '<text x="' + CX + '" y="' + (H + 32 * u) + '" font-size="' + captionSize() + '" fill="var(--ink-3)" text-anchor="middle">' + caption() + '</text>' +
      legend(H + 47 * u);
  }
  function caption() {
    return 'grid squares = ' + gridStep + ' cm · all figures cm · dots are the circle centres';
  }
  // one centred row under the caption: two line swatches, two dot markers
  function legend(y) {
    var items = [['line', 'var(--edge)', 'outer edge of the groove'], ['line', 'var(--led)', 'inner edge · ' + groove + ' cm in'],
                 ['fill', 'var(--edge)', 'lobe centre'], ['ring', 'var(--edge)', 'tuck centre']];
    // width of the row per unit of font size, so it can shrink to fit a narrow drawing
    var unit = items.reduce(function (a, it) { return a + 2.2 + 0.8 + it[2].length * 0.6; }, 0) + 2.4 * (items.length - 1);
    var fs = Math.min(captionSize(), (VB.w - 16 * u) / unit);
    var cw = fs * 0.6, sw = fs * 2.2, gap = fs * 0.8, sep = fs * 2.4;
    var widths = items.map(function (it) { return sw + gap + it[2].length * cw; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + sep * (items.length - 1);
    var x = CX - total / 2, out = '';
    items.forEach(function (it, i) {
      var cy = y - fs * 0.35;
      if (it[0] === 'line')
        out += '<line x1="' + x + '" y1="' + cy + '" x2="' + (x + sw) + '" y2="' + cy + '" stroke="' + it[1] + '" stroke-width="' + (fs * 0.32) + '"/>';
      else
        out += '<circle cx="' + (x + sw / 2) + '" cy="' + cy + '" r="' + (fs * 0.42) + '" fill="' + (it[0] === 'fill' ? it[1] : 'var(--card)') +
               '" stroke="' + it[1] + '" stroke-width="' + (fs * 0.16) + '"/>';
      out += '<text x="' + (x + sw + gap) + '" y="' + y + '" font-size="' + fs + '" fill="var(--ink-2)">' + it[2] + '</text>';
      x += widths[i] + sep;
    });
    return out;
  }
  function captionSize() {
    // keep it inside the drawing however narrow the ceiling is
    return Math.min(6.5 * u, (VB.w - 16 * u) / (caption().length * 0.62));
  }

  // ---- geometry ------------------------------------------------------------
  // Two arrangements of equal arcs:
  //   'corner'  - lobes push out into the four corners, and each wall carries
  //               as many lobe/tuck waves as fit at this radius, so a bigger
  //               ceiling gets more waves, not bigger circles
  //   'classic' - the approved plan, always twelve arcs: lobes at the ends and
  //               along the sides, tucks in the corners and mid long sides
  var pattern = 'corner';
  function ring(gh, gv, R) { return pattern === 'corner' ? ringCorner(gh, gv, R) : ringClassic(gh, gv, R); }

  // Lobe spacing along a wall, in radii. 3.6 gives the look of the reference
  // (tucks roughly one radius deep); it must stay under 4, where neighbouring
  // lobes can no longer both be 2R from the tuck between them.
  var PITCH = 3.6, PITCH_MAX = 3.95;
  function waveCount(L, R) {
    var n = Math.max(1, Math.round(L / (PITCH * R)));
    while (L / n >= PITCH_MAX * R) n++;
    return n;
  }

  // Every lobe centre sits `gap + R` in from its wall, so every lobe lands
  // exactly on the wall line - corner lobes on both of theirs. Along a wall the
  // lobe centres are evenly spaced `s` apart on that line, and each tuck sits
  // midway between two lobes, pushed towards the wall by sqrt(4R^2 - s^2/4):
  // the one point 2R from both. The loop closes by construction.
  //   xL..xR = gh+R .. W-gh-R    lobe line along the top and bottom walls
  //   yT..yB = gv+R .. H-gv-R    lobe line along the left and right walls
  //   nx, ny                     lobe-to-lobe intervals along each wall
  function ringCorner(gh, gv, R) {
    var xL = gh + R, xR = W - gh - R, yT = gv + R, yB = H - gv - R;
    if (xR - xL <= 4 || yB - yT <= 4) return { bad: 'The circles are too big for this band — lower the radius.' };
    var nx = waveCount(xR - xL, R), ny = waveCount(yB - yT, R);
    var sx = (xR - xL) / nx, sy = (yB - yT) / ny;
    var hx = Math.sqrt(4 * R * R - sx * sx / 4), hy = Math.sqrt(4 * R * R - sy * sy / 4);
    // the inner edges of opposite tucks must not meet across the island
    if (yT - hx + R + groove > CY - 3 || xL - hy + R + groove > CX - 3)
      return { bad: 'The island pinches shut — lower the radius.' };

    var CL = 'Corner lobes', TBL = 'Top & bottom lobes', LRL = 'Left & right lobes',
        TBT = 'Top & bottom tucks', LRT = 'Left & right tucks';
    var S = Math.SQRT1_2, V = [], i, j;
    // [x, y, kind, group, outward normal x, outward normal y]
    var lobe = function (x, y, nX, nY, g) { V.push([x, y, 'L', g, nX, nY]); };
    var tuck = function (x, y, nX, nY, g) { V.push([x, y, 'T', g, nX, nY]); };
    var X = function (k) { return xL + k * sx; }, Y = function (k) { return yT + k * sy; };

    lobe(xR, yT, S, -S, CL);                                            // top right, then leftwards
    for (i = nx - 1; i >= 0; i--) {
      tuck((X(i) + X(i + 1)) / 2, yT - hx, 0, -1, TBT);
      if (i) lobe(X(i), yT, 0, -1, TBL); else lobe(xL, yT, -S, -S, CL);
    }
    for (j = 0; j < ny; j++) {                                           // left wall, downwards
      tuck(xL - hy, (Y(j) + Y(j + 1)) / 2, -1, 0, LRT);
      if (j < ny - 1) lobe(xL, Y(j + 1), -1, 0, LRL); else lobe(xL, yB, -S, S, CL);
    }
    for (i = 0; i < nx; i++) {                                           // bottom wall, rightwards
      tuck((X(i) + X(i + 1)) / 2, yB + hx, 0, 1, TBT);
      if (i < nx - 1) lobe(X(i + 1), yB, 0, 1, TBL); else lobe(xR, yB, S, S, CL);
    }
    for (j = ny - 1; j >= 0; j--) {                                      // right wall, upwards
      tuck(xR + hy, (Y(j) + Y(j + 1)) / 2, 1, 0, LRT);
      if (j) lobe(xR, Y(j), 1, 0, LRL);                                  // j = 0 is the start
    }

    return {
      R: R, gh: gh, gv: gv, nx: nx, ny: ny,
      groups: [CL, TBL, LRL, TBT, LRT],
      dimX: xL, dimY: yT,                                  // top-left corner lobe touches both walls there
      // tuck depth: wall to the solid line's deepest point, through the tuck centre
      depths: [[(X(0) + X(1)) / 2, 0, (X(0) + X(1)) / 2, yT - hx + R],
               [0, (Y(0) + Y(1)) / 2, xL - hy + R, (Y(0) + Y(1)) / 2]],
      wide: Math.max(yT - hx + R, xL - hy + R),
      islandW: W - 2 * gh - 2 * groove, islandH: H - 2 * gv - 2 * groove,
      V: V
    };
  }

  // The original approved shape, twelve centres in closed form. One quarter
  // is built, then mirrored x4:
  //   p  = W/2 - gh - R        x-offset of the end-lobe centre (on the X axis)
  //   r2 = H/2 - gv - R        y-offset of the side-lobe centres
  //   r1 = min(0.552p, 1.9R)   x-offset of the side-lobe centres
  //   V1 = (CX + p, CY)        end lobe
  //   V3 = (CX + r1, CY - r2)  side lobe
  //   V2 = intersection of the circles of radius 2R about V1 and V3, the one
  //        FURTHER from the room centre                        (corner tuck)
  //   s  = r2 + sqrt(4R^2 - r1^2);  V4 = (CX, CY - s)          (mid tuck)
  // r1 is the only free knob: 0.552p reproduces the approved shape, 1.9R keeps
  // the sqrt real. It won't stretch past about 3 : 1 - the page refuses and
  // reports the longest length that fits (longestFor).
  // Original build (355 x 227, gaps 35/35, R 40): outer 7.48 m, batten holes
  // 27/40/53.
  function ringClassic(gh, gv, R) {
    var p = HW - gh - R, r2 = HH - gv - R;
    if (p <= 2 || r2 <= 2) return { bad: 'The circles are too big for this band — lower the radius.' };
    var r1 = Math.min(0.552 * p, 1.9 * R);
    var V1 = [CX + p, CY], V3 = [CX + r1, CY - r2];
    var dx = V3[0] - V1[0], dy = V3[1] - V1[1], d = Math.hypot(dx, dy);
    if (d > 4 * R || d === 0) return { bad: 'No loop fits these numbers — raise the radius.' };
    var h = Math.sqrt(4 * R * R - d * d / 4);
    var mx = (V1[0] + V3[0]) / 2, my = (V1[1] + V3[1]) / 2, nx = -dy / d, ny = dx / d;
    var A = [mx + h * nx, my + h * ny], B = [mx - h * nx, my - h * ny];
    var V2 = (Math.hypot(A[0] - CX, A[1] - CY) > Math.hypot(B[0] - CX, B[1] - CY)) ? A : B;
    var under = 4 * R * R - r1 * r1;
    if (under < 0) return { bad: 'No loop fits these numbers — raise the radius.' };
    var s = r2 + Math.sqrt(under);
    var q1 = V2[0] - CX, q2 = CY - V2[1];
    var EL = 'End lobes', SL = 'Side lobes', CT = 'Corner tucks', MT = 'Mid tucks';
    return {
      R: R, gh: gh, gv: gv, p: p, r1: r1, r2: r2, s: s,
      groups: [EL, SL, CT, MT],
      dimX: CX + r1, dimY: CY,
      depths: [[CX, 0, CX, CY - s + R]],
      wide: CY - s + R,
      islandW: 2 * (p + R) - 2 * groove, islandH: 2 * (r2 + R) - 2 * groove,
      V: [[CX + p, CY, 'L', EL], [CX + q1, CY - q2, 'T', CT], [CX + r1, CY - r2, 'L', SL], [CX, CY - s, 'T', MT],
          [CX - r1, CY - r2, 'L', SL], [CX - q1, CY - q2, 'T', CT], [CX - p, CY, 'L', EL], [CX - q1, CY + q2, 'T', CT],
          [CX - r1, CY + r2, 'L', SL], [CX, CY + s, 'T', MT], [CX + r1, CY + r2, 'L', SL], [CX + q1, CY + q2, 'T', CT]]
    };
  }
  function norm(a) { var x = a; while (x < 0) x += TAU; while (x >= TAU) x -= TAU; return x; }

  // Centres -> drawable arcs. Each arc ends at the midpoints to its two
  // neighbours (that is where tangency puts the join), and `off` is how far the
  // edge sits inside the groove: 0 for the outer edge, groove for the inner.
  // Which way round the circle to travel is decided by asking whether the CCW
  // sweep passes the direction the arc is supposed to bulge - outwards for a
  // lobe, inwards for a tuck.
  function arcs(rg, off) {
    var V = rg.V, n = V.length, out = [];
    for (var i = 0; i < n; i++) {
      var P = V[i], A = V[(i - 1 + n) % n], B = V[(i + 1) % n];
      var rad = P[2] === 'L' ? rg.R - off : rg.R + off;
      var mA = [(P[0] + A[0]) / 2, (P[1] + A[1]) / 2], mB = [(P[0] + B[0]) / 2, (P[1] + B[1]) / 2];
      var aA = Math.atan2(mA[1] - P[1], mA[0] - P[0]), aB = Math.atan2(mB[1] - P[1], mB[0] - P[0]);
      // outward direction: the vertex's own wall normal when it carries one,
      // otherwise away from the room centre
      var wx = P.length > 4 ? P[4] : P[0] - CX, wy = P.length > 4 ? P[5] : P[1] - CY;
      var wl = Math.hypot(wx, wy) || 1, sg = P[2] === 'L' ? 1 : -1;
      var aT = Math.atan2(sg * wy / wl, sg * wx / wl);
      var dccw = norm(aB - aA), ccw = norm(aT - aA) <= dccw, sweep = ccw ? dccw : TAU - dccw;
      out.push({
        C: P, rad: rad, aA: aA, aB: aB, ccw: ccw, sweep: sweep, type: P[2],
        P0: [P[0] + rad * Math.cos(aA), P[1] + rad * Math.sin(aA)],
        P1: [P[0] + rad * Math.cos(aB), P[1] + rad * Math.sin(aB)]
      });
    }
    return out;
  }
  // length of a drawn edge: every arc is radius x sweep (radians), in cm
  function len(segs) { var t = 0; segs.forEach(function (s) { t += s.rad * s.sweep; }); return t; }
  // the wave profile is the outer edge, shown in metres to the centimetre
  function profileText(o) { return (len(o) / 100).toFixed(2) + ' m'; }
  function path(segs) {
    var d = 'M ' + segs[0].P0[0].toFixed(2) + ' ' + segs[0].P0[1].toFixed(2);
    segs.forEach(function (s) {
      d += ' A ' + s.rad.toFixed(2) + ' ' + s.rad.toFixed(2) + ' 0 ' + (s.sweep > Math.PI ? 1 : 0) +
           ' ' + (s.ccw ? 1 : 0) + ' ' + s.P1[0].toFixed(2) + ' ' + s.P1[1].toFixed(2);
    });
    return d + ' Z';
  }

  // A loop that folds back on itself shows up as a runaway sweep: a tuck
  // turning 175 degrees or more, or a lobe 250 or more.
  function degenerate(rg) {
    var a = arcs(rg, 0), maxT = 0, maxL = 0;
    a.forEach(function (s) {
      var deg = s.sweep * 180 / Math.PI;
      if (s.type === 'T') maxT = Math.max(maxT, deg); else maxL = Math.max(maxL, deg);
    });
    return maxT >= 175 || maxL >= 250;
  }
  function radiusRangeIn(gh, gv, rmin, rmax) {
    var lo = null, hi = null;
    for (var r = rmin; r <= rmax; r++) {
      var t = ring(gh, gv, r);
      if (!t.bad && !degenerate(t)) { if (lo === null) lo = r; hi = r; }
    }
    return (lo === null) ? null : [lo, hi];
  }
  function radiusRange(gh, gv) { return radiusRangeIn(gh, gv, +radEl.min, +radEl.max); }

  // could ANY distance/radius close a loop in a room of this shape?
  function shapeFits(w, h) {
    var keep = [W, H];
    setVars(w, h);
    var small = Math.min(w, h) / 2;
    var rmin = Math.max(groove + 4, Math.round(small * 0.08));
    var rmax = Math.max(20, Math.round(small * 0.75));
    var ok = false;
    for (var g = 5; g <= Math.round(small * 0.5) && !ok; g += 5) {
      if (radiusRangeIn(g, g, rmin, rmax)) ok = true;
    }
    setVars(keep[0], keep[1]);
    return ok;
  }
  // the longest X that still closes for a given Y (binary search)
  function longestFor(h) {
    if (!shapeFits(h, h)) return null;
    var lo = h, hi = h * 4;
    for (var i = 0; i < 22; i++) {
      var mid = (lo + hi) / 2;
      if (shapeFits(mid, h)) lo = mid; else hi = mid;
    }
    return Math.floor(lo);
  }

  function proportionMessage() {
    var maxW = longestFor(H);
    var ratio = (Math.max(W, H) / Math.min(W, H)).toFixed(1);
    if (maxW && maxW < W) {
      return 'A twelve-arc loop will not stretch to ' + ratio + ' : 1. For a ' + H +
             ' cm width the length has to come down to about ' + maxW + ' cm.';
    }
    return 'No loop closes at these proportions (' + ratio + ' : 1). Try a squarer ceiling.';
  }

  // ---- drawing -------------------------------------------------------------
  function draw(gh, gv, R) {
    var rg = ring(gh, gv, R);
    if (rg.bad || degenerate(rg)) {
      // whatever went wrong, the useful answer is the same: which radii do work here?
      var rr = radiusRange(gh, gv);
      rg = { bad: rr
        ? 'No loop closes at radius ' + R + '. At these distances it needs to be between ' + rr[0] + ' and ' + rr[1] + ' cm.'
        : proportionMessage() };
    }
    if (rg.bad) {
      bandEl.setAttribute('d', ''); outerEl.setAttribute('d', ''); innerEl.setAttribute('d', '');
      screwsEl.innerHTML = ''; dimsEl.innerHTML = '';
      var words = rg.bad.split(' '), l1 = [], l2 = [];
      words.forEach(function (w) { (l1.join(' ').length < 46 ? l1 : l2).push(w); });
      msgEl.innerHTML = '<tspan x="' + CX + '" dy="0">' + l1.join(' ') + '</tspan>' +
        (l2.length ? '<tspan x="' + CX + '" dy="' + (14 * u) + '">' + l2.join(' ') + '</tspan>' : '');
      profileEl.hidden = true;
      lastDraw = null;
      hideTip();
      return;
    }
    msgEl.innerHTML = '';
    var o = arcs(rg, 0), inn = arcs(rg, groove);
    profileEl.hidden = false;
    $('profileLen').textContent = profileText(o);
    outerEl.setAttribute('d', path(o));
    innerEl.setAttribute('d', path(inn));
    bandEl.setAttribute('d', path(o) + ' ' + path(inn));

    var sc = '';
    rg.V.forEach(function (v) {
      var out = v[0] < 0 || v[0] > W || v[1] < 0 || v[1] > H;
      var col = out ? 'var(--warn-line)' : 'var(--edge)';
      var fill = v[2] === 'L' ? col : 'var(--card)';
      var innerR = v[2] === 'L' ? R - groove : R + groove;
      sc += '<g><line x1="' + (v[0] - 6 * u) + '" y1="' + v[1] + '" x2="' + (v[0] + 6 * u) + '" y2="' + v[1] + '" stroke="' + col + '" stroke-width="' + (0.65 * u) + '"/>' +
        '<line x1="' + v[0] + '" y1="' + (v[1] - 6 * u) + '" x2="' + v[0] + '" y2="' + (v[1] + 6 * u) + '" stroke="' + col + '" stroke-width="' + (0.65 * u) + '"/>' +
        '<circle cx="' + v[0] + '" cy="' + v[1] + '" r="' + (2.8 * u) + '" fill="' + fill + '" stroke="' + col + '" stroke-width="' + (0.9 * u) + '"/>' +
        '<circle class="hit" cx="' + v[0] + '" cy="' + v[1] + '" r="' + (11 * u) + '" fill="transparent" tabindex="0" role="button"' +
        ' data-x="' + f1(v[0]) + '" data-y="' + fy(v[1]) + '" data-o="' + R + '" data-i="' + innerR + '"' +
        ' data-off="' + (out ? '1' : '0') + '"' +
        ' aria-label="Circle centre at X ' + f1(v[0]) + ', Y ' + fy(v[1]) + '"></circle></g>';
    });
    screwsEl.innerHTML = sc;
    hideTip();

    // wall-gap callouts, drawn where a lobe actually touches its wall line
    var dx = rg.dimX, dy = rg.dimY;
    dimsEl.innerHTML =
      '<line x1="' + dx.toFixed(2) + '" y1="0" x2="' + dx.toFixed(2) + '" y2="' + gv + '" stroke="var(--ink-3)" stroke-width="' + (0.4 * u) + '" stroke-dasharray="' + (2 * u) + ' ' + (2 * u) + '"/>' +
      '<text x="' + (dx - 3 * u).toFixed(2) + '" y="' + (gv / 2 + 2.3 * u).toFixed(2) + '" font-size="' + (6.6 * u) + '" fill="var(--ink-2)" text-anchor="end">' + gv + ' cm</text>' +
      '<line x1="0" y1="' + dy.toFixed(2) + '" x2="' + gh + '" y2="' + dy.toFixed(2) + '" stroke="var(--ink-3)" stroke-width="' + (0.4 * u) + '" stroke-dasharray="' + (2 * u) + ' ' + (2 * u) + '"/>' +
      '<text x="' + (gh + 3 * u).toFixed(2) + '" y="' + (dy + 8 * u).toFixed(2) + '" font-size="' + (6.6 * u) + '" fill="var(--ink-2)">' + gh + ' cm</text>' +
      // tuck depths: wall to the deepest point of the solid line
      depthMarks(rg, 6.6 * u * 0.72, 6.6 * u * 0.6, 3 * u).map(function (m) {
        var L = m.line, t = 2 * u;
        var tick = m.vert
          ? '<line x1="' + (L[2] - t) + '" y1="' + L[3] + '" x2="' + (L[2] + t) + '" y2="' + L[3] + '"/>'
          : '<line x1="' + L[2] + '" y1="' + (L[3] - t) + '" x2="' + L[2] + '" y2="' + (L[3] + t) + '"/>';
        return '<g stroke="var(--ink-3)" stroke-width="' + (0.4 * u) + '">' +
            '<line x1="' + L[0] + '" y1="' + L[1] + '" x2="' + L[2] + '" y2="' + L[3] + '" stroke-dasharray="' + (2 * u) + ' ' + (2 * u) + '"/>' + tick + '</g>' +
          '<text x="' + m.box.x0.toFixed(2) + '" y="' + m.box.y1.toFixed(2) + '" font-size="' + (6.6 * u) + '" fill="var(--ink-2)">' + m.txt + '</text>';
      }).join('');

    buildPrint(rg, o, inn, gh, gv, R);
    lastDraw = { rg: rg, o: o, inn: inn, gh: gh, gv: gv, R: R };
  }

  // ---- PDF ------------------------------------------------------------------
  // A real one-page PDF, written by hand: base-14 Courier so nothing needs
  // embedding, arcs flattened to Beziers. No library, no network. The page is
  // sandboxed in the artifact viewer so window.print() is ignored there; this
  // is the path that works in both places.
  var PT = 72 / 2.54;                                   // points per cm (unused directly, kept for clarity)

  function pdfEsc(t) {
    return String(t)
      .replace(/\u00b7/g, '-').replace(/\u00d7/g, 'x').replace(/\u00b0/g, ' deg')
      .replace(/[\u2013\u2014]/g, '-').replace(/[^\x20-\x7e]/g, '')
      .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }
  function f2(n) { return (Math.round(n * 100) / 100).toString(); }

  // circular arc -> cubic Beziers, at most 90 degrees each, mapped through T
  // (cm -> points, Y flipped); control arm k = 4/3 tan(sweep / 4)
  function arcOps(C, r, a0, a1, T, ops) {
    var total = a1 - a0, n = Math.max(1, Math.ceil(Math.abs(total) / (Math.PI / 2)));
    var step = total / n;
    var p = T(C[0] + r * Math.cos(a0), C[1] + r * Math.sin(a0));
    ops.push(f2(p[0]) + ' ' + f2(p[1]) + ' m');
    for (var i = 0; i < n; i++) {
      var s0 = a0 + step * i, s1 = s0 + step;
      var k = 4 / 3 * Math.tan((s1 - s0) / 4);
      var p0 = [C[0] + r * Math.cos(s0), C[1] + r * Math.sin(s0)];
      var p3 = [C[0] + r * Math.cos(s1), C[1] + r * Math.sin(s1)];
      var c1 = [p0[0] - k * r * Math.sin(s0), p0[1] + k * r * Math.cos(s0)];
      var c2 = [p3[0] + k * r * Math.sin(s1), p3[1] - k * r * Math.cos(s1)];
      var a = T(c1[0], c1[1]), b = T(c2[0], c2[1]), d = T(p3[0], p3[1]);
      ops.push(f2(a[0]) + ' ' + f2(a[1]) + ' ' + f2(b[0]) + ' ' + f2(b[1]) + ' ' +
               f2(d[0]) + ' ' + f2(d[1]) + ' c');
    }
  }
  // ---- tuck depth marks ------------------------------------------------------
  // Each rg.depths entry is a line from a wall to the deepest point of a tuck,
  // passing through the tuck centre. Its label sits beside the line, midway
  // between that centre and the solid line, where the tuck leaves open space.
  // h / cw are text height and char width, sp the spacing, all drawing cm.
  function depthMarks(rg, h, cw, sp) {
    return rg.depths.map(function (d) {
      var vert = d[0] === d[2], len = vert ? d[3] - d[1] : d[2] - d[0];
      var txt = (Math.round(len * 10) / 10) + ' cm', w = txt.length * cw;
      var t = Math.max(0.5, (len - rg.R / 2) / len);       // midway between centre and curve
      var mx = d[0] + (d[2] - d[0]) * t, my = d[1] + (d[3] - d[1]) * t;
      var box = vert
        ? { x0: mx - sp - w, y0: my - h / 2, x1: mx - sp, y1: my + h / 2 }
        : { x0: mx - w / 2, y0: my - sp - h, x1: mx + w / 2, y1: my - sp };
      return { line: d, vert: vert, txt: txt, box: box };
    });
  }

  // the depth marks as obstacles for placeLabels: each line and its label
  function depthObst(dm, lw, pad) {
    var out = [];
    dm.forEach(function (m) {
      var L = m.line, b = m.box;
      out.push({ x0: Math.min(L[0], L[2]) - lw, y0: Math.min(L[1], L[3]) - lw, x1: Math.max(L[0], L[2]) + lw, y1: Math.max(L[1], L[3]) + lw });
      out.push({ x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad });
    });
    return out;
  }

  // ---- coordinate label placement -------------------------------------------
  // Each centre's "x, y" label tries eight positions round its dot, near then
  // far, starting with the preferred side (lobes inward, tucks outward). The
  // first box that crosses nothing wins: not the frame, not the loop, not a
  // dot, not another label, not the rulers or the gap marks (`obst`). If all
  // collide, the least-bad one is used. Works in drawing cm, y down; both the
  // PDF and the print sheet convert their point/font sizes into cm first.
  //   o = { h: text height, cw: char width, gap: dot-to-text, rd: dot radius,
  //         obst: [{x0,y0,x1,y1}], bounds: {x0,y0,x1,y1}, loops: [segs...] }
  function placeLabels(rg, o) {
    var pts = [];
    o.loops.forEach(function (segs) {
      segs.forEach(function (s) {
        var n = Math.max(4, Math.ceil(s.rad * s.sweep / (o.h * 0.5)));
        for (var i = 0; i <= n; i++) {
          var a = s.aA + (s.ccw ? 1 : -1) * s.sweep * i / n;
          pts.push([s.C[0] + s.rad * Math.cos(a), s.C[1] + s.rad * Math.sin(a)]);
        }
      });
    });
    var pad = o.h * 0.25, placed = [];
    var hits = function (b, c) { return b.x0 < c.x1 && b.x1 > c.x0 && b.y0 < c.y1 && b.y1 > c.y0; };
    var score = function (b, self) {
      var p = { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }, s = 0;
      // the frame: a box may sit inside or outside a wall, never across it
      if (p.x0 < 0 && p.x1 > 0 && p.y1 > 0 && p.y0 < H) s += 20;
      if (p.x0 < W && p.x1 > W && p.y1 > 0 && p.y0 < H) s += 20;
      if (p.y0 < 0 && p.y1 > 0 && p.x1 > 0 && p.x0 < W) s += 20;
      if (p.y0 < H && p.y1 > H && p.x1 > 0 && p.x0 < W) s += 20;
      if (b.x0 < o.bounds.x0 || b.x1 > o.bounds.x1 || b.y0 < o.bounds.y0 || b.y1 > o.bounds.y1) s += 20;
      for (var i = 0; i < pts.length; i++)
        if (pts[i][0] > p.x0 && pts[i][0] < p.x1 && pts[i][1] > p.y0 && pts[i][1] < p.y1) { s += 6; break; }
      rg.V.forEach(function (v) {
        var cx = Math.max(p.x0, Math.min(v[0], p.x1)), cy = Math.max(p.y0, Math.min(v[1], p.y1));
        if (Math.hypot(v[0] - cx, v[1] - cy) < o.rd) s += (v === self ? 20 : 8);
      });
      placed.concat(o.obst).forEach(function (c) { if (hits(p, c)) s += 10; });
      return s;
    };
    var dirs = [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1]];
    return rg.V.map(function (v) {
      var txt = f1(v[0]) + ', ' + fy(v[1]), w = txt.length * o.cw, h = o.h;
      var nx = v.length > 4 ? v[4] : v[0] - CX, ny = v.length > 4 ? v[5] : v[1] - CY, nl = Math.hypot(nx, ny) || 1;
      var sg = v[2] === 'L' ? -1 : 1;
      var pref = [sg * nx / nl, sg * ny / nl];
      var order = dirs.slice().sort(function (a, b) {
        return (b[0] * pref[0] + b[1] * pref[1]) / Math.hypot(b[0], b[1]) -
               (a[0] * pref[0] + a[1] * pref[1]) / Math.hypot(a[0], a[1]);
      });
      var best = null;
      [1, 1.9, 2.8, 4, 5.5].some(function (far) {
        return order.some(function (d) {
          var g = o.gap * far, ux = d[0] ? d[0] / Math.hypot(d[0], d[1]) : 0, uy = d[1] ? d[1] / Math.hypot(d[0], d[1]) : 0;
          var ax = v[0] + ux * g, ay = v[1] + uy * g;
          var x0 = d[0] > 0 ? ax : (d[0] < 0 ? ax - w : ax - w / 2);
          var y0 = d[1] > 0 ? ay : (d[1] < 0 ? ay - h : ay - h / 2);
          var b = { x0: x0, y0: y0, x1: x0 + w, y1: y0 + h, far: far }, s = score(b, v);
          if (!best || s < best.s) best = { b: b, s: s };
          return s === 0;
        });
      });
      var r = best.b; r.txt = txt; r.s = best.s;
      // a label pushed well away from its dot gets a leader line back to it
      if (r.far > 2) {
        var qx = Math.max(r.x0, Math.min(v[0], r.x1)), qy = Math.max(r.y0, Math.min(v[1], r.y1));
        var d = Math.hypot(qx - v[0], qy - v[1]) || 1, st = o.rd * 0.8;
        r.lead = [v[0] + (qx - v[0]) * st / d, v[1] + (qy - v[1]) * st / d, qx, qy];
      }
      placed.push(r);
      return r;
    });
  }
  // Dense drawings (many centres on a small scale) cannot always fit full-size
  // labels cleanly, so step the text down until they do, never below `min`.
  // `make(size)` returns the placeLabels options for that text size.
  function fitLabels(rg, max, min, make) {
    var best = null;
    for (var sz = max; sz >= min - 1e-9; sz -= 0.5) {
      var L = placeLabels(rg, make(sz)), bad = L.reduce(function (a, r) { return a + r.s; }, 0);
      if (!best || bad < best.bad) best = { L: L, sz: sz, bad: bad };
      if (!bad) break;
    }
    return best;
  }

  function loopOps(segs, T, ops) {
    segs.forEach(function (sg) {
      var a1 = sg.ccw ? sg.aA + sg.sweep : sg.aA - sg.sweep;
      arcOps(sg.C, sg.rad, sg.aA, a1, T, ops);
      ops.push('S');
    });
  }

  function buildPDF(rg, o, inn, gh, gv, R) {
    var landscape = W >= H;
    var pw = landscape ? 841.89 : 595.28, ph = landscape ? 595.28 : 841.89;
    var M = 34;                                          // 12 mm
    var big = Math.max(W, H);
    var mL = Math.max(30, big * 0.105), mT = Math.max(18, big * 0.062),
        mR = mL, mB = Math.max(18, big * 0.062);    // room for coordinate labels outside the walls
    var pv = { x: -mL, y: -mT, w: W + mL + mR, h: H + mT + mB };

    var footH = 22, specH = 26;
    var drawTop = ph - M - specH;
    var drawBot = M + footH;
    var availH = drawTop - drawBot, availW = pw - 2 * M;
    var sc = Math.min(availW / pv.w, availH / pv.h);
    var offX = M + (availW - pv.w * sc) / 2, offY = drawTop;
    var T = function (x, y) { return [offX + (x - pv.x) * sc, offY - (y - pv.y) * sc]; };
    var k = sc;                                          // 1 drawing cm in points

    var ops = [];
    ops.push('0.5 w 0.80 0.80 0.80 RG');                 // grid
    var i, p1, p2;
    for (i = 0; i <= W; i += gridStep) {
      p1 = T(i, 0); p2 = T(i, H);
      ops.push(f2(p1[0]) + ' ' + f2(p1[1]) + ' m ' + f2(p2[0]) + ' ' + f2(p2[1]) + ' l S');
    }
    for (i = 0; i <= H; i += gridStep) {                  // counted up from the bottom wall
      p1 = T(0, H - i); p2 = T(W, H - i);
      ops.push(f2(p1[0]) + ' ' + f2(p1[1]) + ' m ' + f2(p2[0]) + ' ' + f2(p2[1]) + ' l S');
    }

    // ruler figures
    ops.push('BT /F1 5.5 Tf 0.35 0.35 0.35 rg');
    var fs = 5.5;
    for (i = 0; i <= W; i += gridStep) {
      p1 = T(i, -8);
      ops.push('1 0 0 1 ' + f2(p1[0] - String(i).length * fs * 0.3) + ' ' + f2(p1[1]) + ' Tm (' + i + ') Tj');
    }
    for (i = gridStep; i <= H; i += gridStep) {
      p1 = T(-6, H - i);
      ops.push('1 0 0 1 ' + f2(p1[0] - String(i).length * fs * 0.6) + ' ' + f2(p1[1] - fs * 0.35) + ' Tm (' + i + ') Tj');
    }
    ops.push('ET 0 0 0 rg');

    // room outline
    ops.push('1.2 w 0 0 0 RG');
    var a = T(0, 0), b = T(W, H);
    ops.push(f2(a[0]) + ' ' + f2(a[1]) + ' m ' + f2(b[0]) + ' ' + f2(a[1]) + ' l ' +
             f2(b[0]) + ' ' + f2(b[1]) + ' l ' + f2(a[0]) + ' ' + f2(b[1]) + ' l h S');

    // the loop
    ops.push('1.9 w 0 0 0 RG');
    loopOps(o, T, ops);
    ops.push('0.9 w [5 3] 0 d');
    loopOps(inn, T, ops);
    ops.push('[] 0 d');

    // wall gaps, dimensioned where a lobe touches its wall line
    var gx = rg.dimX, gy = rg.dimY, tk = 3;
    var w0 = T(gx, 0), w1 = T(gx, gv), h0 = T(0, gy), h1 = T(gh, gy);
    ops.push('0.6 w 0 0 0 RG');
    ops.push(f2(w0[0]) + ' ' + f2(w0[1]) + ' m ' + f2(w1[0]) + ' ' + f2(w1[1]) + ' l S');
    ops.push(f2(w1[0] - tk) + ' ' + f2(w1[1]) + ' m ' + f2(w1[0] + tk) + ' ' + f2(w1[1]) + ' l S');
    ops.push(f2(h0[0]) + ' ' + f2(h0[1]) + ' m ' + f2(h1[0]) + ' ' + f2(h1[1]) + ' l S');
    ops.push(f2(h1[0]) + ' ' + f2(h1[1] - tk) + ' m ' + f2(h1[0]) + ' ' + f2(h1[1] + tk) + ' l S');
    // labels on a white backing so they read over the grid and the loop
    var gfs = 6.5, gtH = gh + ' cm', gtV = gv + ' cm';
    var gLabel = function (txt, x, y) {
      var wl = txt.length * gfs * 0.6;
      ops.push('1 g ' + f2(x - 1.5) + ' ' + f2(y - 2) + ' ' + f2(wl + 3) + ' ' + f2(gfs + 2.5) + ' re f 0 g');
      ops.push('BT /F2 ' + gfs + ' Tf 1 0 0 1 ' + f2(x) + ' ' + f2(y) + ' Tm (' + txt + ') Tj ET');
    };
    gLabel(gtV, w1[0] - 4 - gtV.length * gfs * 0.6, (w0[1] + w1[1]) / 2 - gfs * 0.35);   // corner side: the next label is to the right
    gLabel(gtH, h1[0] + 3, h1[1] - gfs - 3);
    // tuck depths: wall to the deepest point of the solid line
    var dm = depthMarks(rg, gfs * 0.72 / sc, gfs * 0.6 / sc, 3 / sc);
    dm.forEach(function (m) {
      var L = m.line, a0 = T(L[0], L[1]), a1 = T(L[2], L[3]);
      ops.push(f2(a0[0]) + ' ' + f2(a0[1]) + ' m ' + f2(a1[0]) + ' ' + f2(a1[1]) + ' l S');
      ops.push(m.vert
        ? f2(a1[0] - tk) + ' ' + f2(a1[1]) + ' m ' + f2(a1[0] + tk) + ' ' + f2(a1[1]) + ' l S'
        : f2(a1[0]) + ' ' + f2(a1[1] - tk) + ' m ' + f2(a1[0]) + ' ' + f2(a1[1] + tk) + ' l S');
      var p = T(m.box.x0, m.box.y1);
      gLabel(m.txt, p[0], p[1]);
    });

    // circle centres + coordinates
    ops.push('0.7 w');
    rg.V.forEach(function (v) {
      var c = T(v[0], v[1]), rr = 2.4 * k;
      ops.push(f2(c[0] - 5 * k) + ' ' + f2(c[1]) + ' m ' + f2(c[0] + 5 * k) + ' ' + f2(c[1]) + ' l S');
      ops.push(f2(c[0]) + ' ' + f2(c[1] - 5 * k) + ' m ' + f2(c[0]) + ' ' + f2(c[1] + 5 * k) + ' l S');
      var kk = 0.5523 * rr;
      ops.push(f2(c[0] + rr) + ' ' + f2(c[1]) + ' m ' +
        f2(c[0] + rr) + ' ' + f2(c[1] + kk) + ' ' + f2(c[0] + kk) + ' ' + f2(c[1] + rr) + ' ' + f2(c[0]) + ' ' + f2(c[1] + rr) + ' c ' +
        f2(c[0] - kk) + ' ' + f2(c[1] + rr) + ' ' + f2(c[0] - rr) + ' ' + f2(c[1] + kk) + ' ' + f2(c[0] - rr) + ' ' + f2(c[1]) + ' c ' +
        f2(c[0] - rr) + ' ' + f2(c[1] - kk) + ' ' + f2(c[0] - kk) + ' ' + f2(c[1] - rr) + ' ' + f2(c[0]) + ' ' + f2(c[1] - rr) + ' c ' +
        f2(c[0] + kk) + ' ' + f2(c[1] - rr) + ' ' + f2(c[0] + rr) + ' ' + f2(c[1] - kk) + ' ' + f2(c[0] + rr) + ' ' + f2(c[1]) + ' c ' +
        (v[2] === 'L' ? 'B' : 'S'));
    });
    // coordinate labels: sizes in points, converted to drawing cm for placement
    var pc = 1 / sc;                                     // cm per point
    var gW = gtV.length * gfs * 0.6 * pc, gH = gtH.length * gfs * 0.6 * pc;
    var fit = fitLabels(rg, 8, 5.5, function (lfs) { return {
      h: lfs * 0.72 * pc, cw: lfs * 0.6 * pc, gap: 5 + 3 * pc, rd: 5 + pc,
      loops: [o, inn],
      bounds: { x0: pv.x, y0: pv.y, x1: pv.x + pv.w, y1: pv.y + pv.h },
      obst: [
        { x0: pv.x, y0: -8 - 5 * pc, x1: pv.x + pv.w, y1: -8 + pc },                         // top ruler
        { x0: -6 - 16 * pc, y0: -3 * pc, x1: -6 + pc, y1: H + 3 * pc },                     // left ruler
        { x0: gx - 5 * pc - gW, y0: gv / 2 - 6 * pc, x1: gx + tk * pc, y1: Math.max(gv, gv / 2 + 4 * pc) },   // gap marks
        { x0: -pc, y0: gy - tk * pc, x1: gh + 4 * pc + gH, y1: gy + 13 * pc }
      ].concat(depthObst(dm, tk * pc, 2 * pc), [
        { x0: -36 * pc, y0: H + 2 * pc, x1: -8 * pc, y1: H + 13 * pc },                     // (0,0)
        { x0: 0, y0: H - 5 * pc, x1: 30 + 14 * pc, y1: H + 5 * pc },                        // X arrow
        { x0: -14 * pc, y0: H - 30 - 5 * pc, x1: 5 * pc, y1: H }                            // Y arrow
      ])
    }; });
    ops.push('0.4 w 0.35 0.35 0.35 RG');
    fit.L.forEach(function (r) {
      if (!r.lead) return;
      var a0 = T(r.lead[0], r.lead[1]), a1 = T(r.lead[2], r.lead[3]);
      ops.push(f2(a0[0]) + ' ' + f2(a0[1]) + ' m ' + f2(a1[0]) + ' ' + f2(a1[1]) + ' l S');
    });
    ops.push('0 0 0 RG BT /F2 ' + f2(fit.sz) + ' Tf 0 0 0 rg');                     // points, constant on paper
    fit.L.forEach(function (r) {
      var p = T(r.x0, r.y1);                             // baseline = bottom of the box
      ops.push('1 0 0 1 ' + f2(p[0]) + ' ' + f2(p[1]) + ' Tm (' + pdfEsc(r.txt) + ') Tj');
    });
    ops.push('ET');

    // origin: bottom-left corner, X right, Y up (PDF space is y-up too)
    ops.push('1 w 0 0 0 RG');
    var o0 = T(0, H), ox = T(30, H), oy = T(0, H - 30);
    ops.push(f2(o0[0] + 4 * k) + ' ' + f2(o0[1]) + ' m ' + f2(ox[0]) + ' ' + f2(ox[1]) + ' l S');
    ops.push(f2(o0[0]) + ' ' + f2(o0[1] + 4 * k) + ' m ' + f2(oy[0]) + ' ' + f2(oy[1]) + ' l S');
    var arw = 3.2;
    ops.push(f2(ox[0] + arw) + ' ' + f2(ox[1]) + ' m ' + f2(ox[0] - arw) + ' ' + f2(ox[1] + arw) + ' l ' +
             f2(ox[0] - arw) + ' ' + f2(ox[1] - arw) + ' l h f');
    ops.push(f2(oy[0]) + ' ' + f2(oy[1] + arw) + ' m ' + f2(oy[0] - arw) + ' ' + f2(oy[1] - arw) + ' l ' +
             f2(oy[0] + arw) + ' ' + f2(oy[1] - arw) + ' l h f');
    ops.push(f2(o0[0] + 2.8) + ' ' + f2(o0[1]) + ' m ' +
      f2(o0[0] + 2.8) + ' ' + f2(o0[1] + 1.55) + ' ' + f2(o0[0] + 1.55) + ' ' + f2(o0[1] + 2.8) + ' ' + f2(o0[0]) + ' ' + f2(o0[1] + 2.8) + ' c ' +
      f2(o0[0] - 1.55) + ' ' + f2(o0[1] + 2.8) + ' ' + f2(o0[0] - 2.8) + ' ' + f2(o0[1] + 1.55) + ' ' + f2(o0[0] - 2.8) + ' ' + f2(o0[1]) + ' c ' +
      f2(o0[0] - 2.8) + ' ' + f2(o0[1] - 1.55) + ' ' + f2(o0[0] - 1.55) + ' ' + f2(o0[1] - 2.8) + ' ' + f2(o0[0]) + ' ' + f2(o0[1] - 2.8) + ' c ' +
      f2(o0[0] + 1.55) + ' ' + f2(o0[1] - 2.8) + ' ' + f2(o0[0] + 2.8) + ' ' + f2(o0[1] - 1.55) + ' ' + f2(o0[0] + 2.8) + ' ' + f2(o0[1]) + ' c f');
    ops.push('BT /F2 8 Tf 1 0 0 1 ' + f2(ox[0] + 6) + ' ' + f2(ox[1] - 3) + ' Tm (X) Tj');
    ops.push('1 0 0 1 ' + f2(oy[0] - 12) + ' ' + f2(oy[1] - 3) + ' Tm (Y) Tj');
    ops.push('1 0 0 1 ' + f2(o0[0] - 34) + ' ' + f2(o0[1] - 10) + ' Tm ((0,0)) Tj ET');

    // spec strip
    var spec = 'Ceiling ' + W + ' x ' + H + ' cm    Radius ' + R + ' cm, every arc    ' +
               'Inner edge ' + (R - groove) + ' at lobes / ' + (R + groove) + ' at tucks    ' +
               'Wall gap H ' + gh + ' cm / V ' + gv + ' cm    Wave profile (outer edge) ' + profileText(o);
    var sfs = Math.min(9, (pw - 2 * M) / (pdfEsc(spec).length * 0.6));
    ops.push('BT /F2 ' + f2(sfs) + ' Tf 0 0 0 rg 1 0 0 1 ' + f2(M) + ' ' + f2(ph - M - 10) + ' Tm (' + pdfEsc(spec) + ') Tj ET');
    ops.push('0.6 w 0 0 0 RG ' + f2(M) + ' ' + f2(ph - M - 16) + ' m ' + f2(pw - M) + ' ' + f2(ph - M - 16) + ' l S');

    // footnote
    var f1txt = 'Solid = outer edge of the groove. Dashed = inner edge, ' + groove + ' cm in. Filled dot = lobe centre, hollow = tuck centre. Grid ' + gridStep + ' cm.';
    var f2txt = 'Drawing not to scale - work from the figures.';
    ops.push('BT /F1 7 Tf 0.25 0.25 0.25 rg 1 0 0 1 ' + f2(M) + ' ' + f2(M + 11) + ' Tm (' + pdfEsc(f1txt) + ') Tj ' +
             '1 0 0 1 ' + f2(M) + ' ' + f2(M + 2) + ' Tm (' + pdfEsc(f2txt) + ') Tj ET');

    var stream = ops.join('\n');
    var objs = [
      '<</Type/Catalog/Pages 2 0 R>>',
      '<</Type/Pages/Kids[3 0 R]/Count 1>>',
      '<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' + f2(pw) + ' ' + f2(ph) + ']' +
        '/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>/Contents 4 0 R>>',
      '<</Length ' + stream.length + '>>\nstream\n' + stream + '\nendstream',
      '<</Type/Font/Subtype/Type1/BaseFont/Courier/Encoding/WinAnsiEncoding>>',
      '<</Type/Font/Subtype/Type1/BaseFont/Courier-Bold/Encoding/WinAnsiEncoding>>'
    ];
    var out = '%PDF-1.4\n', offsets = [];
    objs.forEach(function (body, idx) {
      offsets.push(out.length);
      out += (idx + 1) + ' 0 obj\n' + body + '\nendobj\n';
    });
    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach(function (off) {
      out += ('0000000000' + off).slice(-10) + ' 00000 n \n';
    });
    out += 'trailer\n<</Size ' + (objs.length + 1) + '/Root 1 0 R>>\nstartxref\n' + xref + '\n%%EOF';

    var bytes = new Uint8Array(out.length);
    for (var bi = 0; bi < out.length; bi++) bytes[bi] = out.charCodeAt(bi) & 0xff;
    return bytes;
  }

  var lastDraw = null;                                   // args of the most recent successful draw


  // ---- print sheet ---------------------------------------------------------
  // Only what is needed standing on a ladder: the ceiling, the grid, the
  // origin, the loop, the circle centres and their coordinates. No prose,
  // no theme colours - black on white so any printer copes.
  function buildPrint(rg, o, inn, gh, gv, R) {
    // Left and top carry the rulers and the origin; right and bottom need room
    // for coordinate labels of centres close to (or beyond) those walls.
    var big = Math.max(W, H);
    var mL = Math.max(30, big * 0.105);   // "(0,0)" label + left ruler
    var mT = Math.max(18, big * 0.062);   // top ruler
    var mR = mL;                          // room for coordinate labels outside the right wall
    var mB = Math.max(18, big * 0.062);   // and below the bottom wall
    var pv = { x: -mL, y: -mT, w: W + mL + mR, h: H + mT + mB };
    var k = Math.max(W, H) / 355;
    var psvg = document.getElementById('psvg');
    psvg.setAttribute('viewBox', pv.x + ' ' + pv.y + ' ' + pv.w + ' ' + pv.h);

    var g = '', x, y;
    for (x = 0; x <= W; x += gridStep) g += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '"/>';
    for (y = H; y >= 0; y -= gridStep) g += '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '"/>';

    var ruler = '';
    for (x = 0; x <= W; x += gridStep)
      ruler += '<text x="' + x + '" y="' + (-14 * k) + '" font-size="' + (6 * k) + '" text-anchor="middle" fill="#666">' + x + '</text>';
    for (y = gridStep; y <= H; y += gridStep)
      ruler += '<text x="' + (-11 * k) + '" y="' + (H - y + 2 * k) + '" font-size="' + (6 * k) + '" text-anchor="end" fill="#666">' + y + '</text>';

    // Coordinate labels go wherever they cross nothing - see placeLabels.
    var screws = '', gl = 5.6 * k * 0.62;
    var dm = depthMarks(rg, 5.6 * k * 0.72, gl, 3 * k);
    var fit = fitLabels(rg, 4.5 * k, 2.5 * k, function (lfs) { return {        // ~8 pt on A4, as the PDF
      h: lfs * 0.72, cw: lfs * 0.62, gap: 6 * k, rd: 5.4 * k,
      loops: [o, inn],
      bounds: { x0: pv.x, y0: pv.y, x1: pv.x + pv.w, y1: pv.y + pv.h },
      obst: [
        { x0: pv.x, y0: -14 * k - 5 * k, x1: pv.x + pv.w, y1: -14 * k + 1.5 * k },          // top ruler
        { x0: -11 * k - 16 * k, y0: -3 * k, x1: -10 * k, y1: H + 3 * k },                   // left ruler
        { x0: rg.dimX - 4 * k - (gv + ' cm').length * gl, y0: gv / 2 - 3.5 * k, x1: rg.dimX + 2 * k, y1: Math.max(gv, gv / 2 + 3 * k) },
        { x0: -k, y0: rg.dimY - 2 * k, x1: gh + 4 * k + (gh + ' cm').length * gl, y1: rg.dimY + 8 * k }
      ].concat(depthObst(dm, 2 * k, k), [
        { x0: -30 * k, y0: H + 2 * k, x1: -4 * k, y1: H + 10 * k },                         // (0,0)
        { x0: 0, y0: H - 3 * k, x1: 45 * k, y1: H + 10 * k },                               // X arrow
        { x0: -3 * k, y0: H - 40 * k, x1: 10 * k, y1: H }                                   // Y arrow
      ])
    }; });
    var lfs = fit.sz;
    rg.V.forEach(function (v, i) {
      var r = fit.L[i];
      if (r.lead) screws += '<line x1="' + r.lead[0].toFixed(1) + '" y1="' + r.lead[1].toFixed(1) + '" x2="' + r.lead[2].toFixed(1) +
        '" y2="' + r.lead[3].toFixed(1) + '" stroke="#555" stroke-width="' + (0.35 * k) + '"/>';
      screws +=
        '<line x1="' + (v[0] - 5 * k) + '" y1="' + v[1] + '" x2="' + (v[0] + 5 * k) + '" y2="' + v[1] + '" stroke="#000" stroke-width="' + (0.6 * k) + '"/>' +
        '<line x1="' + v[0] + '" y1="' + (v[1] - 5 * k) + '" x2="' + v[0] + '" y2="' + (v[1] + 5 * k) + '" stroke="#000" stroke-width="' + (0.6 * k) + '"/>' +
        '<circle cx="' + v[0] + '" cy="' + v[1] + '" r="' + (2.4 * k) + '" fill="' + (v[2] === 'L' ? '#000' : '#fff') + '" stroke="#000" stroke-width="' + (0.8 * k) + '"/>' +
        '<text x="' + r.x0.toFixed(1) + '" y="' + r.y1.toFixed(1) + '" font-size="' + lfs.toFixed(2) + '" font-weight="600" fill="#000">' +
        r.txt + '</text>';
    });

    psvg.innerHTML =
      '<g stroke="#ccc" stroke-width="' + (0.3 * k) + '">' + g + '</g>' +
      ruler +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none" stroke="#000" stroke-width="' + (1.2 * k) + '"/>' +
      '<path d="' + path(o) + '" fill="none" stroke="#000" stroke-width="' + (1.9 * k) + '"/>' +
      '<path d="' + path(inn) + '" fill="none" stroke="#000" stroke-width="' + (0.9 * k) + '" stroke-dasharray="' + (6 * k) + ' ' + (3 * k) + '"/>' +
      screws +
      // wall gaps, dimensioned where a lobe touches its wall line
      '<g stroke="#000" stroke-width="' + (0.5 * k) + '">' +
        '<line x1="' + rg.dimX + '" y1="0" x2="' + rg.dimX + '" y2="' + gv + '"/>' +
        '<line x1="' + (rg.dimX - 2 * k) + '" y1="' + gv + '" x2="' + (rg.dimX + 2 * k) + '" y2="' + gv + '"/>' +
        '<line x1="0" y1="' + rg.dimY + '" x2="' + gh + '" y2="' + rg.dimY + '"/>' +
        '<line x1="' + gh + '" y1="' + (rg.dimY - 2 * k) + '" x2="' + gh + '" y2="' + (rg.dimY + 2 * k) + '"/></g>' +
      '<g font-size="' + (5.6 * k) + '" font-weight="600" fill="#000" stroke="#fff" stroke-width="' + (1.6 * k) + '" paint-order="stroke">' +
        '<text x="' + (rg.dimX - 3 * k) + '" y="' + (gv / 2 + 2 * k) + '" text-anchor="end">' + gv + ' cm</text>' +
        '<text x="' + (gh + 3 * k) + '" y="' + (rg.dimY + 7 * k) + '">' + gh + ' cm</text>' +
        dm.map(function (m) { return '<text x="' + m.box.x0 + '" y="' + m.box.y1 + '">' + m.txt + '</text>'; }).join('') + '</g>' +
      // tuck depths: wall to the deepest point of the solid line
      '<g stroke="#000" stroke-width="' + (0.5 * k) + '">' + dm.map(function (m) {
        var L = m.line;
        return '<line x1="' + L[0] + '" y1="' + L[1] + '" x2="' + L[2] + '" y2="' + L[3] + '"/>' + (m.vert
          ? '<line x1="' + (L[2] - 2 * k) + '" y1="' + L[3] + '" x2="' + (L[2] + 2 * k) + '" y2="' + L[3] + '"/>'
          : '<line x1="' + L[2] + '" y1="' + (L[3] - 2 * k) + '" x2="' + L[2] + '" y2="' + (L[3] + 2 * k) + '"/>');
      }).join('') + '</g>' +
      // origin: bottom-left corner, X right, Y up
      '<line x1="' + (4 * k) + '" y1="' + H + '" x2="' + (30 * k) + '" y2="' + H + '" stroke="#000" stroke-width="' + k + '"/>' +
      '<polygon points="' + (34 * k) + ',' + H + ' ' + (28 * k) + ',' + (H - 2.2 * k) + ' ' + (28 * k) + ',' + (H + 2.2 * k) + '" fill="#000"/>' +
      '<text x="' + (39 * k) + '" y="' + (H + 9 * k) + '" font-size="' + (7.5 * k) + '" font-weight="600" fill="#000">X</text>' +
      '<line x1="0" y1="' + (H - 4 * k) + '" x2="0" y2="' + (H - 30 * k) + '" stroke="#000" stroke-width="' + k + '"/>' +
      '<polygon points="0,' + (H - 34 * k) + ' ' + (-2.2 * k) + ',' + (H - 28 * k) + ' ' + (2.2 * k) + ',' + (H - 28 * k) + '" fill="#000"/>' +
      '<text x="' + (4 * k) + '" y="' + (H - 33 * k) + '" font-size="' + (7.5 * k) + '" font-weight="600" fill="#000">Y</text>' +
      '<circle cx="0" cy="' + H + '" r="' + (2.8 * k) + '" fill="#000"/>' +
      '<text x="' + (-5 * k) + '" y="' + (H + 9 * k) + '" font-size="' + (8 * k) + '" font-weight="600" fill="#000" text-anchor="end">(0,0)</text>';

    document.getElementById('pspec').innerHTML =
      '<span><b>Ceiling</b> ' + W + ' x ' + H + ' cm</span>' +
      '<span><b>Radius</b> ' + R + ' cm, every arc</span>' +
      '<span><b>Inner edge</b> ' + (R - groove) + ' at lobes / ' + (R + groove) + ' at tucks</span>' +
      '<span><b>Wall gap</b> H ' + gh + ' cm / V ' + gv + ' cm</span>' +
      '<span><b>Wave profile</b> ' + profileText(o) + ' (outer edge)</span>';

    document.getElementById('ptables').innerHTML = '';

    document.getElementById('pfoot').textContent =
      'Solid = outer edge of the groove. Dashed = inner edge, ' + groove + ' cm in. ' +
      'Filled dot = lobe centre, hollow = tuck centre. Grid ' + gridStep + ' cm. Not to scale - work from the figures.';

    // Keep the whole sheet on one page: cap the drawing's height at what is
    // left of the A4 page once the spec strip, tables and footnote have taken
    // their share. Landscape content box is 273 x 186 mm, portrait 186 x 273.
    var landscape = W >= H;
    var svgMax = landscape ? 150 : 238;
    document.getElementById('pagestyle').textContent =
      '@page { size: A4 ' + (landscape ? 'landscape' : 'portrait') + '; margin: 12mm; }' +
      '.printsheet svg { max-height: ' + svgMax + 'mm; }';
  }

  // ---- centre tooltip -------------------------------------------------------
  var pinned = null;
  function hideTip() { tipEl.innerHTML = ''; }
  function showTip(h) {
    var x = +h.getAttribute('cx'), y = +h.getAttribute('cy'), d = h.dataset;
    var lines = [{ t: '(' + d.x + ', ' + d.y + ')', fs: 9.5 * u, w: 600 }];
    if (d.off === '1') lines.push({ t: 'off the ceiling', fs: 6.8 * u, w: 400 });
    var w = 0;
    lines.forEach(function (L) { w = Math.max(w, L.t.length * L.fs * 0.615); });
    w += 14 * u;
    var h0 = lines.reduce(function (a, L) { return a + L.fs * 1.45; }, 0) + 7 * u;
    var bx = x - w / 2, by = y - 15 * u - h0;
    if (by < VB.y + 4 * u) by = y + 15 * u;
    if (bx < VB.x + 4 * u) bx = VB.x + 4 * u;
    if (bx + w > VB.x + VB.w - 4 * u) bx = VB.x + VB.w - 4 * u - w;
    var cy = by + 6 * u, txt = '';
    lines.forEach(function (L, i) {
      cy += L.fs * (i === 0 ? 1.05 : 1.5);
      txt += '<text x="' + (bx + w / 2).toFixed(2) + '" y="' + cy.toFixed(2) + '" font-size="' + L.fs + '" ' +
        'text-anchor="middle" font-weight="' + L.w + '" ' +
        'fill="' + (i === 0 ? 'var(--tip-ink)' : 'var(--tip-ink-2)') + '">' + L.t + '</text>';
    });
    tipEl.innerHTML =
      '<circle cx="' + x + '" cy="' + y + '" r="' + (7 * u) + '" fill="none" stroke="var(--edge)" stroke-width="' + (1.1 * u) + '"/>' +
      '<rect x="' + bx.toFixed(2) + '" y="' + by.toFixed(2) + '" width="' + w.toFixed(2) + '" height="' + h0.toFixed(2) + '" ' +
      'rx="' + (2.5 * u) + '" fill="var(--tip-bg)" opacity="0.96"/>' + txt;
  }
  var closestHit = function (e) { return e.target.closest ? e.target.closest('.hit') : null; };
  svgEl.addEventListener('pointerover', function (e) { var h = closestHit(e); if (h && !pinned) showTip(h); });
  svgEl.addEventListener('pointerout', function (e) { var h = closestHit(e); if (h && !pinned) hideTip(); });
  svgEl.addEventListener('pointerdown', function (e) {
    var h = closestHit(e);
    if (h) { pinned = h; showTip(h); } else { pinned = null; hideTip(); }
  });
  svgEl.addEventListener('focusin', function (e) { var h = closestHit(e); if (h) { pinned = null; showTip(h); } });
  svgEl.addEventListener('focusout', function () { if (!pinned) hideTip(); });

  // ---- controls ------------------------------------------------------------
  function clamp(v, el) { return Math.min(+el.max, Math.max(+el.min, v)); }
  function vals() { return { gh: +ghEl.value, gv: +gvEl.value, R: +radEl.value }; }

  function sync() {
    ghNum.value = ghEl.value; gvNum.value = gvEl.value; radNum.value = radEl.value; grvNum.value = groove;
  }
  function render(save) {
    var v = vals();
    draw(v.gh, v.gv, v.R);
    if (save) {
      try { localStorage.setItem(LS_STATE, [W, H, v.gh, v.gv, v.R, linkEl.checked ? 1 : 0, pattern === 'corner' ? 1 : 0, groove].join(',')); } catch (e) {}
    }
  }
  var patCorner = $('patCorner'), patClassic = $('patClassic');
  function setPattern(p) {
    pattern = p === 'classic' ? 'classic' : 'corner';
    patCorner.setAttribute('aria-pressed', pattern === 'corner');
    patClassic.setAttribute('aria-pressed', pattern === 'classic');
    if (W) retuneControls();                             // radius range depends on the pattern
  }
  [patCorner, patClassic].forEach(function (b) {
    b.addEventListener('click', function () {
      setPattern(b === patCorner ? 'corner' : 'classic');
      ensureValid(); sync(); render(true);
    });
  });
  // The groove width feeds the radius minimum (a lobe's inner edge needs room)
  // and the legend, so a change retunes the controls and redraws the chrome.
  function setGroove(g) {
    groove = Math.min(+grvEl.max, Math.max(+grvEl.min, Math.round(g) || DEF.g));
    grvEl.value = groove;
    if (W) { retuneControls(); buildChrome(); }
  }
  grvEl.addEventListener('input', function () { setGroove(+grvEl.value); ensureValid(); sync(); render(true); });
  grvNum.addEventListener('input', function () {
    var raw = parseFloat(grvNum.value);
    if (!isFinite(raw) || raw < +grvEl.min) return;      // mid-typing
    setGroove(raw); ensureValid(); render(true);
  });
  grvNum.addEventListener('change', function () { setGroove(parseFloat(grvNum.value)); ensureValid(); sync(); render(true); });

  function setAll(w, h, gh, gv, R, pat, g) {
    if (pat) setPattern(pat);
    if (g) setGroove(g);
    if (w !== W || h !== H) { roomW.value = w; roomH.value = h; setRoom(w, h); }
    ghEl.value = clamp(gh, ghEl); gvEl.value = clamp(gv, gvEl); radEl.value = clamp(R, radEl);
    sync(); render(true);
  }

  // Changing the ceiling must never leave a blank drawing. Order matters: move
  // the radius first, because that is ours to choose; the wall distances are
  // what the user asked for, so they only come in when nothing else works.
  function ensureValid() {
    var v = vals(), rg = ring(v.gh, v.gv, v.R);
    if (!rg.bad && !degenerate(rg)) return;
    var rr = radiusRange(v.gh, v.gv);
    if (rr) { radEl.value = Math.min(rr[1], Math.max(rr[0], v.R)); return; }
    for (var k = 0.85; k >= 0.1; k -= 0.15) {
      var gh = Math.max(+ghEl.min, Math.round(v.gh * k)),
          gv = Math.max(+gvEl.min, Math.round(v.gv * k));
      var r2 = radiusRange(gh, gv);
      if (r2) {
        ghEl.value = gh; gvEl.value = gv;
        radEl.value = Math.min(r2[1], Math.max(r2[0], v.R));
        return;
      }
    }
  }
  function applyRoom() {
    var w = clamp(parseFloat(roomW.value), roomW), h = clamp(parseFloat(roomH.value), roomH);
    if (!isFinite(w) || !isFinite(h)) return;
    roomW.value = w; roomH.value = h;
    setRoom(w, h); ensureValid(); sync(); render(true);
  }
  [roomW, roomH].forEach(function (el) {
    el.addEventListener('input', function () {
      var raw = parseFloat(el.value);
      if (!isFinite(raw) || raw < +el.min) return;      // mid-typing
      applyRoom();
    });
    el.addEventListener('change', applyRoom);
  });
  $('swap').addEventListener('click', function () {
    var w = +roomW.value, h = +roomH.value;
    roomW.value = h; roomH.value = w;
    var gh = +ghEl.value, gv = +gvEl.value;
    applyRoom();
    ghEl.value = clamp(gv, ghEl); gvEl.value = clamp(gh, gvEl);
    sync(); render(true);
  });

  ghEl.addEventListener('input', function () {
    if (linkEl.checked) gvEl.value = clamp(+ghEl.value, gvEl);
    sync(); render(true);
  });
  gvEl.addEventListener('input', function () {
    if (linkEl.checked) ghEl.value = clamp(+gvEl.value, ghEl);
    sync(); render(true);
  });
  radEl.addEventListener('input', function () { sync(); render(true); });

  function wireNum(numEl, rangeEl, isGap, isH) {
    numEl.addEventListener('input', function () {
      var raw = parseFloat(numEl.value);
      if (!isFinite(raw)) return;
      rangeEl.value = clamp(raw, rangeEl);
      if (isGap && linkEl.checked) {
        var other = isH ? gvEl : ghEl, otherNum = isH ? gvNum : ghNum;
        other.value = clamp(raw, other); otherNum.value = other.value;
      }
      render(true);
    });
    numEl.addEventListener('change', function () {
      var raw = parseFloat(numEl.value);
      numEl.value = isFinite(raw) ? clamp(raw, rangeEl) : rangeEl.value;
      rangeEl.value = numEl.value;
      if (isGap && linkEl.checked) {
        var other = isH ? gvEl : ghEl, otherNum = isH ? gvNum : ghNum;
        other.value = numEl.value; otherNum.value = numEl.value;
      }
      render(true);
    });
  }
  wireNum(ghNum, ghEl, true, true);
  wireNum(gvNum, gvEl, true, false);
  wireNum(radNum, radEl, false, false);

  linkEl.addEventListener('change', function () {
    if (linkEl.checked) gvEl.value = clamp(+ghEl.value, gvEl);
    sync(); render(true);
  });
  var downloadsCap = null;
  (async function () {
    try { if (window.claude && claude.use) downloadsCap = await claude.use('downloads'); } catch (e) {}
  })();

  $('print').addEventListener('click', async function () {
    var btn = this, label = btn.textContent;
    if (!lastDraw) { btn.textContent = 'nothing to print'; setTimeout(function(){ btn.textContent = label; }, 1600); return; }
    var bytes, name = 'ceiling-wave-generator-' + W + 'x' + H + '-R' + lastDraw.R + '.pdf';
    try {
      bytes = buildPDF(lastDraw.rg, lastDraw.o, lastDraw.inn, lastDraw.gh, lastDraw.gv, lastDraw.R);
    } catch (e) { window.print(); return; }

    if (!downloadsCap) {
      try { if (window.claude && claude.use) downloadsCap = await claude.use('downloads'); } catch (e) {}
    }
    if (downloadsCap) {
      try {
        await downloadsCap.save({ filename: name, data: bytes });
      } catch (e) {
        if (e && e.code === 'declined') return;
        btn.textContent = 'save failed';
        setTimeout(function () { btn.textContent = label; }, 1800);
      }
      return;
    }
    // standalone copy: no capability, but no sandbox either
    try {
      var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      var link = document.createElement('a');
      link.href = url; link.download = name;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    } catch (e) { window.print(); }
  });
  $('reset').addEventListener('click', function () {
    linkEl.checked = true;
    setAll(DEF.w, DEF.h, DEF.gh, DEF.gv, DEF.r, DEF.pat, DEF.g);
  });

  // ---- presets (this browser only) ----------------------------------------
  var presetsEl = $('presets'), hintEl = $('phint'), nameEl = $('pname');
  var storageOK = true;
  function readPresets() {
    try { var raw = localStorage.getItem(LS_PRESETS); return raw ? JSON.parse(raw) : []; }
    catch (e) { storageOK = false; return []; }
  }
  function writePresets(list) {
    try { localStorage.setItem(LS_PRESETS, JSON.stringify(list)); return true; }
    catch (e) { storageOK = false; return false; }
  }
  function renderPresets() {
    var list = readPresets();
    if (!list.length) {
      presetsEl.innerHTML = '';
      hintEl.textContent = storageOK
        ? 'No presets yet — set it up, name it, and hit save. Stored in this browser only.'
        : 'This browser is blocking storage, so presets cannot be saved here.';
      return;
    }
    hintEl.textContent = 'Saved in this browser only — they will not follow you to another device.';
    presetsEl.innerHTML = list.map(function (p, i) {
      var w = p.w || LEGACY.w, h = p.h || LEGACY.h;
      return '<span class="preset">' +
        '<button class="load" data-i="' + i + '" type="button"><b>' + esc(p.name) + '</b>' +
        '<i>' + w + '×' + h + ' · H ' + p.gh + ' · V ' + p.gv + ' · R ' + p.r +
        ' · G ' + (p.g || LEGACY.g) + ' · ' + (p.pat === 'corner' ? 'corner lobes' : 'corner tucks') + '</i></button>' +
        '<button class="del" data-d="' + i + '" type="button" aria-label="Delete preset ' + esc(p.name) + '">×</button>' +
        '</span>';
    }).join('');
  }
  $('save').addEventListener('click', function () {
    var v = vals();
    var name = (nameEl.value || '').trim() || (W + '×' + H + ' H' + v.gh + ' V' + v.gv + ' R' + v.R);
    var list = readPresets(), at = -1;
    for (var i = 0; i < list.length; i++) if (list[i].name === name) at = i;
    var rec = { name: name, w: W, h: H, gh: v.gh, gv: v.gv, r: v.R, pat: pattern, g: groove };
    if (at >= 0) list[at] = rec; else list.push(rec);
    if (list.length > 24) list = list.slice(-24);
    writePresets(list); nameEl.value = ''; renderPresets();
  });
  presetsEl.addEventListener('click', function (e) {
    var load = e.target.closest('.load'), del = e.target.closest('.del');
    if (load) {
      var p = readPresets()[+load.dataset.i]; if (!p) return;
      linkEl.checked = (p.gh === p.gv);
      setAll(p.w || LEGACY.w, p.h || LEGACY.h, p.gh, p.gv, p.r, p.pat || 'classic', p.g || LEGACY.g);
    } else if (del) {
      var list = readPresets(); list.splice(+del.dataset.d, 1); writePresets(list); renderPresets();
    }
  });

  // ---- boot ----------------------------------------------------------------
  $('approvedInfo').textContent = DEF.w + '×' + DEF.h + ' · H ' + DEF.gh + ' · V ' + DEF.gv + ' · R ' + DEF.r + ' · G ' + DEF.g +
    ' · ' + (DEF.pat === 'corner' ? 'corner lobes' : 'corner tucks');
  var start = { w: DEF.w, h: DEF.h, gh: DEF.gh, gv: DEF.gv, r: DEF.r, link: true, pat: DEF.pat, g: DEF.g };
  try {
    var saved = localStorage.getItem(LS_STATE);
    if (saved) {
      var p = saved.split(',').map(Number);
      if (p.length >= 5 && p.every(function (n) { return isFinite(n); })) {
        start = { w: p[0], h: p[1], gh: p[2], gv: p[3], r: p[4], link: p.length > 5 ? !!p[5] : (p[2] === p[3]),
                  pat: p.length > 6 && !p[6] ? 'classic' : 'corner', g: p.length > 7 ? p[7] : DEF.g };
      }
    }
  } catch (e) {}

  roomW.value = start.w; roomH.value = start.h;
  linkEl.checked = start.link;
  setPattern(start.pat);
  setGroove(start.g);
  setRoom(start.w, start.h);
  ghEl.value = clamp(start.gh, ghEl); gvEl.value = clamp(start.gv, gvEl); radEl.value = clamp(start.r, radEl);
  ensureValid(); sync(); render(false); renderPresets();
})();
