"""Inspect a GLB: nodes, meshes, tris, attributes, materials, bbox."""
import json
import struct
import sys


def load(path):
    with open(path, 'rb') as f:
        data = f.read()
    assert data[:4] == b'glTF'
    off = 12
    js = None
    bins = None
    while off < len(data):
        ln, ty = struct.unpack_from('<II', data, off)
        chunk = data[off + 8: off + 8 + ln]
        if ty == 0x4E4F534A:
            js = json.loads(chunk)
        else:
            bins = chunk
        off += 8 + ln
    return js, bins, len(data)


def report(path):
    g, b, size = load(path)
    print('file:', path, size, 'bytes')
    print('nodes:', [n.get('name') for n in g.get('nodes', [])])
    print('materials:', [(m.get('name'), m.get('doubleSided'),
                          m.get('pbrMetallicRoughness', {}).get('metallicFactor'),
                          'emissive' in json.dumps(m))
                         for m in g.get('materials', [])])
    total = 0
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for m in g['meshes']:
        for pr in m['primitives']:
            acc = g['accessors'][pr['indices']] if 'indices' in pr else None
            n = acc['count'] // 3 if acc else 0
            total += n
            pos = g['accessors'][pr['attributes']['POSITION']]
            for i in range(3):
                mn[i] = min(mn[i], pos['min'][i])
                mx[i] = max(mx[i], pos['max'][i])
            print(f"  mesh {m['name']}: tris {n}, attrs {sorted(pr['attributes'])}, "
                  f"mat {g['materials'][pr['material']]['name'] if 'material' in pr else None}, "
                  f"min {[round(v,3) for v in pos['min']]} max {[round(v,3) for v in pos['max']]}")
    print('TOTAL TRIS:', total)
    print('BBOX size:', [round(mx[i] - mn[i], 3) for i in range(3)],
          'min', [round(v, 3) for v in mn], 'max', [round(v, 3) for v in mx])
    has = all('COLOR_0' in pr['attributes'] for m in g['meshes'] for pr in m['primitives'])
    print('COLOR_0 on every primitive:', has)


for p in sys.argv[1:]:
    report(p)
    print('-' * 60)
