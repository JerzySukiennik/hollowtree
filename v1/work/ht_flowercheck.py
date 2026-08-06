"""Acceptance checks for the flower GLBs, run outside Blender on the shipped files.

  * cross-group triangle intersection (stem/leaf geometry vs petal geometry)
  * colour inventory in sRGB hex with saturation, so near-white tips are visible
  * height, node names, attribute types, triangle counts
"""
import json, struct, sys, math, itertools


# ------------------------------------------------------------------ glb reader
def load(path):
    d = open(path, 'rb').read()
    off, js, bins = 12, None, None
    while off < len(d):
        ln, ty = struct.unpack_from('<II', d, off)
        c = d[off + 8: off + 8 + ln]
        if ty == 0x4E4F534A:
            js = json.loads(c)
        else:
            bins = c
        off += 8 + ln
    return js, bins


CT = {5126: 'f', 5123: 'H', 5125: 'I', 5121: 'B', 5122: 'h', 5120: 'b'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def acc(g, b, i):
    a = g['accessors'][i]
    bv = g['bufferViews'][a['bufferView']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    ct, n = CT[a['componentType']], NC[a['type']]
    sz = struct.calcsize(ct) * n
    stride = bv.get('byteStride') or sz
    return [struct.unpack_from('<' + ct * n, b, off + k * stride) for k in range(a['count'])], a


# ------------------------------------------------------------------ colour math
def s(l):
    l = max(0.0, min(1.0, l))
    return 12.92 * l if l <= 0.0031308 else 1.055 * l ** (1 / 2.4) - 0.055


def to_hex(c):
    return tuple(round(s(x) * 255) for x in c[:3])


def sat(rgb):
    mx, mn = max(rgb), min(rgb)
    return 0.0 if mx == 0 else (mx - mn) / mx


def is_green(rgb):
    r, g, bl = rgb
    return g > r + 6 and g > bl + 6


# ------------------------------------------------- triangle/triangle intersection
def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def tri_intersect(T1, T2, eps=1e-7):
    """Moller's separating-axis test for two triangles in 3-space"""
    for A, B in ((T1, T2), (T2, T1)):
        n = cross(sub(A[1], A[0]), sub(A[2], A[0]))
        if dot(n, n) < eps:
            return False
        d = [dot(n, sub(p, A[0])) for p in B]
        if all(x > eps for x in d) or all(x < -eps for x in d):
            return False
    # edge-edge cross-product axes
    e1 = [sub(T1[(i + 1) % 3], T1[i]) for i in range(3)]
    e2 = [sub(T2[(i + 1) % 3], T2[i]) for i in range(3)]
    axes = [cross(a, b) for a in e1 for b in e2]
    axes += [cross(sub(T1[1], T1[0]), sub(T1[2], T1[0])),
             cross(sub(T2[1], T2[0]), sub(T2[2], T2[0]))]
    for ax in axes:
        if dot(ax, ax) < eps:
            continue
        p1 = [dot(ax, p) for p in T1]
        p2 = [dot(ax, p) for p in T2]
        if min(p1) > max(p2) + eps or min(p2) > max(p1) + eps:
            return False
    return True


def bbox_hit(a, b):
    for k in range(3):
        if max(p[k] for p in a) < min(p[k] for p in b) or \
           max(p[k] for p in b) < min(p[k] for p in a):
            return False
    return True


# ---------------------------------------------------------------------- report
def check(path, y_gate):
    g, b = load(path)
    print('=' * 70)
    print(path.split('/')[-1])
    print('  nodes:', [n.get('name') for n in g['nodes']])
    for n in g['nodes']:
        if 'mesh' not in n:
            print('  anchor %-8s translation %s' % (n.get('name'), n.get('translation')))
    pr = g['meshes'][0]['primitives'][0]
    pos, pa = acc(g, b, pr['attributes']['POSITION'])
    col, colacc = acc(g, b, pr['attributes']['COLOR_0'])
    idx, _ = acc(g, b, pr['indices'])
    idx = [i[0] for i in idx]
    ntri = len(idx) // 3
    mat = g['materials'][0]
    mc = mat['pbrMetallicRoughness'].get('baseColorFactor', [1, 1, 1, 1])
    print('  tris %d   COLOR_0 %s/%s   attrs %s   materials %d'
          % (ntri, colacc['type'], colacc['componentType'],
             sorted(pr['attributes']), len(g['materials'])))
    ys = [p[1] for p in pos]
    print('  height %.4f  (y %.4f .. %.4f)   doubleSided=%s'
          % (max(ys) - min(ys), min(ys), max(ys), mat.get('doubleSided')))

    # ---- colour inventory
    hexes = {}
    for c, p in zip(col, pos):
        h = to_hex([c[i] * mc[i] for i in range(3)])
        e = hexes.setdefault(h, [0, 1e9, -1e9])
        e[0] += 1
        e[1] = min(e[1], p[1])
        e[2] = max(e[2], p[1])
    print('  colours:')
    for h, v in sorted(hexes.items(), key=lambda x: -x[1][0]):
        flag = ''
        if not is_green(h) and min(h) > 200:
            flag = '  <-- near-white'
        print('    #%02x%02x%02x sat=%.3f n=%3d  y %.2f..%.2f%s'
              % (h[0], h[1], h[2], sat(h), v[0], v[1], v[2], flag))

    # ---- cross-group triangle intersection above the gate
    green, petal = [], []
    for t in range(ntri):
        vi = idx[3 * t: 3 * t + 3]
        tri = [pos[i][:3] for i in vi]
        if max(p[1] for p in tri) < y_gate:
            continue
        hs = [to_hex([col[i][k] * mc[k] for k in range(3)]) for i in vi]
        (green if sum(is_green(h) for h in hs) >= 2 else petal).append(tri)
    def shares_vertex(a, c, tol=1e-4):
        for p in a:
            for q in c:
                if abs(p[0] - q[0]) < tol and abs(p[1] - q[1]) < tol and abs(p[2] - q[2]) < tol:
                    return True
        return False

    hits = adjacent = pairs = 0
    for a in green:
        for c in petal:
            if not bbox_hit(a, c):
                continue
            pairs += 1
            if not tri_intersect(a, c):
                continue
            # two triangles that share a vertex are neighbours across a colour
            # boundary, not one piece of geometry piercing another
            if shares_vertex(a, c):
                adjacent += 1
            else:
                hits += 1
    print('  above y=%.1f: %d stem/leaf tris vs %d petal tris, %d bbox-overlapping pairs'
          % (y_gate, len(green), len(petal), pairs))
    print('    -> %d INTERSECTING PAIRS (piercing)   [%d further pairs merely share a '
          'vertex: adjacent geometry across a colour boundary]' % (hits, adjacent))
    return hits


if __name__ == '__main__':
    base = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/assets/models/'
    gates = {'harebell': 4.5, 'clover': 2.6, 'daisy': 2.4}
    for name, gate in gates.items():
        check(base + 'flower-%s.glb' % name, gate)
