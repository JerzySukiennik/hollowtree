"""Builds assets/models/meadow-tree.glb - the background forest tree.

Normalised by the engine to height 1 and instanced 46x at 44-90 world units.
Deliberately a plainer, narrower species than the hero hollow tree: a slim
straight trunk, bare to mid-height, carrying a tall irregular crown.
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

BARK = C.hexc(0x5d452f)
BARK_D = C.hexc(0x392a1c)
LEAF = C.hexc(0x4a7030)
LEAF_D = C.hexc(0x33501f)
LEAF_DD = C.hexc(0x22380f)

TRUNK_TOP = 0.66          # where the crown takes over
CANOPY_TOP = 1.0


def jit(a, b, s):
    return C.fbm(math.cos(a) * 7.0 + s, b * 9.0, math.sin(a) * 7.0 + s)


# ---------------------------------------------------------------- colour

def tree_color(pb):
    x, y, z = C.b2g(pb)
    r = math.hypot(x, z)
    if y < TRUNK_TOP - 0.02 and r < 0.075:
        t = C.clamp(y / TRUNK_TOP)
        c = C.mix(BARK_D, BARK, C.smooth(0.0, 0.75, t))
        return C.scale(c, 0.88 + 0.22 * (0.5 + 0.5 * C.fbm(x * 40, y * 26, z * 40)))
    # canopy: dark low and inside, lighter at the sunlit top and rim
    up = C.clamp((y - TRUNK_TOP * 0.55) / (CANOPY_TOP - TRUNK_TOP * 0.55))
    rim = C.clamp(r / 0.17)
    k = C.clamp(0.22 * rim + 0.78 * up ** 1.9)
    c = C.mix(LEAF_DD, LEAF_D, C.smooth(0.0, 0.42, k))
    c = C.mix(c, LEAF, C.smooth(0.34, 1.0, k))
    c = C.scale(c, 0.74 + 0.42 * (0.5 + 0.5 * C.fbm(x * 26, y * 18, z * 26)))
    return c


# ---------------------------------------------------------------- parts

def trunk(mb):
    sides, rows = 7, 5
    rings = []
    for r in range(rows + 1):
        t = r / rows
        y = C.lerp(0.0, TRUNK_TOP + 0.05, t)
        rad = 0.047 * (1.0 - t) ** 1.55 + 0.011
        lean = 0.010 * t * t
        ring = []
        for s in range(sides):
            a = 2 * math.pi * s / sides
            w = 1.0 + 0.16 * jit(a, t, 3.0)
            ring.append(mb.vert((math.cos(a) * rad * w + lean, y,
                                 math.sin(a) * rad * w - lean * 0.6)))
        rings.append(ring)
    for r in range(rows):
        for s in range(sides):
            n = (s + 1) % sides
            a = 2 * math.pi * (s + 0.5) / sides
            mb.face((rings[r][s], rings[r][n], rings[r + 1][n], rings[r + 1][s]),
                    (math.cos(a), 0.12, math.sin(a)))
    mb.face(list(reversed(rings[0])), (0, -1, 0))
    return rings


def crown(mb, cx, cy, cz, height, width, sides, rows, seed, squash=1.0):
    """One faceted foliage mass; returns nothing."""
    rings = []
    for r in range(rows + 1):
        t = r / rows
        y = cy + height * t
        # fat low, tapering to a point: poplar-ish spire
        prof = math.sin(math.pi * (0.12 + 0.88 * t)) ** 0.85 * (1.0 - t) ** 0.35
        rad = width * prof
        ring = []
        for s in range(sides):
            a = 2 * math.pi * s / sides + t * 0.35
            w = 1.0 + 0.30 * jit(a, t + seed, seed)
            ring.append(mb.vert((cx + math.cos(a) * rad * w,
                                 y + width * 0.20 * jit(a, t, seed + 4.0),
                                 cz + math.sin(a) * rad * w * squash)))
        rings.append(ring)
    tip = mb.vert((cx + width * 0.10, cy + height * 1.06, cz - width * 0.06))
    for r in range(rows):
        for s in range(sides):
            n = (s + 1) % sides
            a = 2 * math.pi * (s + 0.5) / sides
            mb.face((rings[r][s], rings[r][n], rings[r + 1][n], rings[r + 1][s]),
                    (math.cos(a), 0.25, math.sin(a)))
    for s in range(sides):
        n = (s + 1) % sides
        a = 2 * math.pi * (s + 0.5) / sides
        mb.face((rings[rows][s], rings[rows][n], tip),
                (math.cos(a) * 0.5, 1.0, math.sin(a) * 0.5))


def bough(mb, y, ang, length, rise, thick):
    """Short bare limb poking out of the crown, breaks the cone silhouette."""
    dx, dz = math.cos(ang), math.sin(ang)
    px, pz = -dz, dx
    a = mb.vert((dx * 0.012 - px * thick, y - thick, dz * 0.012 - pz * thick))
    b = mb.vert((dx * 0.012 + px * thick, y - thick, dz * 0.012 + pz * thick))
    c = mb.vert((dx * 0.012, y + thick, dz * 0.012))
    e = mb.vert((dx * length, y + rise, dz * length))
    mb.face((a, b, c), (-dx, 0, -dz))
    mb.face((a, c, e), (-px, 0.2, -pz))
    mb.face((b, e, c), (px, 0.2, pz))
    mb.face((a, e, b), (0, -1, 0))


def build(mb):
    trunk(mb)
    crown(mb, 0.004, 0.42, -0.002, 0.55, 0.148, 9, 7, 1.0)
    crown(mb, -0.080, 0.52, 0.045, 0.31, 0.080, 7, 4, 2.6, squash=0.9)
    crown(mb, 0.074, 0.58, -0.055, 0.27, 0.068, 7, 4, 5.1, squash=1.1)
    crown(mb, 0.026, 0.38, 0.072, 0.22, 0.060, 6, 3, 7.7)
    for (y, a, ln, rise, th) in ((0.56, 0.7, 0.140, 0.034, 0.008),
                                 (0.64, 3.4, 0.125, 0.028, 0.007),
                                 (0.48, 5.1, 0.118, 0.024, 0.007)):
        bough(mb, y, a, ln, rise, th)


def main():
    bpy.ops.wm.read_homefile(use_empty=True)
    mat = C.vcol_material('meadow_tree', rough=0.95)
    mb = C.MeshBuild(xform=C.g2b)
    build(mb)
    ob = C.make_object('meadow_tree', mb, tree_color, mat)
    print('meadow_tree tris', mb.tris(), 'verts', len(mb.v))

    # seat: base centred on the origin, height untouched
    import mathutils
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for v in ob.data.vertices:
        for i in range(3):
            mn[i] = min(mn[i], v.co[i])
            mx[i] = max(mx[i], v.co[i])
    for v in ob.data.vertices:
        v.co.x -= (mn[0] + mx[0]) * 0.5
        v.co.y -= (mn[1] + mx[1]) * 0.5
        v.co.z -= mn[2]
    ob.data.update()
    print('size (blender xyz):', [round(mx[i] - mn[i], 4) for i in range(3)])

    out = os.path.normpath(os.path.join(HERE, '..', 'assets', 'models', 'meadow-tree.glb'))
    C.export_glb(out, [ob])
    ob.data.calc_loop_triangles()
    print('TOTAL TRIS', len(ob.data.loop_triangles))
    print('exported', out, os.path.getsize(out))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'ht_tree.blend'))


main()
