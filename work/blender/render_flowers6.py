"""Evidence renders for the six new meadow plants, straight off the shipped GLBs,
plus one field shot of all ten species at true relative height."""
import bpy, os, math, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
from render_flowers import wipe, engine, lights, load, shoot, MODELS, OUT

os.makedirs(OUT, exist_ok=True)

NEW = [('dandelion', 3.8), ('cornflower', 5.6), ('poppy', 6.0),
       ('cherry', 11.5), ('lime', 12.6), ('heather', 5.2)]
# all ten, ordered so the field shot reads left to right by habitat
FIELD = [('daisy', 4.6), ('clover', 3.9), ('dandelion', 3.8), ('cornflower', 5.6),
         ('poppy', 6.0), ('harebell', 6.3), ('heather', 5.2), ('spruce', 7.2),
         ('cherry', 11.5), ('lime', 12.6)]


def solo(name, h, elev=34.0, az=-56.0):
    """A real three-quarter: the camera sits at a fixed elevation ABOVE the
    plant. Placing it at a fixed multiple of the height instead put the tall
    species (cherry, lime) at a 14-degree elevation, which is a side view, and
    every upward-facing blossom grazed away to a sliver in it."""
    wipe()
    engine()
    lights()
    load(name)
    target = Vector((0.05, 0, h * 0.50))
    r = h * 1.85
    e, a = math.radians(elev), math.radians(az)
    pos = target + Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a),
                           math.sin(e))) * r
    shoot(OUT + name, pos, target, lens=52.0, res=(1000, 1000))


def field():
    """All ten at true relative height. Orthographic, because a perspective row
    this wide makes the ends smaller than the middle and the whole point of the
    shot is comparing heights."""
    wipe()
    engine()
    lights()
    x = 0.0
    for name, h in FIELD:
        pad = 1.2 + h * 0.20
        x += pad
        before = set(bpy.data.objects)
        load(name)
        for o in set(bpy.data.objects) - before:
            if o.parent is None:
                o.location.x += x
        x += pad
    span = x
    tallest = max(h for _, h in FIELD)
    cd = bpy.data.cameras.new('cam')
    cd.type = 'ORTHO'
    cd.ortho_scale = span * 1.04
    cam = bpy.data.objects.new('cam', cd)
    bpy.context.collection.objects.link(cam)
    target = Vector((span * 0.5, 0, tallest * 0.46))
    cam.location = target + Vector((-span * 0.22, -span, span * 0.34))
    cam.rotation_euler = (cam.location - target).to_track_quat('Z', 'Y').to_euler()
    scn = bpy.context.scene
    scn.camera = cam
    scn.render.resolution_x, scn.render.resolution_y = (2400, 1000)
    scn.render.filepath = OUT + 'field'
    bpy.ops.render.render(write_still=True)
    print('rendered', OUT + 'field  span=%.1f' % span)


def run():
    for name, h in NEW:
        solo(name, h)
    field()


if __name__ == '__main__':
    run()
