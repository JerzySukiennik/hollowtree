"""Inspect the three flower GLBs: hierarchy, tris, colours, geometry ranges."""
import bpy, sys, math
from mathutils import Vector

ROOT = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/'


def clear():
    bpy.ops.wm.read_homefile(use_empty=True)


def lin2srgb(v):
    v = max(0.0, min(1.0, v))
    return v * 12.92 if v <= 0.0031308 else 1.055 * (v ** (1 / 2.4)) - 0.055


def hexs(c):
    return '#%02x%02x%02x' % tuple(int(round(lin2srgb(x) * 255)) for x in c[:3])


def report(name):
    clear()
    bpy.ops.import_scene.gltf(filepath=ROOT + 'assets/models/' + name)
    print('=' * 70)
    print('FILE', name)
    for o in bpy.data.objects:
        par = o.parent.name if o.parent else '-'
        print(' obj %-22s %-8s parent=%-14s loc=%s' % (
            o.name, o.type, par, tuple(round(x, 4) for x in o.matrix_world.translation)))
        if o.type != 'MESH':
            continue
        me = o.data
        me.calc_loop_triangles()
        ws = [o.matrix_world @ v.co for v in me.vertices]
        print('    tris=%d verts=%d mats=%s' % (len(me.loop_triangles), len(me.vertices),
                                                [m.name for m in me.materials]))
        for m in me.materials:
            if m and m.use_nodes:
                for n in m.node_tree.nodes:
                    if n.type == 'BSDF_PRINCIPLED':
                        print('      mat %s base=%s' % (m.name, hexs(n.inputs['Base Color'].default_value)))
        print('    bbox x[%.3f %.3f] y[%.3f %.3f] z[%.3f %.3f]' % (
            min(v.x for v in ws), max(v.x for v in ws),
            min(v.y for v in ws), max(v.y for v in ws),
            min(v.z for v in ws), max(v.z for v in ws)))
        for a in me.color_attributes:
            print('    colattr %s %s %s' % (a.name, a.domain, a.data_type))
            uniq = {}
            if a.domain == 'POINT':
                for i, d in enumerate(a.data):
                    uniq.setdefault(hexs(d.color[:3]), 0)
                    uniq[hexs(d.color[:3])] += 1
            else:
                for d in a.data:
                    uniq.setdefault(hexs(d.color[:3]), 0)
                    uniq[hexs(d.color[:3])] += 1
            for k, v in sorted(uniq.items(), key=lambda t: -t[1]):
                print('       %s x%d' % (k, v))
        # loose-part count
        import bmesh
        bm = bmesh.new(); bm.from_mesh(me)
        seen = set(); groups = 0
        for v in bm.verts:
            if v.index in seen:
                continue
            groups += 1
            stack = [v]; seen.add(v.index)
            while stack:
                cur = stack.pop()
                for e in cur.link_edges:
                    o2 = e.other_vert(cur)
                    if o2.index not in seen:
                        seen.add(o2.index); stack.append(o2)
        bm.free()
        print('    loose parts:', groups)


for f in ('flower-daisy.glb', 'flower-clover.glb', 'flower-harebell.glb'):
    report(f)
