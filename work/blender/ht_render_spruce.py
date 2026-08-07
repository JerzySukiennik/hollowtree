"""Evidence renders for flower-spruce.glb, straight off the shipped file."""
import bpy, os, math
from mathutils import Vector

MODELS = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/assets/models/'
OUT = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/work/renders/spruce/'
os.makedirs(OUT, exist_ok=True)


def wipe():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.objects, bpy.data.materials,
                 bpy.data.lights, bpy.data.cameras):
        for b in list(coll):
            if b.users == 0:
                coll.remove(b)


def engine(bg=(0.30, 0.33, 0.30), strength=0.75):
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
    w.node_tree.nodes['Background'].inputs[0].default_value = (bg[0], bg[1], bg[2], 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = strength


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


def load(fname):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=MODELS + fname)
    new = set(bpy.data.objects) - before
    for o in new:
        if o.type != 'MESH':
            continue
        for slot in o.material_slots:
            m = slot.material
            if m and m.use_nodes:
                b = m.node_tree.nodes.get('Principled BSDF')
                if b:
                    b.inputs['Roughness'].default_value = 0.85
    return new


def shoot(path, cam_pos, target, lens=50.0, res=(1000, 1000)):
    cd = bpy.data.cameras.new('cam')
    cd.lens = lens
    cd.sensor_fit = 'VERTICAL'
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


def close_shot():
    wipe()
    engine()
    lights()
    load('flower-spruce.glb')
    hd = next((o for o in bpy.data.objects if o.type == 'EMPTY'
               and o.name.lower().startswith('head')), None)
    if hd:
        print('head empty (blender coords after import):',
              tuple(round(x, 3) for x in hd.matrix_world.translation))
    for o in list(bpy.data.objects):
        if o.type == 'EMPTY':
            bpy.data.objects.remove(o, do_unlink=True)
    d = 15.5
    shoot(OUT + 'spruce', (d * 0.62, -d * 0.78, 5.6), (0.0, 0.0, 3.5), lens=44.0)


def far_shot():
    """the same tree at roughly 150 px tall against fog-grey"""
    wipe()
    engine(bg=(0.62, 0.65, 0.66), strength=1.0)
    lights()
    load('flower-spruce.glb')
    for o in list(bpy.data.objects):
        if o.type == 'EMPTY':
            bpy.data.objects.remove(o, do_unlink=True)
    # vertical sensor 24 mm, lens 50 -> frame height = 0.48 * d.
    # want 7.2 units == 0.15 of a 1000 px frame  ->  d = 7.2 / (0.15 * 0.48)
    d = 7.2 / (0.15 * (24.0 / 50.0))
    ang = math.radians(-58)
    shoot(OUT + 'spruce-far',
          (math.cos(ang) * d, math.sin(ang) * d, 5.0), (0.0, 0.0, 3.6), lens=50.0)


def field_shot():
    """beside one daisy, one clover and one harebell at true relative heights"""
    wipe()
    engine()
    lights()
    plan = [('flower-daisy.glb', -5.6), ('flower-clover.glb', -2.4),
            ('flower-harebell.glb', 0.6), ('flower-spruce.glb', 4.6)]
    for fname, x in plan:
        for o in load(fname):
            if o.parent is None:
                o.location.x += x
    for o in list(bpy.data.objects):
        if o.type == 'EMPTY':
            bpy.data.objects.remove(o, do_unlink=True)
    shoot(OUT + 'spruce-field', (-0.2, -29.0, 5.2), (-0.4, 0.0, 3.5),
          lens=44.0, res=(1000, 1000))


close_shot()
far_shot()
field_shot()
