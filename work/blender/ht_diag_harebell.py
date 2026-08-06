"""Group harebell (and clover) triangles by corner colour, report per-group bbox."""
import bpy
from mathutils import Vector

ROOT = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/'


def lin2srgb(v):
    v = max(0.0, min(1.0, v))
    return v * 12.92 if v <= 0.0031308 else 1.055 * (v ** (1 / 2.4)) - 0.055


def hexs(c):
    return '#%02x%02x%02x' % tuple(int(round(lin2srgb(x) * 255)) for x in c[:3])


def run(name):
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=ROOT + 'assets/models/' + name)
    ob = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    me = ob.data
    me.calc_loop_triangles()
    ca = me.color_attributes[0]
    groups = {}
    for t in me.loop_triangles:
        cols = tuple(sorted({hexs(ca.data[li].color) for li in t.loops}))
        key = cols
        g = groups.setdefault(key, [])
        g.append(t)
    print('=' * 70, name)
    for key, tris in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        pts = []
        for t in tris:
            for vi in t.vertices:
                pts.append(me.vertices[vi].co)
        print('%-42s n=%3d x[%6.2f %6.2f] y[%6.2f %6.2f] z[%6.2f %6.2f]' % (
            '/'.join(key)[:42], len(tris),
            min(p.x for p in pts), max(p.x for p in pts),
            min(p.y for p in pts), max(p.y for p in pts),
            min(p.z for p in pts), max(p.z for p in pts)))


run('flower-harebell.glb')
run('flower-clover.glb')
run('flower-daisy.glb')
