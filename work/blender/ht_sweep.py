import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import build_tree as B, verify_tree as V, ht_weldcheck as W

B.CLEAN_WELD = float(os.environ.get('CW', '0.012'))
B.CLEAN_DEGEN = float(os.environ.get('CD', '0.008'))
i = B.run()
print('RESULT trunk=%d canopy=%d total=%d' % (i['trunk_tris'], i['canopy_tris'], i['total_tris']))
V.mesh_audit()
V.shaft_test()
W.report()
