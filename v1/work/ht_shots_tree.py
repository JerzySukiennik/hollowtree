"""Evidence renders for meadow-tree.glb."""
import os
import sys
import bpy

HERE = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/work'
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import importlib
import ht_render as R
importlib.reload(R)

out = os.path.join(HERE, 'renders', 'forest')

# ---- three-quarter beauty shot -----------------------------------
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'ht_tree.blend'))
R.setup_world((0.36, 0.40, 0.44), 0.55)
R.prep_engine(samples=160)
R.add_light('sun', (2.0, 3.2, 2.6), 900, (1.0, 0.94, 0.82), radius=0.8)
R.add_light('bounce', (-2.0, 0.6, -1.6), 120, (0.55, 0.68, 0.55), radius=2.0)
R.render(os.path.join(out, 'meadow-tree.png'), (1.42, 0.68, 1.16), (0.0, 0.50, 0.0),
         (1000, 1000), lens=52.0)

# ---- the same tree, small, against fog ---------------------------
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'ht_tree.blend'))
R.setup_world((0.52, 0.55, 0.54), 1.25)          # fog grey
R.prep_engine(samples=160)
R.add_light('sun', (3.0, 4.0, 3.0), 260, (1.0, 0.95, 0.86), radius=1.5)
# ~200 px of a 1000 px frame: 52 mm lens, 36 mm sensor -> d = 52/(36*0.2) = 7.2
R.render(os.path.join(out, 'meadow-tree-far.png'), (5.4, 1.5, 4.8), (0.0, 0.50, 0.0),
         (1000, 1000), lens=52.0)
