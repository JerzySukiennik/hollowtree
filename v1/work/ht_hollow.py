"""Builds assets/models/hollow.glb - the interior hall of the hollow tree.

Game space (Y up): x in [-48,48] (width 96), y in [0,63.64], z in [-32,32].
The engine seats the model with its bottom at floorY (world 3.2) and scales the
bbox to width x height x depth, so model-local y = world y - 3.2.  The engine's
entrance line is world y=16 -> model y=12.8; the aperture is opened tall enough
(model y ~9.7..17.5) that both that line and a y=16 model-space reading pass
cleanly through it.
Built in game space and converted to Blender Z-up on the fly; the exporter
converts it back.
"""
import math
import os
import sys
import bpy

HERE = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/work'
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import ht_common as C
import importlib
importlib.reload(C)

W, H, D = 96.0, 63.64, 64.0
HX, HZ = W * 0.5, D * 0.5
ENT_X, ENT_Y = 0.0, 13.6            # aperture centre (model space)
ENT_RX, ENT_RY = 3.6, 3.9           # aperture half-extents at the mouth
SKY = [(-21.12, 8.32), (21.12, -8.32)]

SHADOW = C.hexc(0x14100b)
WOOD_D = C.hexc(0x3a2a1b)
WOOD_L = C.hexc(0x6b503a)
WARM = C.hexc(0xb87d3c)
COOL = C.hexc(0x8f8b7e)
AMBER = C.hexc(0xc98a3c)

# ---------------------------------------------------------------- ledge plan
# Mirrors interior.js galleryBoxes / alcoveBoxes / landingBox in model space, so
# the visible shelves sit on the colliders the player actually perches on.

RUN_LONG, RUN_SHORT = W * 0.56, D * 0.66
LEDGE_TH, LEDGE_DP = 0.7, 5.2
GAL_Y = [C.lerp(0.17, 0.86, t / 3.0) * H for t in range(4)]
ALC_W, ALC_D, ALC_TH = 14.0, 10.5, 0.98
ALC_CORNERS = [(-HX, -HZ, 1, 1), (HX, -HZ, -1, 1), (-HX, HZ, 1, -1), (HX, HZ, -1, -1)]
SEED = {'-z': 1.3, '-x': 2.7, '+x': 4.1, '+z': 5.9}


def gallery_specs():
    out = []
    for t, y in enumerate(GAL_Y):
        sw = (1 if t % 2 == 0 else -1) * 0.16
        out.append(('-z', t, W * sw, y))
        out.append(('+z', t, W * sw, y))
        out.append(('-x', t, -D * sw, y))
        out.append(('+x', t, -D * sw, y))
    return out


def alcove_specs():
    out = []
    for i, (x, z, sx, sz) in enumerate(ALC_CORNERS):
        for t in range(3):
            k = min(1.0, (t + (i % 2) * 0.5) / 2.5)
            y = C.lerp(0.22, 0.80, k) * H
            out.append((min(x, x + sx * ALC_W), max(x, x + sx * ALC_W),
                        min(z, z + sz * ALC_D), max(z, z + sz * ALC_D), y))
    return out


ALC_BOXES = alcove_specs()
LANDING = (ENT_X - 13.5, ENT_X + 13.5, HZ - 11.0, HZ, 12.8 - 3.2 * 0.8)

_SHADOW_BOXES = []
for (_side, _t, _c, _ly) in gallery_specs():
    if _side in ('-z', '+z'):
        _run = RUN_LONG * 1.34
        _z0 = -HZ if _side == '-z' else HZ - 19.0
        _SHADOW_BOXES.append((_c - _run * 0.5, _c + _run * 0.5, _z0, _z0 + 19.0, _ly))
    else:
        _run = RUN_SHORT * 1.34
        _x0 = -HX if _side == '-x' else HX - 19.0
        _SHADOW_BOXES.append((_x0, _x0 + 19.0, _c - _run * 0.5, _c + _run * 0.5, _ly))
_SHADOW_BOXES.extend(ALC_BOXES)
_SHADOW_BOXES.append(LANDING)


def ledge_shadow(x, y, z):
    """How much sky a point loses to a shelf overhead (0..1)."""
    worst = 0.0
    for (x0, x1, z0, z1, ly) in _SHADOW_BOXES:
        dy = ly - y
        if dy < 0.0 or dy > 9.0:
            continue
        inx = C.smooth(-2.5, 1.5, min(x - x0, x1 - x))
        inz = C.smooth(-2.5, 1.5, min(z - z0, z1 - z))
        f = (1.0 - dy / 9.0) ** 1.5
        if dy < 2.0:                                  # hard contact shadow
            f = max(f, 0.72 + 0.28 * (1.0 - dy / 2.0))
        worst = max(worst, inx * inz * f)
    return worst


# ---------------------------------------------------------------- shading

def hall_color(pb, shadow=True):
    x, y, z = C.b2g(pb)
    dxw = min(x + HX, HX - x)
    dzw = min(z + HZ, HZ - z)
    ao = C.clamp((dxw + dzw) / 26.0)
    ao *= 0.18 + 0.82 * C.clamp(y / 8.0)
    ao *= 0.34 + 0.66 * C.clamp((H - y) / 10.0)
    vgrad = C.clamp(y / (H * 0.80))
    k = C.clamp(0.03 + 0.88 * (0.62 * ao + 0.38 * vgrad))

    k *= 1.0 - 0.84 * C.smooth(0.58, 1.0, y / H)          # sooty crown
    k += 0.30 * C.smooth(12.0, 0.0, y) * C.clamp(0.3 + 0.7 * ao)   # floor bounce
    occ = ledge_shadow(x, y, z) * C.smooth(2.0, 9.0, y) if shadow else 0.0
    k *= 1.0 - 0.92 * occ                                 # shelves cast down
    k = C.clamp(k)

    base = C.mix(SHADOW, WOOD_D, C.clamp(k * 2.1))
    base = C.mix(base, WOOD_L, C.smooth(0.62, 1.0, k))

    g = 0.5 + 0.5 * C.fbm(x * 1.15, y * 0.22, z * 1.15)
    base = C.scale(base, 0.78 + 0.28 * g)

    de = math.dist((x, y, z), (ENT_X, ENT_Y, HZ - 2.0))
    ent = C.clamp(1.35 / (1.0 + (de / 16.0) ** 2), 0.0, 0.88)
    base = C.mix(base, C.scale(WARM, 0.75 + 0.5 * ent), ent)

    base = C.scale(base, 1.0 - 0.46 * occ)                # contact darkening

    sk = 0.0
    for sx, sz in SKY:
        ds = math.dist((x, y, z), (sx, H - 2.5, sz))
        sk += 1.0 / (1.0 + (ds / 11.0) ** 2)
    base = C.mix(base, COOL, C.clamp(sk, 0.0, 0.44))
    return base


def pool_color(pb):
    x, y, z = C.b2g(pb)
    g = 0.5 + 0.5 * C.fbm(x * 2.0, y, z * 2.0)
    return C.scale(AMBER, 0.80 + 0.35 * g)


# ---------------------------------------------------------------- wall field

RIB_P = 12.0
RIB_W = 0.145 * RIB_P
SWELL_P = 31.0


def rib_lines(a, b, seed):
    out = [a, b]
    off = seed * 1.7 % RIB_P
    k0 = int(math.floor((a - off) / RIB_P)) - 1
    k1 = int(math.ceil((b - off) / RIB_P)) + 1
    for k in range(k0, k1 + 1):
        c = off + k * RIB_P
        for d in (-0.50, -0.26, -0.115, 0.0, 0.115, 0.26):
            v = c + d * RIB_P
            if a < v < b:
                out.append(v)
    return sorted(set(round(v, 4) for v in out))


def tier_damp(y):
    """1 at a shelf tier: the wall is thin there so a shelf can seat on it."""
    d = 0.0
    for ty in GAL_Y:
        d = max(d, math.exp(-((y - ty) / 3.4) ** 2))
    return d


def wall_disp(u, y, seed):
    off = seed * 1.7 % RIB_P
    dc = abs(((u - off + RIB_P * 0.5) % RIB_P) - RIB_P * 0.5)
    ribs = 5.4 * math.exp(-(dc / RIB_W) ** 2)
    ribs *= 0.55 + 0.45 * C.clamp(y / 16.0)
    ribs *= 0.80 + 0.20 * math.sin(u * 0.21 + y * 0.05 + seed)

    swell = 10.4 * (0.5 + 0.5 * math.sin(u * (2 * math.pi / SWELL_P) + seed * 2.2
                                        + y * 0.045))
    swell *= 0.45 + 0.55 * (0.5 + 0.5 * C.fbm(u * 0.35, y * 0.09, seed))
    grain = 1.5 * (0.5 + 0.5 * C.fbm(u * 1.9, y * 0.20, seed * 9.0))
    flare = 4.2 * C.smooth(13.0, 0.0, y)
    wave = 1.4 * (0.5 + 0.5 * math.sin(y * 0.085 + u * 0.06 + seed))

    body = (ribs + swell + grain + flare + wave) * (1.0 - 0.70 * tier_damp(y))
    taper = 8.6 * C.smooth(0.20, 1.0, y / H) ** 1.15      # the trunk closes in
    waist = 4.4 * math.exp(-((y - 33.0) / 11.0) ** 2)     # pinched mid-trunk
    return max(0.0, body + taper + waist * (1.0 - 0.7 * tier_damp(y)))


def wall_inset(axis, y, seed):
    """Worst-case wall thickness across a tier, used to size the shelves."""
    a, b = (-HX, HX) if axis == 'x' else (-HZ, HZ)
    return max(wall_disp(a + (b - a) * i / 24.0, y, seed) for i in range(25))


def entrance_bulge(u, y):
    du, dy = u - ENT_X, y - ENT_Y
    r = math.hypot(du, dy * 0.95)
    a = math.atan2(dy, du)
    lop = 1.0 + 0.42 * math.cos(a * 2 + 0.7) + 0.18 * math.cos(a * 3)
    return 4.2 * lop * math.exp(-((r - 9.5) / 5.4) ** 2) - 1.9 * math.exp(-(r / 6.4) ** 2)


# ---------------------------------------------------------------- floor/ceiling

ROOTS = [(-30, -18, 11.0, 4.4), (18, 12, 12.5, 4.8), (-8, 21, 7.5, 3.0),
         (34, -8, 9.0, 3.6), (2, -25, 13.0, 4.0), (-42, 8, 8.0, 3.2),
         (12, -2, 6.0, 2.0), (-18, 5, 5.5, 1.8), (44, 20, 9.0, 3.4),
         (-24, -30, 8.0, 2.8)]
PILLARS = ((-22.08, -12.8), (22.08, 12.8), (-9.27, 12.8), (9.27, -12.8))
POOLS = [(-16.0, -20.0, 5.6), (26.0, 6.0, 4.6), (-34.0, 14.0, 3.8),
         (6.0, 22.0, 4.2)]


def floor_h(x, z):
    h = 0.7 + 0.7 * C.fbm(x * 0.9, 0.0, z * 0.9)
    for cx, cz, r, a in ROOTS:
        h += a * math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r))
    for i, (px, pz) in enumerate(PILLARS):
        dx, dz = x - px, z - pz
        d = math.hypot(dx, dz)
        if d < 1e-3:
            continue
        lobes = 0.5 + 0.5 * math.cos(math.atan2(dz, dx) * 3 + i * 1.9)
        h += 3.6 * lobes ** 2 * math.exp(-(d / 17.0) ** 1.6) * C.smooth(0.0, 4.0, d)
    h += 1.3 * (0.5 + 0.5 * math.sin(x * 0.21 + z * 0.13))
    h += 0.8 * (0.5 + 0.5 * math.sin(x * 0.47 - z * 0.39 + 1.7))
    for (px, pz, pr) in POOLS:
        h -= 2.2 * math.exp(-(math.hypot(x - px, z - pz) / (pr * 1.15)) ** 2)
    return max(0.0, h)


def ceil_h(x, z):
    base = H - 3.6 - 2.6 * (0.5 + 0.5 * C.fbm(x * 0.7, 40.0, z * 0.7))
    for sx, sz in SKY:
        d = math.dist((x, z), (sx, sz))
        base += 5.2 * math.exp(-(d / 7.4) ** 2)
        base -= 1.9 * math.exp(-((d - 11.0) / 5.0) ** 2)
    return min(H, base)


# ---------------------------------------------------------------- grids

YL = [0, 3.2, 6.4, 8.4, 11.0, 13.6, 16.2, 18.8, 23.0, 27.5, 32.5, 38.0,
      43.5, 49.0, 54.0, 58.5, H]
HOLE_U = (-6.4, -3.2, 0.0, 3.2, 6.4)
HOLE_Y = (8.4, 11.0, 13.6, 16.2, 18.8)


def _entrance_clean(vals):
    keep = [v for v in vals
            if not (-6.4 < v < 6.4) or abs(v) < 1e-6 or abs(abs(v) - 3.2) < 1e-6]
    return sorted(set(list(keep) + list(HOLE_U)))


XL = _entrance_clean(rib_lines(-HX, HX, SEED['+z']))
XL_BACK = rib_lines(-HX, HX, SEED['-z'])
ZL_LEFT = rib_lines(-HZ, HZ, SEED['-x'])
ZL_RIGHT = rib_lines(-HZ, HZ, SEED['+x'])


def build_shell(mb):
    fx = [-HX + W * i / 26 for i in range(27)]
    fz = [-HZ + D * i / 18 for i in range(19)]
    grid = [[mb.vert((x, floor_h(x, z), z)) for z in fz] for x in fx]
    for i in range(len(fx) - 1):
        for j in range(len(fz) - 1):
            mb.face((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]),
                    (0, 1, 0))

    cx = [-HX + W * i / 16 for i in range(17)]
    cz = [-HZ + D * i / 11 for i in range(12)]
    cg = [[mb.vert((x, ceil_h(x, z), z)) for z in cz] for x in cx]
    for i in range(len(cx) - 1):
        for j in range(len(cz) - 1):
            mb.face((cg[i][j], cg[i][j + 1], cg[i + 1][j + 1], cg[i + 1][j]),
                    (0, -1, 0))

    def wall(axis, sign, ul, seed, hole=None, bulge=False):
        inward = (-sign, 0, 0) if axis == 'x' else (0, 0, -sign)

        def pos(u, y):
            d = wall_disp(u, y, seed)
            if bulge:
                d = max(0.0, d + entrance_bulge(u, y))
            if axis == 'x':
                return (sign * (HX - d), y, u)
            return (u, y, sign * (HZ - d))

        g = [[mb.vert(pos(u, y)) for y in YL] for u in ul]
        for i in range(len(ul) - 1):
            for j in range(len(YL) - 1):
                if hole and (hole[0] - 1e-3 <= ul[i] and ul[i + 1] <= hole[1] + 1e-3
                             and hole[2] - 1e-3 <= YL[j] and YL[j + 1] <= hole[3] + 1e-3):
                    continue
                mb.face((g[i][j], g[i][j + 1], g[i + 1][j + 1], g[i + 1][j]), inward)
        return g, pos

    wall('z', -1, XL_BACK, SEED['-z'])
    wall('x', -1, ZL_LEFT, SEED['-x'])
    wall('x', 1, ZL_RIGHT, SEED['+x'])
    gz, posz = wall('z', 1, XL, SEED['+z'],
                    hole=(HOLE_U[0], HOLE_U[-1], HOLE_Y[0], HOLE_Y[-1]), bulge=True)

    # square hole -> stitch ring -> elliptical mouth at the wall plane
    ui = [XL.index(v) for v in HOLE_U]
    yi = [YL.index(v) for v in HOLE_Y]
    loop = [(i, yi[0]) for i in ui]
    loop += [(ui[4], j) for j in yi[1:]]
    loop += [(i, yi[4]) for i in reversed(ui[:4])]
    loop += [(ui[0], j) for j in reversed(yi[1:4])]
    assert len(loop) == 16, len(loop)

    ring, mouth, angs = [], [], []
    for (i, j) in loop:
        u, y = XL[i], YL[j]
        a = math.atan2((y - ENT_Y) * 1.35, u - ENT_X)
        angs.append(a)
        ring.append(mb.vert(posz(ENT_X + math.cos(a) * 5.2, ENT_Y + math.sin(a) * 4.4)))
        mouth.append(mb.vert((ENT_X + math.cos(a) * ENT_RX * (1 + 0.06 * math.cos(a * 3)),
                              ENT_Y + math.sin(a) * ENT_RY * (1 + 0.05 * math.sin(a * 2)),
                              HZ)))

    for n in range(16):
        m = (n + 1) % 16
        a, b = loop[n], loop[m]
        mb.face((gz[a[0]][a[1]], gz[b[0]][b[1]], ring[m], ring[n]), (0, 0, -1))
        mb.face((ring[n], ring[m], mouth[m], mouth[n]),
                (-math.cos(angs[n]) * 0.9, -math.sin(angs[n]) * 0.9, -0.45), tint=0.72)


# ---------------------------------------------------------------- parts

def slab(mb, x0, x1, ytop, z0, z1, th, skip=None, tint=1.0):
    y0, y1 = ytop - th, ytop

    def jt(x, z, s):
        return 0.26 * C.fbm(x * 0.7 + s, s * 3.0, z * 0.7)

    v = {}
    for (sx, X) in ((0, x0), (1, x1)):
        for (sz, Z) in ((0, z0), (1, z1)):
            v[(sx, 0, sz)] = mb.vert((X, y0 - 0.35 - abs(jt(X, Z, 1)), Z))
            v[(sx, 1, sz)] = mb.vert((X, y1 + jt(X, Z, 2), Z))
    q = [
        ('+y', [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)], (0, 1, 0), 1.0),
        ('-y', [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)], (0, -1, 0), 0.58),
        ('-z', [(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)], (0, 0, -1), 0.80),
        ('+z', [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)], (0, 0, 1), 0.80),
        ('-x', [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)], (-1, 0, 0), 0.80),
        ('+x', [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)], (1, 0, 0), 0.80),
    ]
    for key, idx, nrm, shade in q:
        if key == skip:
            continue
        mb.face([v[k] for k in idx], nrm, tint=tint * shade)


def bracket(mb, x, ytop, z, out_dir, reach, drop, half):
    ox, oz = out_dir
    px, pz = (-oz, ox)
    a = mb.vert((x - px * half, ytop, z - pz * half))
    b = mb.vert((x + px * half, ytop, z + pz * half))
    c = mb.vert((x - px * half, ytop - drop, z - pz * half))
    d = mb.vert((x + px * half, ytop - drop, z + pz * half))
    e = mb.vert((x + ox * reach - px * half * 0.5, ytop, z + oz * reach - pz * half * 0.5))
    f = mb.vert((x + ox * reach + px * half * 0.5, ytop, z + oz * reach + pz * half * 0.5))
    mb.face((a, c, e), (-px, 0, -pz), tint=0.66)
    mb.face((b, d, f), (px, 0, pz), tint=0.66)
    mb.face((c, d, f, e), (ox * 0.4, -1.0, oz * 0.4), tint=0.52)
    mb.face((a, b, f, e), (0, 1, 0), tint=0.85)


def build_ledges(mb):
    th = LEDGE_TH
    for t, y in enumerate(GAL_Y):
        sw = (1 if t % 2 == 0 else -1) * 0.16
        cxx, cz = W * sw, -D * sw
        # deep enough to bridge the wall swell and still cover the collider box
        dzb = max(LEDGE_DP * 1.06, wall_inset('x', y, SEED['-z']) + 2.6)
        dzf = max(LEDGE_DP * 1.06, wall_inset('x', y, SEED['+z']) + 2.6)
        dxl = max(LEDGE_DP * 1.06, wall_inset('z', y, SEED['-x']) + 2.6)
        dxr = max(LEDGE_DP * 1.06, wall_inset('z', y, SEED['+x']) + 2.6)
        rl = [RUN_LONG * (1.0 + 0.13 * math.sin(t * 1.3 + i * 2.9)) for i in range(2)]
        rs = [RUN_SHORT * (1.0 + 0.13 * math.sin(t * 2.1 + i * 1.1)) for i in range(2)]

        cl = lambda v, lim: max(-lim, min(lim, v))
        slab(mb, cl(cxx - rl[0] * 0.5, HX), cl(cxx + rl[0] * 0.5, HX), y,
             -HZ, -HZ + dzb, th, '-z')
        slab(mb, cl(cxx - rl[1] * 0.5, HX), cl(cxx + rl[1] * 0.5, HX), y,
             HZ - dzf, HZ, th, '+z')
        slab(mb, -HX, -HX + dxl, y, cl(cz - rs[0] * 0.5, HZ), cl(cz + rs[0] * 0.5, HZ),
             th, '-x')
        slab(mb, HX - dxr, HX, y, cl(cz - rs[1] * 0.5, HZ), cl(cz + rs[1] * 0.5, HZ),
             th, '+x')
        for si, s in enumerate((-0.30, 0.28)):
            sc = 0.8 + 0.5 * (0.5 + 0.5 * math.sin(t * 3.7 + si * 2.2))
            bracket(mb, cl(cxx + rl[0] * s, HX - 3), y - th, -HZ + dzb * 0.22, (0, 1),
                    dzb * 0.72, 3.2 * sc, 1.4 * sc)
            bracket(mb, cl(cxx - rl[1] * s, HX - 3), y - th, HZ - dzf * 0.22, (0, -1),
                    dzf * 0.72, 3.2 * sc, 1.4 * sc)
            bracket(mb, -HX + dxl * 0.22, y - th, cl(cz + rs[0] * s, HZ - 3), (1, 0),
                    dxl * 0.72, 3.2 * sc, 1.4 * sc)
            bracket(mb, HX - dxr * 0.22, y - th, cl(cz - rs[1] * s, HZ - 3), (-1, 0),
                    dxr * 0.72, 3.2 * sc, 1.4 * sc)

    for (x0, x1, z0, z1, y) in ALC_BOXES:
        slab(mb, x0, x1, y, z0, z1, ALC_TH)

    slab(mb, LANDING[0], LANDING[1], LANDING[4], LANDING[2], LANDING[3], 1.0, '+z')


def tube(mb, cx, cz, y0, y1, rows, sides, radius_fn, tint=1.0):
    rings = []
    for r in range(rows + 1):
        t = r / rows
        y = C.lerp(y0, y1, t)
        rad = radius_fn(t)
        ring = []
        for s in range(sides):
            a = 2 * math.pi * s / sides
            wob = 1.0 + 0.10 * math.sin(a * 3 + t * 5.0) + 0.07 * C.fbm(a * 3, t * 8, cx)
            ring.append(mb.vert((cx + math.cos(a) * rad * wob, y,
                                 cz + math.sin(a) * rad * wob)))
        rings.append(ring)
    for r in range(rows):
        for s in range(sides):
            n = (s + 1) % sides
            a = 2 * math.pi * (s + 0.5) / sides
            mb.face((rings[r][s], rings[r][n], rings[r + 1][n], rings[r + 1][s]),
                    (math.cos(a), 0, math.sin(a)), tint=tint)


def comb_shard(mb, origin, ua, va, nrm, seed):
    """A broken, irregular scrap of old dry comb - deliberately not a hex cell."""
    n = 5 + int(abs(math.sin(seed * 3.1)) * 3.0)          # 5..7 sided
    depth = 0.45 + 0.55 * abs(math.sin(seed * 1.7))
    inner, outer, mids = [], [], []
    angles = []
    a = seed
    for s in range(n):
        a += (2 * math.pi / n) * (0.55 + 0.9 * (0.5 + 0.5 * math.sin(seed * 2.3 + s * 2.1)))
        angles.append(a)
        rad = 1.1 + 1.5 * (0.5 + 0.5 * math.sin(seed * 1.3 + s * 1.7))
        du, dv = math.cos(a) * rad, math.sin(a) * rad * 0.8
        p = (origin[0] + ua[0] * du + va[0] * dv,
             origin[1] + ua[1] * du + va[1] * dv,
             origin[2] + ua[2] * du + va[2] * dv)
        d = depth * (0.5 + 0.7 * (0.5 + 0.5 * math.sin(seed + s * 3.3)))
        inner.append(mb.vert(p))
        outer.append(mb.vert((p[0] + nrm[0] * d, p[1] + nrm[1] * d, p[2] + nrm[2] * d)))
        mids.append(None)
    mb.face(outer, nrm, tint=(0.62, 0.57, 0.48))
    for s in range(n):
        m = (s + 1) % n
        am = angles[s] + 0.5 * ((angles[m] - angles[s]) % (2 * math.pi))
        side = (ua[0] * math.cos(am) + va[0] * math.sin(am),
                ua[1] * math.cos(am) + va[1] * math.sin(am),
                ua[2] * math.cos(am) + va[2] * math.sin(am))
        mb.face((inner[s], inner[m], outer[m], outer[s]), side, tint=(0.40, 0.36, 0.30))


def build_deco(mb):
    for (px, pz) in PILLARS:
        def prof(t, px=px):
            return (2.05 + 1.75 * math.exp(-t * 9.0) + 0.55 * math.exp(-(1 - t) * 7.0)
                    + 0.30 * math.sin(t * 7.0 + px))
        tube(mb, px, pz, floor_h(px, pz) - 0.6, ceil_h(px, pz) + 0.4, 7, 8, prof)

    # old dry comb: broken scraps, kept off the engine's buildable band (y 20..49)
    patches = [
        ((-HX + 5.0, 15.0, -18.0), (0, 0, 1), (0, 1, 0), (1, 0, 0)),
        ((-HX + 5.4, 55.0, 14.0), (0, 0, 1), (0, 1, 0), (1, 0, 0)),
        ((HX - 5.0, 53.5, 6.0), (0, 0, -1), (0, 1, 0), (-1, 0, 0)),
        ((HX - 5.4, 13.0, -20.0), (0, 0, -1), (0, 1, 0), (-1, 0, 0)),
        ((-28.0, 56.0, -HZ + 5.0), (1, 0, 0), (0, 1, 0), (0, 0, 1)),
        ((18.0, 14.0, -HZ + 5.2), (1, 0, 0), (0, 1, 0), (0, 0, 1)),
    ]
    for i, (org, ua, va, nr) in enumerate(patches):
        for j in range(3):
            ou = (j - 1) * 3.4 + 1.2 * math.sin(i * 2.1 + j)
            ov = 2.6 * math.sin(i * 1.7 + j * 2.3)
            o = (org[0] + ua[0] * ou + va[0] * ov,
                 org[1] + ua[1] * ou + va[1] * ov,
                 org[2] + ua[2] * ou + va[2] * ov)
            comb_shard(mb, o, ua, va, nr, seed=1.3 + i * 1.9 + j * 0.7)

    outcrops = [(-38, 18.0, -HZ, 7.0, '-z'), (26, 31.0, -HZ, 6.0, '-z'),
                (-14, 47.0, -HZ, 5.0, '-z'), (36, 21.0, HZ, 6.5, '+z'),
                (-30, 37.0, HZ, 5.5, '+z')]
    for (ox, oy, oz, ln, side) in outcrops:
        dpp = wall_inset('x', oy, SEED[side]) + 2.4
        z0 = oz if side == '-z' else oz - dpp
        slab(mb, ox - ln * 0.5, ox + ln * 0.5, oy, z0, z0 + dpp, 0.9, side, tint=0.92)
    for (sx, sy, sz, ln) in ((-HX, 24.0, 26.0, 4.6), (HX, 42.0, -22.0, 4.4)):
        side = '-x' if sx < 0 else '+x'
        dpp = wall_inset('z', sy, SEED[side]) + 2.4
        x0 = sx if sx < 0 else sx - dpp
        slab(mb, x0, x0 + dpp, sy, sz - ln * 0.5, sz + ln * 0.5, 0.9, side, tint=0.92)

    knots = [(-6, 26, 2.6), (30, -22, 3.0), (-36, -6, 2.4), (14, 30, 2.2),
             (40, 4, 2.8), (-16, -8, 2.0), (4, 8, 2.3)]
    for (kx, kz, kr) in knots:
        base = floor_h(kx, kz)
        tube(mb, kx, kz, base - 0.8, base + kr * 1.25, 2, 6,
             lambda t, kr=kr: kr * (1.05 - 0.75 * t * t), tint=0.85)
    for (bx, bz, lx, lz) in ((-26, 8, 22.0, 2.6), (16, -16, 2.8, 18.0)):
        base = floor_h(bx, bz)
        slab(mb, bx - lx * 0.5, bx + lx * 0.5, base + 2.4, bz - lz * 0.5, bz + lz * 0.5,
             2.6, tint=0.8)

    beams = [(-34, 52.0, -6, 22, 1.5), (10, 56.5, 14, 26, 1.7),
             (-6, 49.0, 20, 18, 1.3), (28, 54.0, -20, 20, 1.5),
             (-20, 58.5, 6, 16, 1.2)]
    for (bx, by, bz, ln, r) in beams:
        slab(mb, bx - ln * 0.5, bx + ln * 0.5, by + r, bz - r, bz + r, r * 2.0, tint=0.8)


def build_pools(mb):
    for (px, pz, pr) in POOLS:
        n = 14
        base = floor_h(px, pz)
        cy = base + 0.55
        c = mb.vert((px, cy, pz))
        rim, low = [], []
        for s in range(n):
            a = 2 * math.pi * s / n
            r = pr * (0.85 + 0.25 * math.sin(a * 3 + px))
            x, z = px + math.cos(a) * r, pz + math.sin(a) * r
            rim.append(mb.vert((x, cy, z)))
            low.append(mb.vert((x, cy - 0.9 - 0.3 * math.sin(a * 2), z)))
        for s in range(n):
            m = (s + 1) % n
            mb.face((c, rim[s], rim[m]), (0, 1, 0))
            a = 2 * math.pi * (s + 0.5) / n
            mb.face((rim[s], low[s], low[m], rim[m]), (math.cos(a), 0.2, math.sin(a)),
                    tint=0.75)


# ---------------------------------------------------------------- main

def main():
    bpy.ops.wm.read_homefile(use_empty=True)
    wood = C.vcol_material('hollow_wood', emissive=0.0, rough=0.95)
    resin = C.vcol_material('hollow_resin', emissive=0.45, rough=0.25)

    objs = []
    for name, fn, mat, cfn in (
        ('hollow_shell', build_shell, wood, hall_color),
        ('hollow_ledges', build_ledges, wood, lambda p: hall_color(p, shadow=False)),
        ('hollow_deco', build_deco, wood, hall_color),
        ('hollow_pools', build_pools, resin, pool_color),
    ):
        mb = C.MeshBuild(xform=C.g2b)
        fn(mb)
        ob = C.make_object(name, mb, cfn, mat)
        objs.append(ob)
        print(name, 'tris', mb.tris(), 'verts', len(mb.v))

    cur, k = C.normalize_scene(objs, (W, D, H))
    print('bbox before normalise (blender xyz):', [round(v, 3) for v in cur],
          'scale', [round(v, 5) for v in k])

    out = os.path.normpath(os.path.join(HERE, '..', 'assets', 'models', 'hollow.glb'))
    C.export_glb(out, objs)
    total = 0
    for o in objs:
        o.data.calc_loop_triangles()
        total += len(o.data.loop_triangles)
    print('TOTAL TRIS', total)
    print('exported', out, os.path.getsize(out))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'ht_hollow.blend'))


main()
