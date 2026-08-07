"""Read flower-spruce.glb as bytes and report what actually shipped."""
import json, struct, sys

P = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/assets/models/flower-spruce.glb'
raw = open(P, 'rb').read()
assert raw[:4] == b'glTF', 'not a GLB'
off = 12
js = bin_chunk = None
while off < len(raw):
    ln, ty = struct.unpack_from('<II', raw, off)
    data = raw[off + 8: off + 8 + ln]
    if ty == 0x4E4F534A:
        js = json.loads(data)
    else:
        bin_chunk = data
    off += 8 + ln + ((4 - ln % 4) % 4) * 0

g = js
print('file bytes      :', len(raw))
print('generator       :', g['asset'].get('generator'))
print('nodes           :', [(i, n.get('name'), 'mesh' if 'mesh' in n else 'empty',
                             [round(x, 4) for x in n.get('translation', [0, 0, 0])])
                            for i, n in enumerate(g['nodes'])])
print('materials       :', len(g.get('materials', [])),
      [m.get('name') for m in g.get('materials', [])])
tris = 0
for m in g['meshes']:
    for p in m['primitives']:
        acc = g['accessors'][p['indices']] if 'indices' in p else None
        cnt = acc['count'] if acc else g['accessors'][p['attributes']['POSITION']]['count']
        tris += cnt // 3
        print('primitive       : attrs=%s mode=%s indices=%d tris=%d'
              % (sorted(p['attributes'].keys()), p.get('mode', 4), cnt, cnt // 3))
        for a, ai in sorted(p['attributes'].items()):
            ac = g['accessors'][ai]
            print('   %-9s type=%s comp=%s count=%d min=%s max=%s'
                  % (a, ac['type'], ac['componentType'], ac['count'],
                     [round(x, 4) for x in ac.get('min', [])],
                     [round(x, 4) for x in ac.get('max', [])]))
print('TOTAL TRIS      :', tris)

pos = None
for m in g['meshes']:
    for p in m['primitives']:
        a = g['accessors'][p['attributes']['POSITION']]
        pos = (a['min'], a['max'])
print('mesh bbox min   :', [round(x, 4) for x in pos[0]])
print('mesh bbox max   :', [round(x, 4) for x in pos[1]])
print('height (y)      :', round(pos[1][1] - pos[0][1], 4))

# COLOR_0 sanity: decode the first few and the extremes
for m in g['meshes']:
    for p in m['primitives']:
        if 'COLOR_0' not in p['attributes']:
            print('COLOR_0         : MISSING')
            continue
        ac = g['accessors'][p['attributes']['COLOR_0']]
        bv = g['bufferViews'][ac['bufferView']]
        base = bv.get('byteOffset', 0) + ac.get('byteOffset', 0)
        ct = ac['componentType']
        ncomp = {'VEC3': 3, 'VEC4': 4}[ac['type']]
        vals = []
        for i in range(ac['count']):
            if ct == 5126:
                v = struct.unpack_from('<' + 'f' * ncomp, bin_chunk, base + i * 4 * ncomp)
            elif ct == 5123:
                v = tuple(x / 65535.0 for x in
                          struct.unpack_from('<' + 'H' * ncomp, bin_chunk, base + i * 2 * ncomp))
            else:
                v = tuple(x / 255.0 for x in
                          struct.unpack_from('<' + 'B' * ncomp, bin_chunk, base + i * ncomp))
            vals.append(v[:3])
        uniq = sorted(set(tuple(round(c, 4) for c in v) for v in vals))
        print('COLOR_0         : present, %s comp=%d count=%d unique=%d'
              % (ac['type'], ct, ac['count'], len(uniq)))

        def srgb(c):
            return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
        hexes = {}
        for v in vals:
            h = '#%02x%02x%02x' % tuple(int(round(min(1, max(0, srgb(c))) * 255)) for c in v)
            hexes[h] = hexes.get(h, 0) + 1
        top = sorted(hexes.items(), key=lambda t: -t[1])
        print('   sRGB palette (%d distinct), most used: %s' % (len(top), top[:10]))
        warm = sum(n for h, n in hexes.items()
                   if int(h[1:3], 16) > int(h[5:7], 16) + 40 and int(h[1:3], 16) > 120)
        print('   warm (resin-ish) corners: %d / %d' % (warm, len(vals)))

for i, n in enumerate(g['nodes']):
    if (n.get('name') or '').lower().startswith('head'):
        t = n.get('translation', [0, 0, 0])
        print('head node       : idx=%d translation=%s' % (i, [round(x, 4) for x in t]))
        print('   height fraction of 7.2: %.3f' % (t[1] / 7.2))
