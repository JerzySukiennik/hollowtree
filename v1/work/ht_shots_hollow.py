"""Interior evidence renders for hollow.glb."""
import os
import sys
import bpy

HERE = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/work'
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import importlib
import ht_render as R
importlib.reload(R)

H = 63.64
SKY = [(-21.12, 8.32), (21.12, -8.32)]

bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'ht_hollow.blend'))
R.setup_world((0.150, 0.128, 0.104), 1.0)   # stands in for ambient 0.16 + hemi 0.62
R.prep_engine(samples=160, exposure=0.35)

R.add_light('ent', (0, 13.6, 31.0), 9000, (1.0, 0.78, 0.48), radius=3.2)
R.add_light('ent2', (0, 16.0, 20.0), 2600, (1.0, 0.72, 0.42), radius=8.0)
for i, (sx, sz) in enumerate(SKY):
    R.add_light(f'sky{i}', (sx, H - 8.0, sz), 13000, (0.78, 0.86, 1.0), radius=7.0)
R.add_light('crown', (-4, 40, -2), 3500, (0.95, 0.78, 0.52), radius=18.0)
R.add_light('basin', (-16, 4.5, -20), 2000, (1.0, 0.60, 0.24), radius=6.0)
R.add_light('basin2', (26, 4.5, 6), 1600, (1.0, 0.60, 0.24), radius=6.0)

out = os.path.join(HERE, 'renders', 'hollow')
R.render(os.path.join(out, 'interior-entrance.png'), (-3.0, 19.5, -6.0), (0.5, 13.6, 32.0),
         (1200, 900), lens=24.0)
R.render(os.path.join(out, 'interior-wide.png'), (-40.0, 20.0, 6.0), (30.0, 34.0, -12.0),
         (1200, 900), lens=18.0)
R.render(os.path.join(out, 'interior-up.png'), (-6.0, 9.0, -3.0), (-21.0, 60.0, 8.0),
         (1200, 900), lens=21.0)
