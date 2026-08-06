"""Render the three flower GLBs: portraits, a trio line-up, and the harebell
gather-point close-ups that show no stem geometry crosses the bell.

  Blender --background --factory-startup --python work/blender/ht_render_flowers.py
"""
import bpy, math, os
from mathutils import Vector

ROOT = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/'
MODELS = ROOT + 'assets/models/'
OUT = ROOT + 'work/renders/flowers/'
os.makedirs(OUT, exist_ok=True)

SPEC = [('daisy', 'flower-daisy.glb', 4.6), ('clover', 'flower-clover.glb', 3.9),
        ('harebell', 'flower-harebell.glb', 6.3)]


def wipe():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for d in list(blk):
            blk.remove(d)


def engine(res):
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_EEVEE_NEXT'
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    scn.render.film_transparent = False
    scn.render.image_settings.file_format = 'PNG'
    try:
        scn.eevee.taa_render_samples = 96
        scn.eevee.use_raytracing = True
    except Exception:
        pass
    scn.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.216, 0.216, 0.216, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 1.0


def look_at(ob, target):
    ob.rotation_euler = (ob.location - Vector(target)).to_track_quat('Z', 'Y').to_euler()


def rig(target, dist, azim, elev, lens=52.0, key=3.6):
    for ob in list(bpy.data.objects):
        if ob.type in {'CAMERA', 'LIGHT'}:
            bpy.data.objects.remove(ob, do_unlink=True)
    t = Vector(target)
    a, e = math.radians(azim), math.radians(elev)
    pos = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cd = bpy.data.cameras.new('cam')
    cd.lens = lens
    cam = bpy.data.objects.new('cam', cd)
    bpy.context.collection.objects.link(cam)
    cam.location = pos
    look_at(cam, t)
    bpy.context.scene.camera = cam

    def sun(name, az, el, energy, colour):
        ld = bpy.data.lights.new(name, 'SUN')
        ld.energy = energy
        ld.color = colour
        ld.angle = math.radians(14.0)
        ob = bpy.data.objects.new(name, ld)
        bpy.context.collection.objects.link(ob)
        aa, ee = math.radians(az), math.radians(el)
        ob.location = t + Vector((math.sin(aa) * math.cos(ee), -math.cos(aa) * math.cos(ee),
                                  math.sin(ee))) * (dist * 1.4)
        look_at(ob, t)

    sun('key', azim - 32, elev + 28, key, (1.0, 0.96, 0.88))
    sun('fill', azim + 76, elev + 8, key * 0.45, (0.72, 0.81, 1.0))
    sun('rim', azim + 172, 36, key * 0.55, (1.0, 0.90, 0.74))
    return cam


def load(glb):
    bpy.ops.import_scene.gltf(filepath=MODELS + glb)
    return [o for o in bpy.data.objects if o.type == 'MESH'][0]


def shoot(name):
    bpy.context.scene.render.filepath = OUT + name
    bpy.ops.render.render(write_still=True)
    print('  wrote', OUT + name + '.png')


def portraits():
    for name, glb, h in SPEC:
        wipe()
        engine((900, 1100))
        load(glb)
        rig((0.0, 0.0, h * 0.50), dist=h * 2.3, azim=16.0, elev=7.0, lens=58.0)
        shoot(name)


def trio():
    wipe()
    engine((1400, 900))
    for (name, glb, h), x in zip(SPEC, (-4.4, 0.2, 4.9)):
        ob = load(glb)
        ob.location.x = x
    rig((0.2, 0.0, 2.9), dist=15.0, azim=11.0, elev=5.0, lens=52.0)
    shoot('trio')


def gather_shots():
    """The player hovers at the `head` empty for several seconds while gathering."""
    wipe()
    engine((900, 900))
    load('flower-harebell.glb')
    head = [o for o in bpy.data.objects if o.type == 'EMPTY'][0]
    t = head.matrix_world.translation.copy()
    print('  gather point (blender xyz):', tuple(round(v, 3) for v in t))
    for name, azim, elev in (('harebell-gather-front', 0.0, 3.0),
                             ('harebell-gather-under', 8.0, -34.0),
                             ('harebell-gather-behind', 196.0, 12.0)):
        rig(t, dist=2.5, azim=azim, elev=elev, lens=62.0, key=3.8)
        shoot(name)


if __name__ == '__main__':
    portraits()
    trio()
    gather_shots()
    print('flower renders done')
