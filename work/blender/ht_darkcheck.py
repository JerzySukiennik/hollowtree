"""No interior shell may be the first surface a camera sees above the entrance.

Sweeps the front (glTF -Z) and side (glTF -X) views over glTF y in [20, 40] at
0.5-unit spacing and reports any sample whose first hit is a `bark_dark` face.

Blender is Z-up: glTF (x, y, z) == Blender (x, z, -y).
"""
import bpy, math
from mathutils import Vector


def first_hit_material(ob, origin, direction):
    ok, loc, nor, idx = ob.ray_cast(Vector(origin), Vector(direction))
    if not ok:
        return None, None
    return ob.data.polygons[idx].material_index, loc


def sweep(ob, y_lo=20.0, y_hi=40.0, step=0.5, span=14.0, lateral_step=0.5):
    """returns (samples, dark_hits) for the front and side sweeps"""
    dark_slot = None
    for i, m in enumerate(ob.data.materials):
        if m and 'dark' in m.name:
            dark_slot = i
    total = 0
    dark = []
    n_lat = int(2 * span / lateral_step) + 1
    z = y_lo
    while z <= y_hi + 1e-9:
        for k in range(n_lat):
            u = -span + k * lateral_step
            # front: glTF -Z camera == Blender -Y, ray travels +Y
            for origin, direction, tag in (
                    ((u, -80.0, z), (0, 1, 0), 'front'),
                    ((-80.0, u, z), (1, 0, 0), 'side')):
                mi, loc = first_hit_material(ob, origin, direction)
                if mi is None:
                    continue
                total += 1
                if mi == dark_slot:
                    dark.append((tag, round(u, 2), round(z, 2),
                                 tuple(round(c, 2) for c in loc)))
        z += step
    return total, dark


def report():
    ob = bpy.data.objects['trunk']
    total, dark = sweep(ob)
    print('DARK SWEEP  glTF y 20..40 @0.5, front(-Z) and side(-X): %d samples hit the '
          'prop, %d return bark_dark as FIRST HIT' % (total, len(dark)))
    for d in dark[:25]:
        print('   %-5s lateral=%6.2f  y=%5.2f  at %s' % d)
    return len(dark)
