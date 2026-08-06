"""Acceptance tests for the three flower GLBs, run on the EXPORTED files.

  * contract: tris, budget, height, base at 0, node names, one material,
    no cameras/lights/textures, COLOR_0 present as float VEC3, +Y up
  * harebell: cross-group triangle-intersection test, stem/leaf (green) vs
    petal (blue), counting intersecting pairs above y = 4.5
  * colour census in COLOR_0 space with HSV, so saturation/luminance claims
    can be checked directly
"""
import bpy, json, struct, math, sys, itertools

ROOT = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/'
MODELS = ROOT + 'assets/models/'
SPEC = {'flower-daisy.glb': ('daisy', 170, 4.6),
        'flower-clover.glb': ('clover', 150, 3.9),
        'flower-harebell.glb': ('harebell', 150, 6.3)}


def l2s(v):
    v = max(0.0, min(1.0, v))
    return v * 12.92 if v <= 0.0031308 else 1.055 * (v ** (1 / 2.4)) - 0.055


def hexs(c):
    return '#%02x%02x%02x' % tuple(int(round(l2s(x) * 255)) for x in c[:3])


def rgb2hsv(c):
    r, g, b = (l2s(x) for x in c[:3])
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    if d < 1e-9:
        h = 0.0
    elif mx == r:
        h = (60 * ((g - b) / d)) % 360
    elif mx == g:
        h = 60 * ((b - r) / d) + 120
    else:
        h = 60 * ((r - g) / d) + 240
    return h, (0.0 if mx <= 0 else d / mx), mx


def lum(c):
    r, g, b = (l2s(x) for x in c[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


# ---------------------------------------------------------- glTF json probe
def gltf_json(path):
    d = open(path, 'rb').read()
    n = struct.unpack('<I', d[12:16])[0]
    return json.loads(d[20:20 + n])


# ------------------------------------------------ triangle/triangle overlap
def tri_intersect(p, q, eps=1e-7):
    """Moller 1997 interval-overlap test, no coplanar handling (returns False
    for coplanar pairs, which is what we want: touching seams are not stripes)."""
    def sub(a, b):
        return (a[0] - b[0], a[1] - b[1], a[2] - b[2])

    def cross(a, b):
        return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])

    def dot(a, b):
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

    n2 = cross(sub(q[1], q[0]), sub(q[2], q[0]))
    d2 = -dot(n2, q[0])
    dp = [dot(n2, v) + d2 for v in p]
    if all(x > eps for x in dp) or all(x < -eps for x in dp):
        return False
    n1 = cross(sub(p[1], p[0]), sub(p[2], p[0]))
    d1 = -dot(n1, p[0])
    dq = [dot(n1, v) + d1 for v in q]
    if all(x > eps for x in dq) or all(x < -eps for x in dq):
        return False
    D = cross(n1, n2)
    if dot(D, D) < 1e-18:
        return False           # coplanar
    ax = max(range(3), key=lambda i: abs(D[i]))

    def interval(tri, dist):
        pv = [tri[i][ax] for i in range(3)]
        # the vertex alone on one side of the other plane
        signs = [1 if dist[i] > eps else (-1 if dist[i] < -eps else 0) for i in range(3)]
        for i in range(3):
            j, k = (i + 1) % 3, (i + 2) % 3
            if signs[j] == signs[k] and signs[i] != signs[j]:
                lone, o1, o2 = i, j, k
                break
        else:
            lone, o1, o2 = 0, 1, 2
        out = []
        for o in (o1, o2):
            den = dist[lone] - dist[o]
            if abs(den) < 1e-12:
                out.append(pv[o])
            else:
                out.append(pv[lone] + (pv[o] - pv[lone]) * (dist[lone] / den))
        return (min(out), max(out))

    a0, a1 = interval(p, dp)
    b0, b1 = interval(q, dq)
    return not (a1 < b0 + eps or b1 < a0 + eps)


def load(path):
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for blk in (bpy.data.meshes, bpy.data.materials):
        for d in list(blk):
            blk.remove(d)
    bpy.ops.import_scene.gltf(filepath=path)


def check(fname):
    name, budget, height = SPEC[fname]
    path = MODELS + fname
    j = gltf_json(path)
    print('=' * 72)
    print('ASSET', fname)
    prims = j['meshes'][0]['primitives']
    acc = {k: j['accessors'][v] for k, v in prims[0]['attributes'].items()}
    print('  nodes          :', [n.get('name') for n in j['nodes']])
    print('  materials      :', [m['name'] for m in j['materials']],
          'doubleSided=', j['materials'][0].get('doubleSided'))
    print('  images/textures:', len(j.get('images', [])), '/', len(j.get('textures', [])))
    print('  cameras/lights :', len(j.get('cameras', [])), '/',
          len(j.get('extensions', {}).get('KHR_lights_punctual', {}).get('lights', [])))
    ct = acc.get('COLOR_0')
    print('  COLOR_0        :', 'MISSING' if not ct else
          '%s %s componentType=%d' % (ct['type'], 'normalized' if ct.get('normalized') else 'float',
                                      ct['componentType']))

    load(path)
    ob = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    me = ob.data
    me.calc_loop_triangles()
    tris = len(me.loop_triangles)
    co = [ob.matrix_world @ v.co for v in me.vertices]
    # glTF is +Y up; Blender's importer brings it back to Z up, so engine-Y == blender-Z
    ymin, ymax = min(c.z for c in co), max(c.z for c in co)
    emp = [o for o in bpy.data.objects if o.type == 'EMPTY']
    print('  tris           : %d  (budget %d)  %s' % (tris, budget, 'OK' if tris <= budget else 'OVER'))
    print('  height         : %.4f (target %.4f)  base y=%.4f' % (ymax - ymin, height, ymin))
    print('  head anchor    :', [(e.name, tuple(round(x, 3) for x in
                                                (e.matrix_world.translation.x,
                                                 e.matrix_world.translation.z,
                                                 -e.matrix_world.translation.y)))
                                 for e in emp], '(engine x,y,z)')
    # glTF carries flat shading as per-corner normals equal to the face normal,
    # which Blender re-imports as "smooth + custom split normals" -- so test the
    # normals themselves, not the smooth flag.
    flat = True
    for p in me.polygons:
        for li in p.loop_indices:
            if (me.loops[li].normal - p.normal).length > 1e-3:
                flat = False
                break
    print('  flat shaded    :', flat, '(per-corner normals == face normal)')
    print('  materials on ob:', [m.name for m in me.materials])
    return ob, me


def colour_census(me, label, top=20):
    att = me.color_attributes[0]
    from collections import Counter
    c = Counter(hexs(d.color) for d in att.data)
    print('  COLOR_0 census (%s):' % label)
    for k, v in c.most_common(top):
        rgb = tuple(int(k[1 + 2 * i:3 + 2 * i], 16) / 255.0 for i in range(3))
        lin = tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in rgb)
        h, s, val = rgb2hsv(lin)
        print('     %s x%-4d  H=%5.1f  S=%.3f  V=%.3f  lum=%.3f'
              % (k, v, h, s, val, lum(lin)))


def harebell_intersection(me, cut=4.5):
    """Green (stem/leaf) triangles vs blue (petal) triangles above engine y=cut."""
    att = me.color_attributes[0]
    me.calc_loop_triangles()
    green, blue, other = [], [], 0
    for t in me.loop_triangles:
        hs = [rgb2hsv(att.data[li].color) for li in t.loops]
        h = sum(x[0] for x in hs) / 3.0
        pts = [tuple(me.vertices[i].co) for i in t.vertices]
        if 60 <= h <= 170:
            green.append(pts)
        elif 190 <= h <= 280:
            blue.append(pts)
        else:
            other += 1
    print('  classified: %d green(stem/leaf)  %d blue(petal)  %d other' % (len(green), len(blue), other))
    tested = hit = 0
    worst = []
    for a in green:
        if max(p[2] for p in a) < cut:
            continue
        for b in blue:
            if max(p[2] for p in b) < cut:
                continue
            tested += 1
            if tri_intersect(a, b):
                hit += 1
                worst.append((min(p[2] for p in a + b), max(p[2] for p in a + b)))
    print('  INTERSECTION TEST above y=%.1f : %d intersecting stem-vs-petal pairs '
          '(%d pairs tested)' % (cut, hit, tested))
    if worst:
        print('   offending z spans:', worst[:10])
    # and the full-model number, for context
    tested2 = hit2 = 0
    for a in green:
        for b in blue:
            tested2 += 1
            if tri_intersect(a, b):
                hit2 += 1
    print('  INTERSECTION TEST whole model : %d intersecting pairs (%d tested)' % (hit2, tested2))
    return hit


if __name__ == '__main__':
    for f in ('flower-daisy.glb', 'flower-clover.glb', 'flower-harebell.glb'):
        ob, me = check(f)
        colour_census(me, f)
        if f == 'flower-harebell.glb':
            harebell_intersection(me)
    print('=' * 72)
