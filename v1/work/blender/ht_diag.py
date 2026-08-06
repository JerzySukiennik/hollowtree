import sys, os, math
import bpy
import bmesh
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import build_tree as B, verify_tree as V

i = B.run()
print('RESULT trunk=%d canopy=%d total=%d' % (i['trunk_tris'], i['canopy_tris'], i['total_tris']))
ok, total, fails = V.shaft_test()
tr = bpy.data.objects['trunk'] if False else __import__('bpy').data.objects['trunk']
ent = __import__('bpy').data.objects['entrance']
print('entrance', tuple(round(x, 3) for x in ent.location))
for f in fails:
    u, w, n, fz = f
    px = ent.location.x + u * 3.2
    pz = ent.location.z + w * 3.2
    print('  FAIL u=%.2f w=%.2f  px=%.2f pz=%.2f  crossings=%d  first glTFz=%s'
          % (u, w, px, pz, n, ('%.2f' % fz) if fz is not None else 'none'))

bm = bmesh.new()
bm.from_mesh(tr.data)
bad = [e for e in bm.edges if len(e.link_faces) != 2]
print('BAD EDGES', len(bad))
for e in bad[:30]:
    m = (e.verts[0].co + e.verts[1].co) / 2
    print('   faces=%d at (%.2f, %.2f, %.2f)  len=%.4f'
          % (len(e.link_faces), m.x, m.y, m.z, e.calc_length()))
bm.free()
