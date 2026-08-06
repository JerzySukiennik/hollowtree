"""Acceptance checks for hollow-tree.glb, run inside Blender on the live scene."""
import bpy, math
from mathutils import Vector

R = 3.2


def crossings(tr, px, pz, y0=-40.0, limit=32):
    """all surface crossings along Blender +Y  ==  glTF -Z from z=+40"""
    y = y0
    hits = []
    for _ in range(limit):
        ok, loc, nor, idx = tr.ray_cast(Vector((px, y, pz)), Vector((0, 1, 0)))
        if not ok:
            break
        hits.append(loc.y)
        y = loc.y + 1e-3
        if y > 40.0:
            break
    return hits


def shaft_test(verbose=True, n=21):
    tr = bpy.data.objects['trunk']
    ent = bpy.data.objects['entrance']
    ex, ey, ez = ent.location
    rows = []
    h2 = (n - 1) / 2.0
    for i in range(n):
        for k in range(n):
            u, w = (i - h2) / h2, (k - h2) / h2
            if u * u + w * w > 1.0:
                continue
            px, pz = ex + u * R, ez + w * R
            h = crossings(tr, px, pz)
            gz = [-y for y in h]                      # glTF z of each crossing
            rows.append((u, w, len(h), gz[0] if gz else None))
    total = len(rows)
    n4 = sum(1 for r in rows if r[2] >= 4)
    deep = sum(1 for r in rows if r[3] is not None and r[3] < -4.0)
    ok = sum(1 for r in rows if r[2] >= 4 or (r[3] is not None and r[3] < -4.0))
    fails = [r for r in rows if not (r[2] >= 4 or (r[3] is not None and r[3] < -4.0))]
    if verbose:
        print('SHAFT TEST  rays=%d  >=4 crossings=%d  first-hit glTF z<-4=%d  PASSING=%d/%d'
              % (total, n4, deep, ok, total))
        cc = [r[2] for r in rows]
        fz = [r[3] for r in rows if r[3] is not None]
        print('  crossings min/max = %d/%d   first-hit glTF z min/max = %.2f/%.2f'
              % (min(cc), max(cc), min(fz), max(fz)))
        if fails:
            print('  FAILING:', [(round(f[0], 2), round(f[1], 2), f[2],
                                  round(f[3], 2) if f[3] is not None else None) for f in fails])
    return ok, total, fails


def mesh_audit():
    import bmesh
    for name in ('trunk', 'canopy_foliage'):
        ob = bpy.data.objects[name]
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        boundary = sum(1 for e in bm.edges if len(e.link_faces) == 1)
        nonman = sum(1 for e in bm.edges if len(e.link_faces) > 2)
        bad = 0
        for f in bm.faces:
            if f.calc_area() < 1e-6:
                bad += 1
        print('%-16s verts %5d faces %5d  boundary edges %d  non-manifold %d  degenerate %d'
              % (name, len(bm.verts), len(bm.faces), boundary, nonman, bad))
        bm.free()


def clearance():
    """widest body that can fly the shaft: sample the open cross-section"""
    tr = bpy.data.objects['trunk']
    ent = bpy.data.objects['entrance']
    ex, ey, ez = ent.location
    best = 0.0
    for rad in [x * 0.1 for x in range(1, 40)]:
        clear = True
        for i in range(16):
            a = 2 * math.pi * i / 16
            px, pz = ex + math.cos(a) * rad, ez + math.sin(a) * rad
            h = crossings(tr, px, pz)
            gz = [-y for y in h]
            if not (len(h) >= 4 or (gz and gz[0] < -4.0)):
                clear = False
                break
        if clear:
            best = rad
        else:
            break
    print('clear flight radius through the shaft: %.1f units' % best)
    return best
