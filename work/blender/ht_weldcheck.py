"""Weld / connectivity acceptance test for the trunk mesh."""
import bpy, bmesh


def components(ob, weld=0.001):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    if weld:
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=weld)
    bm.verts.ensure_lookup_table()
    seen = set()
    comps = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack = [v]
        seen.add(v.index)
        n = 0
        while stack:
            cur = stack.pop()
            n += 1
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        comps.append(n)
    nonman = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    boundary = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    bm.free()
    comps.sort(reverse=True)
    return comps, nonman, boundary, tris


def report(names=('trunk', 'canopy_foliage')):
    out = {}
    for n in names:
        ob = bpy.data.objects.get(n)
        if not ob:
            continue
        comps, nonman, boundary, tris = components(ob)
        print('WELD %-16s components=%d  (sizes %s)  non-manifold=%d  boundary=%d  tris=%d'
              % (n, len(comps), comps[:8], nonman, boundary, tris))
        out[n] = dict(components=len(comps), nonmanifold=nonman,
                      boundary=boundary, tris=tris)
    return out
