"""Where do the last bad edges appear? Instrument build() stage by stage."""
import sys, os, bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import build_tree as B


def bad(ob, tag):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    b = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    n = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    print('STAGE %-24s faces=%5d boundary=%d nonman=%d' % (tag, len(bm.faces), b, n))
    bm.free()


orig_apply = B.apply_bool
counter = [0]


def traced(target, cutter, name, op='DIFFERENCE', self_isect=False):
    orig_apply(target, cutter, name, op, self_isect)
    counter[0] += 1
    bad(target, '%02d %s' % (counter[0], name))


B.apply_bool = traced
info = B.run()
print('RESULT', info['trunk_tris'], info['canopy_tris'])
bad(bpy.data.objects['trunk'], 'final')
