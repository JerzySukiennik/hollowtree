"""Evidence renders for the three flower GLBs, straight off the shipped files."""
import bpy, os, math, sys
from mathutils import Vector

MODELS = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/assets/models/'
OUT = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/work/renders/flowers/'
os.makedirs(OUT, exist_ok=True)

SPECIES = [('daisy', 4.6), ('clover', 3.9), ('harebell', 6.3)]


def wipe():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.objects, bpy.data.materials,
                 bpy.data.lights, bpy.data.cameras):
        for b in list(coll):
            if b.users == 0:
                coll.remove(b)


def engine():
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_EEVEE_NEXT'
    scn.render.resolution_percentage = 100
    scn.render.image_settings.file_format = 'PNG'
    scn.render.film_transparent = False
    try:
        scn.eevee.taa_render_samples = 96
        scn.eevee.use_raytracing = True
    except Exception:
        pass
    scn.view_settings.view_transform = 'AgX'
    scn.view_settings.look = 'AgX - Base Contrast'
    w = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    scn.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.30, 0.33, 0.30, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.75


def sun(name, ang, elev, energy, colour):
    d = bpy.data.lights.new(name, 'SUN')
    d.energy = energy
    d.color = colour
    d.angle = math.radians(8)
    ob = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(ob)
    v = Vector((math.cos(ang) * math.cos(elev), math.sin(ang) * math.cos(elev),
                math.sin(elev)))
    ob.rotation_euler = (-v).to_track_quat('-Z', 'Y').to_euler()
    return ob


def lights():
    sun('key', math.radians(-40), math.radians(46), 1.7, (1.0, 0.95, 0.86))
    sun('fill', math.radians(140), math.radians(24), 0.7, (0.72, 0.80, 0.98))
    sun('rim', math.radians(80), math.radians(12), 0.7, (1.0, 0.90, 0.72))


def load(name):
    bpy.ops.import_scene.gltf(filepath=MODELS + 'flower-%s.glb' % name)
    obs = [o for o in bpy.data.objects if o.type == 'MESH']
    for o in obs:
        for slot in o.material_slots:
            m = slot.material
            if m and m.use_nodes:
                b = m.node_tree.nodes.get('Principled BSDF')
                if b:
                    b.inputs['Roughness'].default_value = 0.85
    return obs


def shoot(path, cam_pos, target, lens=45.0, res=(1000, 1100)):
    cd = bpy.data.cameras.new('cam')
    cd.lens = lens
    cam = bpy.data.objects.new('cam', cd)
    bpy.context.collection.objects.link(cam)
    cam.location = Vector(cam_pos)
    cam.rotation_euler = (cam.location - Vector(target)).to_track_quat('Z', 'Y').to_euler()
    scn = bpy.context.scene
    scn.camera = cam
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print('rendered', path)


def solo(name, h):
    wipe()
    engine()
    lights()
    load(name)
    d = h * 1.55
    shoot(OUT + name, (d * 0.70, -d * 0.82, h * 0.92), (0.1, 0, h * 0.46),
          lens=52.0, res=(900, 1100))


def gather_shot():
    """the harebell from where the player hovers: proof that nothing green
    crosses the main bell"""
    wipe()
    engine()
    lights()
    load('harebell')
    hd = next((o for o in bpy.data.objects if o.type == 'EMPTY'
               and o.name.lower().startswith('head')), None)
    p = hd.matrix_world.translation if hd else Vector((0.95, -0.34, 5.16))
    print('gather point (blender):', tuple(round(x, 3) for x in p))
    for tag, off in (('-front', Vector((0.4, -2.6, 0.45))),
                     ('-under', Vector((-1.5, -1.9, -0.9)))):
        shoot(OUT + 'harebell-gather' + tag, p + off, p, lens=58.0, res=(900, 900))


def trio():
    wipe()
    engine()
    lights()
    xs = {'daisy': -4.2, 'clover': 0.4, 'harebell': 4.6}
    for name, h in SPECIES:
        before = set(bpy.data.objects)
        load(name)
        for o in set(bpy.data.objects) - before:
            if o.parent is None:
                o.location.x += xs[name]
    shoot(OUT + 'trio', (0.6, -22.0, 5.4), (0.1, 0, 2.9), lens=50.0, res=(1400, 900))


def run():
    for name, h in SPECIES:
        solo(name, h)
    gather_shot()
    trio()
