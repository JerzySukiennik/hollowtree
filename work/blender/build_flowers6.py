"""Hollowtree -- the six meadow plants that shipped without a model.

dandelion, cornflower, field poppy, cherry blossom, lime blossom, heather.

Built on the same primitives as build_flowers.py (Builder / stalk / blade /
lin / mixc), so the six sit in the same visual language as daisy, clover,
harebell and spruce: flat shading, one triangle-cheap silhouette idea per
species, vertex colours carrying the whole read (dark at the base of a petal,
light at its point), no textures.

Blender is Z-up and the exporter maps +Z -> glTF +Y; everything grows along +Z
from Z=0. The engine merges the file into one geometry, rescales it so total
height equals species.height and reads an Empty named `head` as the gather
point, so each build returns that point in build space.
"""
import bpy, math, os, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from build_flowers import (Builder, lin, mixc, clamp, stalk, blade, curve_pts,
                           bez, frame, clear_scene, flower_material, fit_height,
                           export, OUT)


# --------------------------------------------------------------- palettes
# straight from FLOWER_SPECIES.colors in src/config.js, plus the couple of
# in-between tones each species needs to ramp without a texture
DANDELION = dict(petal=0xf6c33f, tip=0xffe27a, core=0xd18f1e, stem=0x4d7a33,
                 stem_dk=0x375c25, leaf=0x5f8c3c, leaf_dk=0x3f6528,
                 bract=0x466f2c)
CORNFLOWER = dict(petal=0x5a72d8, tip=0x8fa3f0, core=0x2f3f96, stem=0x6b8a56,
                  stem_dk=0x4e6a3e, leaf=0x7f9c68, cup=0x5c7346, cup_dk=0x3f512f)
POPPY = dict(petal=0xd93b2b, tip=0xf2705c, core=0x241812, stem=0x5f7f3c,
             stem_dk=0x445f2a, leaf=0x6d8f47, deep=0x8e2118, bud=0x5c7a3a)
CHERRY = dict(petal=0xf7d4de, tip=0xfff0f4, core=0xe8a7bb, stem=0x6b4a33,
              stem_dk=0x4a3122, leaf=0x6f8f42, bark=0x7d5a40)
LIME = dict(petal=0xe4e2a4, tip=0xf6f4c8, core=0xc9c069, stem=0x5c4a2e,
            stem_dk=0x40331f, leaf=0x6b8f3f, bract=0xcfd08a, bract_hi=0xe8e8b4)
HEATHER = dict(petal=0xb066b8, tip=0xd9a8dd, core=0x8e4f96, stem=0x5a4a35,
               stem_dk=0x3e3324, leaf=0x556b33, leaf_dk=0x3d4f24)


def unit(a, elev=0.0):
    ce, se = math.cos(elev), math.sin(elev)
    return Vector((math.cos(a) * ce, math.sin(a) * ce, se))


# ------------------------------------------------------------- shared parts
def toothed(B, root, dirv, length, width, c_base, c_tip, teeth=3, fold=0.18):
    """A runcinate (backward-toothed) basal leaf as one connected triangle strip.

    The points alternate left and right of the midrib and widen toward the end,
    so consecutive triangles share an edge and the blade is a single jagged
    ribbon. Built as separate triangles per tooth it came out as a chain of
    diamonds touching at their corners -- a dotted line, not a leaf.

    Costs 2*teeth - 1 triangles."""
    root = Vector(root)
    d = Vector(dirv).normalized()
    side = Vector((-d.y, d.x, 0.0))
    if side.length < 1e-6:
        side = Vector((1, 0, 0))
    side.normalize()
    n = 2 * teeth + 1
    pts = []
    for i in range(n):
        t = i / (n - 1)
        w = width * (0.28 + 0.72 * t)          # widest at the outer end
        s = 0.0 if i == 0 else (1.0 if i % 2 else -1.0)
        p = root + d * (length * t) + side * (w * s)
        # a rosette leaf lies down along its length, and the teeth dip a little
        # further so the blade never presents as a zero-width line
        p.z -= length * fold * t ** 1.4 + abs(s) * w * 0.16
        pts.append(p)
    for i in range(n - 2):
        c0 = mixc(c_base, c_tip, i / (n - 2))
        c1 = mixc(c_base, c_tip, min(1.0, (i + 2) / (n - 2)))
        B.tri(pts[i], pts[i + 1], pts[i + 2], c0, c1, c1)


def ragged_ray(B, base, dirv, length, spread, c_base, c_tip, notch=0.34):
    """One cornflower ray floret: a narrow funnel opening into three points.

    Two triangles, and the mouth is genuinely torn rather than a rounded tab,
    which is what separates a cornflower head from a small blue daisy."""
    base = Vector(base)
    d = Vector(dirv).normalized()
    u, v = frame(d)
    mouth = base + d * length
    tips = []
    for k in (-1, 0, 1):
        off = u * (spread * k)
        tips.append(mouth + off + d * (length * notch * (1 - abs(k))) + v * (spread * 0.18 * k))
    B.tri(base, tips[0], tips[1], c_base, c_tip, c_tip)
    B.tri(base, tips[1], tips[2], c_base, c_tip, c_tip)


def cup(B, cen, r, depth, sides, c_lo, c_hi, up=0.42):
    """the green involucre under a composite head: cone down, short crown up"""
    cen = Vector(cen)
    ring = [cen + unit(2 * math.pi * j / sides) * r for j in range(sides)]
    apex = cen - Vector((0, 0, depth))
    crown = cen + Vector((0, 0, depth * up))
    for j in range(sides):
        k = (j + 1) % sides
        B.tri(ring[k], ring[j], apex, c_lo, c_lo, c_lo)
        B.tri(ring[j], ring[k], crown, c_hi, c_hi, c_lo)


def pod(B, cen, r, h, sides, c_lo, c_hi):
    """a small closed ovoid -- poppy bud, cherry bud, seed capsule"""
    cen = Vector(cen)
    ring = [cen + unit(2 * math.pi * j / sides) * r for j in range(sides)]
    top = cen + Vector((0, 0, h * 0.55))
    bot = cen - Vector((0, 0, h * 0.45))
    for j in range(sides):
        k = (j + 1) % sides
        B.tri(ring[j], ring[k], top, c_hi, c_hi, c_hi)
        B.tri(ring[k], ring[j], bot, c_lo, c_lo, c_lo)


def stem_curve(ctrl):
    def at(z):
        best, bd = None, 1e9
        for i in range(121):
            p = bez(*ctrl, i / 120.0)
            if abs(p.z - z) < bd:
                bd, best = abs(p.z - z), p
        return best
    return at


# ================================================================ DANDELION
def build_dandelion():
    """height 3.8, head 3.3, r 1.0, budget 150.

    A composite head is a disc of many ray florets, so it is modelled as exactly
    that: two tiers of narrow folded rays off a green involucre. The hollow
    scape and the runcinate rosette carry the rest of the identification."""
    B = Builder()
    pal = DANDELION
    c_stem, c_stem_lo = lin(pal['stem']), lin(pal['stem_dk'])
    c_base, c_petal, c_tip = lin(pal['core']), lin(pal['petal']), lin(pal['tip'])
    c_bract, c_leaf, c_leaf_dk = lin(pal['bract']), lin(pal['leaf']), lin(pal['leaf_dk'])

    def head(cen, r, outer, inner):
        """A composite head is many short ray florets, not a few long spikes.

        The involucre is kept deliberately small: at a third of the head radius
        it read as a dark green spinning top with a star stuck on it, which is
        the wrong shape and the wrong value for something that should be almost
        entirely yellow."""
        cen = Vector(cen)
        cup(B, cen, r * 0.22, r * 0.28, 6, lin(pal['leaf_dk']), c_bract)
        for i in range(outer):
            a = 2 * math.pi * i / outer + 0.31
            d = unit(a, math.radians(7 + 11 * (i % 2)))
            root = cen + unit(a) * (r * 0.12) + Vector((0, 0, r * 0.05))
            tip = root + d * (r * (0.94 + 0.10 * (i % 2)))
            blade(B, root, tip, Vector((-d.y, d.x, 0)), r * 0.155, r * 0.115,
                  mixc(c_base, c_petal, 0.30), mixc(c_petal, c_tip, 0.55),
                  fold=0.42)
        for i in range(inner):
            a = 2 * math.pi * i / inner + 0.9
            d = unit(a, math.radians(38 + 14 * (i % 2)))
            root = cen + unit(a) * (r * 0.09) + Vector((0, 0, r * 0.09))
            tip = root + d * (r * 0.56)
            blade(B, root, tip, Vector((-d.y, d.x, 0)), r * 0.135, r * 0.10,
                  c_base, c_petal, fold=0.40)

    # two scapes: the open head the player gathers, and a smaller one alongside
    main = curve_pts(Vector((0, 0, 0.04)), Vector((0.10, -0.08, 1.7)),
                     Vector((-0.06, 0.05, 3.22)), 4)
    stalk(B, main, [0.10, 0.085, 0.075, 0.085], 3,
          [c_stem_lo, mixc(c_stem_lo, c_stem, 0.6), c_stem, c_stem],
          cap_start=False, cap_end=False)
    head((-0.06, 0.05, 3.30), 1.0, 14, 9)

    side = curve_pts(Vector((0.08, 0.06, 0.04)), Vector((0.62, 0.30, 1.25)),
                     Vector((0.96, 0.44, 2.38)), 3)
    stalk(B, side, [0.085, 0.070, 0.070], 3, [c_stem_lo, c_stem, c_stem],
          cap_start=False, cap_end=False)
    head((0.96, 0.44, 2.44), 0.66, 10, 0)

    for a, ln in ((0.4, 1.40), (2.35, 1.22), (4.15, 1.50)):
        toothed(B, (math.cos(a) * 0.14, math.sin(a) * 0.14, 0.18),
                Vector((math.cos(a), math.sin(a), 0.12)), ln, 0.34,
                c_leaf_dk, c_leaf, teeth=4)
    return B, Vector((-0.06, 0.05, 3.30))


# =============================================================== CORNFLOWER
def build_cornflower():
    """height 5.6, head 4.9, r 0.95, budget 150.

    The head is a tight scaly cup with a fringe of torn funnels -- deep blue at
    the throat, paler at the ragged points. The stem is deliberately thin and
    grey-green and the leaves are linear, both true of Centaurea cyanus."""
    B = Builder()
    pal = CORNFLOWER
    c_stem, c_stem_lo = lin(pal['stem']), lin(pal['stem_dk'])
    c_core, c_petal, c_tip = lin(pal['core']), lin(pal['petal']), lin(pal['tip'])
    c_cup, c_cup_dk = lin(pal['cup']), lin(pal['cup_dk'])

    def head(cen, r, outer, inner):
        cen = Vector(cen)
        cup(B, cen, r * 0.32, r * 0.44, 6, c_cup_dk, c_cup)
        for i in range(outer):
            a = 2 * math.pi * i / outer + 0.22
            d = unit(a, math.radians(21 + 13 * (i % 2)))
            ragged_ray(B, cen + unit(a) * (r * 0.20) + Vector((0, 0, r * 0.10)),
                       d, r * (0.92 + 0.14 * (i % 2)), r * 0.34, c_core, c_tip,
                       notch=0.44)
        for i in range(inner):
            a = 2 * math.pi * i / inner + 1.05
            d = unit(a, math.radians(58 + 14 * (i % 2)))
            ragged_ray(B, cen + Vector((0, 0, r * 0.14)), d, r * 0.50, r * 0.18,
                       c_core, mixc(c_petal, c_tip, 0.35), notch=0.5)

    CTRL = (Vector((0, 0, 0)), Vector((0.16, -0.10, 2.6)), Vector((-0.10, 0.06, 4.72)))
    at = stem_curve(CTRL)
    pts = curve_pts(*CTRL, 4)
    stalk(B, pts, [0.075, 0.060, 0.048, 0.044], 3,
          [c_stem_lo, mixc(c_stem_lo, c_stem, 0.6), c_stem, c_stem],
          cap_start=False, cap_end=False)
    head((-0.10, 0.06, 4.80), 0.95, 10, 6)

    for (zf, cen) in ((3.05, Vector((1.05, 0.52, 3.95))),
                      (2.35, Vector((-0.92, -0.60, 3.15)))):
        a = at(zf)
        stalk(B, [a, cen - Vector((0, 0, 0.16))], [0.048, 0.038], 3,
              [c_stem, c_stem], cap_start=False, cap_end=False)
        head(cen, 0.62, 8, 0)

    c_leaf = lin(pal['leaf'])
    for z, brg, ln in ((1.30, 0.7, 1.05), (2.05, 3.9, 0.92), (2.95, 2.2, 0.78)):
        p = at(z)
        d = Vector((math.cos(brg), math.sin(brg), 0.62)).normalized()
        blade(B, p, p + d * ln, Vector((-d.y, d.x, 0)), 0.10, 0.08,
              c_stem_lo, c_leaf, fold=0.6)
    return B, Vector((-0.10, 0.06, 4.80))


# ============================================================== FIELD POPPY
def build_poppy():
    """height 6.0, head 5.3, r 1.25, budget 150.

    Four broad scarlet petals, and the crumple is real geometry: each petal is a
    four-triangle fan whose rim alternates in radius and height, so the silhouette
    buckles instead of reading as a flat card. Dark blot at the centre, one
    nodding bud on a hairy stem."""
    B = Builder()
    pal = POPPY
    c_stem, c_stem_lo = lin(pal['stem']), lin(pal['stem_dk'])
    c_petal, c_tip, c_deep = lin(pal['petal']), lin(pal['tip']), lin(pal['deep'])
    c_core = lin(pal['core'])

    def petal(cen, a, r, segs=4):
        """One petal as a four-triangle fan whose rim alternates in radius AND
        height, so the sheet buckles. The arc is kept under 75 degrees: at 87 the
        four petals closed into a continuous ring and the flower read as a bowl
        rather than as four separate crumpled sheets."""
        cen = Vector(cen)
        base = cen + unit(a) * (r * 0.14) + Vector((0, 0, r * 0.06))
        rim = []
        for i in range(segs + 1):
            t = i / segs
            aa = a + (t - 0.5) * 1.30
            rr = r * (0.94 + 0.20 * ((i % 2) - 0.5))
            zz = r * (0.46 + 0.20 * (i % 2)) * (1 - abs(t - 0.5) * 0.55)
            rim.append(cen + unit(aa) * rr + Vector((0, 0, zz)))
        for i in range(segs):
            c1 = mixc(c_petal, c_tip, 0.30 + 0.5 * (i % 2))
            c2 = mixc(c_petal, c_tip, 0.80 - 0.5 * (i % 2))
            B.tri(base, rim[i], rim[i + 1], c_deep, c1, c2)

    def flower(cen, r, boss=True):
        cen = Vector(cen)
        for i in range(4):
            petal(cen, 2 * math.pi * i / 4 + 0.42, r)
        # the black blot, raised clear of the petal bases so it is actually seen
        ring = [cen + unit(2 * math.pi * j / 6) * (r * 0.34)
                + Vector((0, 0, r * 0.16)) for j in range(6)]
        top = cen + Vector((0, 0, r * 0.34))
        bot = cen - Vector((0, 0, r * 0.02))
        for j in range(6):
            k = (j + 1) % 6
            B.tri(ring[j], ring[k], top, c_core, c_core, mixc(c_core, c_deep, 0.4))
            B.tri(ring[k], ring[j], bot, c_core, c_core, c_core)
        if boss:
            for j in range(6):
                a = 2 * math.pi * j / 6 + 0.5
                p = cen + unit(a) * (r * 0.42) + Vector((0, 0, r * 0.24))
                B.tri(p, p + unit(a + 1.9) * (r * 0.10),
                      p + Vector((0, 0, r * 0.18)), c_core, c_core, c_deep)

    CTRL = (Vector((0, 0, 0)), Vector((-0.22, 0.14, 2.9)), Vector((0.14, -0.10, 5.30)))
    at = stem_curve(CTRL)
    stalk(B, curve_pts(*CTRL, 4), [0.085, 0.068, 0.055, 0.050], 3,
          [c_stem_lo, mixc(c_stem_lo, c_stem, 0.6), c_stem, c_stem],
          cap_start=False, cap_end=False)
    flower((0.14, -0.10, 5.30), 1.25)

    # second, smaller flower
    a2 = at(3.10)
    c2 = Vector((1.34, 0.72, 4.02))
    stalk(B, [a2, c2 - Vector((0, 0, 0.12))], [0.055, 0.044], 3, [c_stem, c_stem],
          cap_start=False, cap_end=False)
    flower(c2, 0.78, boss=False)

    # the nodding bud: hooked stem, head hanging below its own attachment
    a3 = at(2.55)
    hook = curve_pts(a3, Vector((-1.30, -0.54, 3.85)), Vector((-1.42, -0.64, 3.02)), 4)
    stalk(B, hook, [0.055, 0.046, 0.040, 0.036], 3,
          [c_stem, c_stem, c_stem, lin(pal['bud'])], cap_start=False, cap_end=False)
    pod(B, (-1.42, -0.64, 2.86), 0.24, 0.60, 5, lin(pal['bud']), lin(pal['leaf']))

    c_leaf = lin(pal['leaf'])
    for z, brg, ln in ((1.05, 0.9, 1.30), (1.90, 4.0, 1.12)):
        toothed(B, at(z), Vector((math.cos(brg), math.sin(brg), 0.42)), ln, 0.30,
                c_stem_lo, c_leaf, teeth=4, fold=0.10)
    return B, Vector((0.14, -0.10, 5.30))


# =========================================================== CHERRY BLOSSOM
def build_cherry():
    """height 11.5, head 9.4, r 1.35, budget 210.

    A cut sprig, not a tree: one woody twig, three side shoots, six five-petalled
    blossoms and a few tight buds. Petals are pale pink at the base and near-white
    at the rim, which is the way the real thing reads at a distance."""
    B = Builder()
    pal = CHERRY
    c_bark, c_bark_lo = lin(pal['bark']), lin(pal['stem_dk'])
    c_stem = lin(pal['stem'])
    c_core, c_petal, c_tip = lin(pal['core']), lin(pal['petal']), lin(pal['tip'])

    def blossom(cen, tilt_a, tilt_e, r, rich=False):
        """Five petals around a darker boss.

        `rich` spends three triangles a petal on a notched tip; the plain form
        spends two. Buying the plain form for the smaller blossoms is what pays
        for eight blossoms on the sprig instead of six, and a flowering sprig
        with too few blooms on it is a bare stick with decorations.

        The tint sits on `petal` for most of the sheet and only touches `tip` at
        the outer points: ramping the whole petal to the tip colour turned the
        blossoms near-white and they disappeared against a bright sky."""
        cen = Vector(cen)
        d = unit(tilt_a, tilt_e)
        u, v = frame(d)
        c_mid = mixc(c_core, c_petal, 0.55)
        c_edge = c_petal
        for i in range(5):
            a = 2 * math.pi * i / 5 + 0.35
            ca, sa = math.cos(a), math.sin(a)
            radial = (u * ca + v * sa)
            perp = (u * -sa + v * ca)
            base = cen + radial * (r * 0.16) + d * (r * 0.06)
            mid = cen + radial * (r * 0.92) + d * (r * 0.30)
            l = mid + perp * (r * 0.40) - d * (r * 0.04)
            rr = mid - perp * (r * 0.40) - d * (r * 0.04)
            if rich:
                wl = cen + radial * (r * 0.50) + perp * (r * 0.32) + d * (r * 0.16)
                wr = cen + radial * (r * 0.50) - perp * (r * 0.32) + d * (r * 0.16)
                B.tri(base, wl, l, c_core, c_mid, c_edge)
                B.tri(base, l, rr, c_core, c_edge, c_edge)
                B.tri(base, rr, wr, c_core, c_edge, c_mid)
            else:
                wl = cen + radial * (r * 0.46) + perp * (r * 0.34) + d * (r * 0.16)
                wr = cen + radial * (r * 0.46) - perp * (r * 0.34) + d * (r * 0.16)
                B.tri(base, wl, l, c_core, c_mid, c_edge)
                B.tri(base, l, wr, c_core, c_edge, c_mid)
        ring = [cen + (u * math.cos(2 * math.pi * j / 5 + 0.35)
                       + v * math.sin(2 * math.pi * j / 5 + 0.35)) * (r * 0.22)
                + d * (r * 0.06) for j in range(5)]
        apex = cen + d * (r * 0.28)
        for j in range(5):
            B.tri(ring[j], ring[(j + 1) % 5], apex, c_core, c_core,
                  mixc(c_core, c_tip, 0.35))

    CTRL = (Vector((0, 0, 0)), Vector((0.42, -0.26, 5.6)), Vector((-0.30, 0.18, 10.9)))
    at = stem_curve(CTRL)
    stalk(B, curve_pts(*CTRL, 5), [0.30, 0.24, 0.19, 0.15, 0.11], 3,
          [c_bark_lo, mixc(c_bark_lo, c_bark, 0.55), c_bark, c_bark, c_bark],
          cap_start=False, cap_end=False)

    shoots = [(6.30, Vector((2.05, 0.95, 7.75)), 0.13),
              (7.70, Vector((-2.20, -0.70, 8.60)), 0.12),
              (3.10, Vector((1.70, -1.45, 4.55)), 0.11)]
    tips = []
    for z, tip, r0 in shoots:
        a = at(z)
        stalk(B, [a, (a + tip) * 0.5 + Vector((0, 0, 0.25)), tip],
              [r0, r0 * 0.8, r0 * 0.62], 3, [c_bark, c_bark, c_bark],
              cap_start=False, cap_end=False)
        tips.append(tip)

    # the gather blossom sits clear of the twig at the config's head height; the
    # sprig then carries on above it, which is what makes it read as a cut branch
    # Every blossom is tilted well above the horizon. Half of the first pass sat
    # near edge-on and vanished into slivers, and the engine spins each instance
    # about its own vertical, so a blossom that only reads from one bearing
    # reads from no bearing at all.
    HEAD = Vector((-0.78, 0.50, 9.42))
    blossom(HEAD, 0.4, math.radians(72), 1.35, rich=True)
    blossom(Vector((-0.86, 0.54, 10.78)), 2.5, math.radians(80), 1.00, rich=True)
    blossom(tips[0] + Vector((0.16, 0.10, 0.36)), 0.9, math.radians(70), 1.10)
    blossom(tips[0] + Vector((-0.66, -0.34, -0.22)), 3.6, math.radians(64), 0.86)
    blossom(tips[1] + Vector((-0.18, -0.12, 0.34)), 3.5, math.radians(74), 1.08)
    blossom(tips[2] + Vector((0.18, -0.16, 0.30)), 5.6, math.radians(68), 0.98)
    blossom(Vector((0.34, 0.66, 6.60)), 1.9, math.radians(66), 0.88)

    for p, r in ((tips[1] + Vector((0.50, 0.34, -0.40)), 0.24),
                 (Vector((0.44, -0.42, 8.40)), 0.22),
                 (Vector((-0.52, -0.46, 5.55)), 0.20)):
        pod(B, p, r, r * 2.1, 4, c_core, c_tip)

    c_leaf = lin(pal['leaf'])
    for z, brg, ln in ((2.60, 1.1, 1.25), (5.20, 4.3, 1.10), (8.10, 2.6, 0.95)):
        p = at(z)
        d = Vector((math.cos(brg), math.sin(brg), 0.45)).normalized()
        blade(B, p, p + d * ln, Vector((-d.y, d.x, 0)), 0.30, 0.24,
              lin(pal['stem_dk']), c_leaf, fold=0.35)
    return B, HEAD


# ============================================================= LIME BLOSSOM
def build_lime():
    """height 12.6, head 10.2, r 1.2, budget 210.

    Tilia's whole silhouette is one strange thing: every flower cluster hangs
    from the midrib of a pale strap-shaped bract. So the bract is the biggest
    single shape in the model and the cream florets hang under it -- five
    clusters, each bract + peduncle + three florets."""
    B = Builder()
    pal = LIME
    c_bark, c_bark_lo = lin(pal['stem']), lin(pal['stem_dk'])
    c_core, c_petal, c_tip = lin(pal['core']), lin(pal['petal']), lin(pal['tip'])
    c_br, c_br_hi = lin(pal['bract']), lin(pal['bract_hi'])

    def floret(cen, r):
        """A cream star hanging mouth-down: four petals splayed off a dark throat.

        Wider and flatter than the first pass, where the petals stayed steep and
        the whole cluster read as a row of tiny tents rather than as flowers."""
        cen = Vector(cen)
        top = cen + Vector((0, 0, r * 0.42))
        for j in range(4):
            a = 2 * math.pi * j / 4 + 0.4
            p = cen + unit(a) * (r * 1.25) - Vector((0, 0, r * 0.26))
            q = cen + unit(a + math.pi / 2) * (r * 1.25) - Vector((0, 0, r * 0.26))
            B.tri(top, p, q, c_core, c_tip, mixc(c_petal, c_tip, 0.5))

    def cluster(node, brg, size):
        """bract, peduncle and three florets -- the whole Tilia tell in 22 tris"""
        node = Vector(node)
        # The strap bract hangs at a real angle rather than lying flat: held
        # horizontal it presented as a thin white line from every side view and
        # the tree read as a pole hung with saucers.
        d = Vector((math.cos(brg), math.sin(brg), -0.62)).normalized()
        side = Vector((-d.y, d.x, 0)).normalized()
        rootp = node + d * (size * 0.15)
        tipp = node + d * (size * 2.0)
        blade(B, rootp, tipp, side, size * 0.30, size * 0.26, c_br, c_br_hi, fold=0.22)
        hang = node + d * (size * 0.90) - Vector((0, 0, size * 0.06))
        stalk(B, [hang, hang - Vector((0, 0, size * 0.66))],
              [size * 0.045, size * 0.038], 3, [lin(pal['leaf']), c_core],
              cap_start=False, cap_end=False)
        hub = hang - Vector((0, 0, size * 0.52))
        for j in range(3):
            a = 2 * math.pi * j / 3 + brg
            floret(hub + unit(a) * (size * 0.30) - Vector((0, 0, size * 0.08 * (j % 2))),
                   size * 0.34)
        return hub

    CTRL = (Vector((0, 0, 0)), Vector((-0.36, 0.22, 6.3)), Vector((0.26, -0.16, 12.45)))
    at = stem_curve(CTRL)
    stalk(B, curve_pts(*CTRL, 5), [0.30, 0.25, 0.20, 0.16, 0.12], 3,
          [c_bark_lo, mixc(c_bark_lo, c_bark, 0.55), c_bark, c_bark, c_bark],
          cap_start=False, cap_end=False)

    for z, tip in ((8.30, Vector((1.95, 0.90, 10.05))),
                   (9.60, Vector((-2.00, -0.78, 10.80))),
                   (6.40, Vector((1.70, -1.10, 7.85))),
                   (7.30, Vector((-1.80, 0.85, 8.60)))):
        a = at(z)
        stalk(B, [a, tip], [0.12, 0.09], 3, [c_bark, c_bark],
              cap_start=False, cap_end=False)

    HEAD = None
    # the head cluster hangs at the config head height; the crown carries on above
    # and four more hang down the branches, so the trunk is not a bare pole
    specs = [(Vector((0.26, -0.16, 11.45)), 0.55, 1.30),
             (Vector((0.24, -0.14, 12.30)), 3.40, 1.00),
             (Vector((1.95, 0.90, 10.05)), 0.95, 1.10),
             (Vector((-2.00, -0.78, 10.80)), 3.90, 1.05),
             (Vector((-0.16, 0.26, 9.60)), 5.60, 0.95),
             (Vector((1.70, -1.10, 7.85)), 5.10, 1.00),
             (Vector((-1.80, 0.85, 8.60)), 2.30, 0.95)]
    for i, (node, brg, size) in enumerate(specs):
        hub = cluster(node, brg, size)
        if i == 0:
            HEAD = hub + Vector((0, 0, 0.05))

    c_leaf = lin(pal['leaf'])
    for z, brg, ln in ((3.80, 1.2, 1.55), (5.90, 4.5, 1.40), (7.40, 2.7, 1.20)):
        p = at(z)
        d = Vector((math.cos(brg), math.sin(brg), 0.30)).normalized()
        blade(B, p, p + d * ln, Vector((-d.y, d.x, 0)), 0.48, 0.36,
              c_bark_lo, c_leaf, fold=0.30)
    return B, HEAD


# ==================================================================== HEATHER
def build_heather():
    """height 5.2, head 4.4, r 0.62, budget 180.

    A wiry shrub, not a flower on a stalk: three woody stems off one base, each
    ending in a dense spike of tiny urn-shaped bells that get smaller and paler
    toward the tip. Scale leaves along the wood."""
    B = Builder()
    pal = HEATHER
    c_wood, c_wood_lo = lin(pal['stem']), lin(pal['stem_dk'])
    c_core, c_petal, c_tip = lin(pal['core']), lin(pal['petal']), lin(pal['tip'])
    c_leaf, c_leaf_dk = lin(pal['leaf']), lin(pal['leaf_dk'])

    def bell(cen, r, h, k, phase=0.0):
        """One urn: a three-sided cone hanging mouth-down, capped above.

        Four triangles, not six. Halving the width and dropping to three sides
        turned the first pass -- squat four-sided pyramids that read as tiny
        parasols -- into narrow bells, and the two triangles saved per bell are
        exactly what buys a spike dense enough to be called one."""
        cen = Vector(cen)
        ring = [cen + unit(2 * math.pi * j / 3 + phase) * r for j in range(3)]
        mouth = cen - Vector((0, 0, h * 0.78))
        top = cen + Vector((0, 0, h * 0.26))
        c_hi = mixc(c_petal, c_tip, clamp(k))
        for j in range(3):
            n = (j + 1) % 3
            B.tri(ring[n], ring[j], mouth, c_petal, c_petal, c_hi)
        B.tri(ring[0], ring[1], ring[2], c_core, c_core, c_core)

    # (base, mid, top, wood height, scale, bells on the spike) -- the two side
    # stems carry one bell fewer each, which is what lands the shrub on budget
    stems = [((0.00, 0.00), (0.18, -0.10), (-0.10, 0.06), 3.05, 1.00, 8),
             ((0.16, 0.12), (0.66, 0.38), (0.94, 0.54), 2.20, 0.80, 7),
             ((-0.18, -0.10), (-0.62, 0.24), (-0.88, 0.40), 2.50, 0.86, 7)]
    HEAD = None
    for si, (a0, a1, a2, top_z, sc, nb) in enumerate(stems):
        ctrl = (Vector((a0[0], a0[1], 0)), Vector((a1[0], a1[1], top_z * 0.52)),
                Vector((a2[0], a2[1], top_z)))
        at = stem_curve(ctrl)
        stalk(B, curve_pts(*ctrl, 4), [0.075 * sc, 0.060 * sc, 0.048 * sc, 0.040 * sc],
              3, [c_wood_lo, mixc(c_wood_lo, c_wood, 0.6), c_wood, c_wood],
              cap_start=False, cap_end=False)
        # the spike: six bells alternating around a short continuation of the wood
        spike_h = 2.05 * sc
        tipv = Vector((a2[0], a2[1], top_z))
        axis_top = tipv + Vector((0, 0, spike_h))
        stalk(B, [tipv, axis_top], [0.038 * sc, 0.024 * sc], 3, [c_wood, c_wood],
              cap_start=False, cap_end=False)
        n = nb
        for i in range(n):
            t = i / (n - 1)
            a = 2.4 * i + si
            r = 0.62 * sc * (0.32 - 0.12 * t)
            # hugging the axis: pushed out to a third of the head radius the
            # bells floated free of the wood and read as scattered confetti
            cen = tipv + Vector((0, 0, spike_h * (0.05 + 0.94 * t))) \
                + unit(a) * (0.62 * sc * (0.20 - 0.08 * t))
            bell(cen, r, 0.52 * sc * (1.0 - 0.26 * t), 0.15 + 0.75 * t, phase=a)
        if si == 0:
            # mid-spike, so the gather point sits in the body of the flowering
            # part rather than on one bell that a breeze could point away
            HEAD = tipv + Vector((0, 0, spike_h * 0.50))
        # scale leaves hugging the wood
        for z in (0.55 * top_z, 0.78 * top_z):
            p = at(z)
            d = Vector((math.cos(z * 3.1 + si), math.sin(z * 3.1 + si), 0.75)).normalized()
            blade(B, p, p + d * (0.52 * sc), Vector((-d.y, d.x, 0)),
                  0.075 * sc, 0.055 * sc, c_leaf_dk, c_leaf, fold=0.5)
    if HEAD is None:
        HEAD = Vector((0, 0, 4.4))
    return B, HEAD


# ------------------------------------------------------------------- driver
SPEC = [
    ('dandelion', build_dandelion, 3.8, 150),
    ('cornflower', build_cornflower, 5.6, 150),
    ('poppy', build_poppy, 6.0, 150),
    ('cherry', build_cherry, 11.5, 210),
    ('lime', build_lime, 12.6, 210),
    ('heather', build_heather, 5.2, 180),
]


def make(name, fn, height, budget):
    clear_scene()
    mat = flower_material()
    B, head = fn()
    ob = B.to_object(name)
    ob.data.materials.append(mat)
    zs = [v.co.z for v in ob.data.vertices]
    raw = max(zs) - min(zs)
    k, lo = fit_height(ob, height)
    head = Vector(head)
    head = Vector((head.x * k, head.y * k, (head.z - lo) * k))
    tris = len(ob.data.polygons)
    flag = 'OK ' if tris <= budget else 'OVER'
    print('%-11s tris=%-4d budget=%-4d %s  authored_h=%.3f target=%.3f k=%.4f head_z=%.3f'
          % (name, tris, budget, flag, raw, height, k, head.z))
    export(name, ob, head)
    return tris


def run(only=None):
    for name, fn, h, budget in SPEC:
        if only and name not in only:
            continue
        make(name, fn, h, budget)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    run(set(argv) if argv else None)
