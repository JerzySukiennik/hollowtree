"""Acceptance tests for hollow.glb (run with plain python3)."""
import json
import math
import struct
import sys

W, H, D = 96.0, 63.64, 64.0


def load(path):
    data = open(path, 'rb').read()
    off, js, bins = 12, None, None
    while off < len(data):
        ln, ty = struct.unpack_from('<II', data, off)
        chunk = data[off + 8: off + 8 + ln]
        if ty == 0x4E4F534A:
            js = json.loads(chunk)
        else:
            bins = chunk
        off += 8 + ln
    return js, bins


FMT = {5126: ('f', 4), 5125: ('I', 4), 5123: ('H', 2), 5121: ('B', 1)}


def read_acc(g, b, i):
    acc = g['accessors'][i]
    bv = g['bufferViews'][acc['bufferView']]
    base = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    ncomp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[acc['type']]
    ch, sz = FMT[acc['componentType']]
    stride = bv.get('byteStride') or ncomp * sz
    out = []
    for k in range(acc['count']):
        o = base + k * stride
        out.append(struct.unpack_from('<' + ch * ncomp, b, o))
    return out


def prim_data(g, b, mesh_name):
    for m in g['meshes']:
        if m['name'] != mesh_name:
            continue
        pr = m['primitives'][0]
        pos = read_acc(g, b, pr['attributes']['POSITION'])
        col = read_acc(g, b, pr['attributes']['COLOR_0'])
        idx = [v[0] for v in read_acc(g, b, pr['indices'])]
        return pos, col, idx
    return None, None, None


def lum(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def components(pos, idx):
    key = {}
    weld = []
    for p in pos:
        k = (round(p[0], 3), round(p[1], 3), round(p[2], 3))
        if k not in key:
            key[k] = len(key)
        weld.append(key[k])
    idx = [weld[i] for i in idx]
    pos = [None] * len(key)
    for i, p in enumerate(pos):
        pass
    posw = [None] * len(key)
    for k, v in key.items():
        posw[v] = k
    pos = posw
    parent = list(range(len(pos)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for t in range(0, len(idx), 3):
        union(idx[t], idx[t + 1])
        union(idx[t + 1], idx[t + 2])
    groups = {}
    for t in range(0, len(idx), 3):
        groups.setdefault(find(idx[t]), []).append(t // 3)
    verts = {}
    for i in range(len(pos)):
        verts.setdefault(find(i), []).append(i)
    return groups, verts


def main(path):
    g, b = load(path)
    print('=' * 62)
    print('AUDIT', path)

    # ---- 1. no regular hexagon cells anywhere in deco, no tiny components
    for name in ('hollow_deco', 'hollow_shell', 'hollow_ledges', 'hollow_pools'):
        pos, col, idx = prim_data(g, b, name)
        groups, verts = components(pos, idx)
        small = [k for k, v in groups.items() if len(v) < 4]
        hexes = 0
        for k, vs in verts.items():
            if len(vs) != 12:
                continue
            cx = sum(pos[i][0] for i in vs) / 12
            cy = sum(pos[i][1] for i in vs) / 12
            cz = sum(pos[i][2] for i in vs) / 12
            radii = [math.dist(pos[i], (cx, cy, cz)) for i in vs]
            if max(radii) - min(radii) < 0.01 * max(radii):
                hexes += 1
        print(f'  {name}: components {len(groups)}, <4-tri components {len(small)}, '
              f'regular-hex components {hexes}')

    # ---- 2. wall relief + taper
    pos, col, idx = prim_data(g, b, 'hollow_shell')
    dev = []
    for p in pos:
        x, y, z = p
        if y < 4 or y > H - 5:
            continue
        d = min(x + W / 2, W / 2 - x, z + D / 2, D / 2 - z)
        if d < 26:
            dev.append(d)
    mean = sum(dev) / len(dev)
    std = math.sqrt(sum((v - mean) ** 2 for v in dev) / len(dev))
    print(f'  wall inner-surface inset: n={len(dev)} mean={mean:.2f} std={std:.2f} '
          f'(target std >= 5)')

    def cross_area(y0):
        band = [p for p in pos if abs(p[1] - y0) < 2.6]
        xs = [p for p in band if abs(p[2]) < D / 2 - 3]
        zs = [p for p in band if abs(p[0]) < W / 2 - 3]
        if not xs or not zs:
            return None
        xmin = sum(p[0] for p in xs if p[0] < -W / 4) / max(1, len([p for p in xs if p[0] < -W / 4]))
        xmax = sum(p[0] for p in xs if p[0] > W / 4) / max(1, len([p for p in xs if p[0] > W / 4]))
        zmin = sum(p[2] for p in zs if p[2] < -D / 4) / max(1, len([p for p in zs if p[2] < -D / 4]))
        zmax = sum(p[2] for p in zs if p[2] > D / 4) / max(1, len([p for p in zs if p[2] > D / 4]))
        return (xmax - xmin) * (zmax - zmin)

    a10, a55 = cross_area(10.0), cross_area(55.0)
    print(f'  cross-section area y=10 {a10:.0f}, y=55 {a55:.0f}, '
          f'change {100 * (a55 - a10) / a10:+.1f}% (target |change| >= 15%)')

    # ---- 3. entrance aperture: ray scan straight through the +Z wall
    tris = []
    for t in range(0, len(idx), 3):
        a3 = [pos[idx[t + i]] for i in range(3)]
        if min(p[2] for p in a3) > 5 and max(p[0] for p in a3) > -14 and min(p[0] for p in a3) < 14:
            tris.append(a3)

    def hits(x, y):
        n = 0
        for (p0, p1, p2) in tris:
            e1 = [p1[i] - p0[i] for i in range(3)]
            e2 = [p2[i] - p0[i] for i in range(3)]
            # ray direction (0,0,1)
            h = [-e2[1], e2[0], 0.0]
            det = sum(e1[i] * h[i] for i in range(3))
            if abs(det) < 1e-9:
                continue
            sv = [x - p0[0], y - p0[1], -5.0 - p0[2]]
            u = sum(sv[i] * h[i] for i in range(3)) / det
            if u < 0 or u > 1:
                continue
            q = [sv[1] * e1[2] - sv[2] * e1[1], sv[2] * e1[0] - sv[0] * e1[2],
                 sv[0] * e1[1] - sv[1] * e1[0]]
            v = q[2] / det
            if v < 0 or u + v > 1:
                continue
            tt = sum(e2[i] * q[i] for i in range(3)) / det
            if tt > 1e-6:
                n += 1
        return n

    open_ys = [y for y in [j * 0.25 for j in range(0, 130)] if hits(0.0, y) == 0]
    if open_ys:
        print(f'  aperture open span at x=0: y {min(open_ys):.2f}..{max(open_ys):.2f}, '
              f'midpoint {(min(open_ys) + max(open_ys)) / 2:.2f} '
              f'(engine entrance line = 12.80)')
    else:
        print('  aperture: NO open span found at x=0')

    # ---- 4. luminance by face class
    stats = {}
    for name in ('hollow_shell', 'hollow_ledges'):
        pos, col, idx = prim_data(g, b, name)
        for t in range(0, len(idx), 3):
            a, bb, c = idx[t], idx[t + 1], idx[t + 2]
            pa, pb, pc = pos[a], pos[bb], pos[c]
            ux = [pb[i] - pa[i] for i in range(3)]
            vx = [pc[i] - pa[i] for i in range(3)]
            n = [ux[1] * vx[2] - ux[2] * vx[1], ux[2] * vx[0] - ux[0] * vx[2],
                 ux[0] * vx[1] - ux[1] * vx[0]]
            ln = math.sqrt(sum(v * v for v in n)) or 1
            ny = n[1] / ln
            L = sum(lum(col[i]) for i in (a, bb, c)) / 3
            y = (pa[1] + pb[1] + pc[1]) / 3
            if name == 'hollow_ledges':
                key = 'ledge-up' if ny > 0.7 else ('ledge-down' if ny < -0.7 else 'ledge-side')
            elif ny > 0.7:
                key = 'floor' if y < 12 else 'shell-up'
            elif ny < -0.7:
                key = 'ceiling' if y > H - 12 else 'shell-down'
            else:
                key = 'walls'
            stats.setdefault(key, []).append(L)
    for k in sorted(stats):
        v = stats[k]
        print(f'  luminance {k:11s} n={len(v):5d} mean={sum(v) / len(v):.4f}')
    d = sum(stats['ledge-down']) / len(stats['ledge-down'])
    u = sum(stats['ledge-up']) / len(stats['ledge-up'])
    print(f'  ledge down/up ratio {d / u:.2f} (target <= 0.50)')
    print(f'  floor/ceiling ratio {(sum(stats["floor"]) / len(stats["floor"])) / (sum(stats["ceiling"]) / len(stats["ceiling"])):.2f} (target > 1.0)')

    # ---- 5. contact shadow under shelves
    pos, col, idx = prim_data(g, b, 'hollow_shell')
    gal = [6.32 + (0.86 - 0.17) * H * t / 3 for t in range(4)]
    galy = [(0.17 + (0.86 - 0.17) * t / 3) * H for t in range(4)]
    near, far = [], []
    for i, p in enumerate(pos):
        x, y, z = p
        wall = min(x + W / 2, W / 2 - x, z + D / 2, D / 2 - z) < 22
        if not wall:
            continue
        dd = min(abs(y - ty) if y < ty else 99 for ty in galy)
        if dd <= 3:
            near.append(lum(col[i]))
        elif 8 <= dd <= 14:
            far.append(lum(col[i]))
    if near and far:
        n = sum(near) / len(near)
        f = sum(far) / len(far)
        print(f'  shell under-shelf (<=3 below) {n:.4f} vs 8-14 below {f:.4f} '
              f'-> {100 * (1 - n / f):.1f}% darker (target >= 30%)')
    del gal
    print('=' * 62)


for p in sys.argv[1:]:
    main(p)
