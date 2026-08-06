import bpy, math, os
from mathutils import Vector, Euler

OUT = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/work/renders/hollow-tree/'
os.makedirs(OUT, exist_ok=True)

TARGET = Vector((1.2, 0.0, 36.0))
DIST = 172.0


def clear_rig():
    for ob in list(bpy.data.objects):
        if ob.type in {'CAMERA', 'LIGHT'} or ob.name.startswith('RIG_'):
            bpy.data.objects.remove(ob, do_unlink=True)


def look_at(ob, target):
    d = (ob.location - target)
    ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()


def cam_pos(theta_deg, height):
    """theta = 0 -> looking at the entrance face (camera on -Y)"""
    t = math.radians(theta_deg)
    return Vector((TARGET.x + DIST * math.sin(t),
                   TARGET.y - DIST * math.cos(t),
                   height))


def build_rig(theta_deg, height):
    clear_rig()
    scn = bpy.context.scene
    cam_data = bpy.data.cameras.new('RIG_cam')
    cam_data.lens = 13.5 * DIST / 41.0
    cam = bpy.data.objects.new('RIG_cam', cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = cam_pos(theta_deg, height)
    look_at(cam, TARGET)
    scn.camera = cam

    def lamp(name, kind, theta, dist, z, energy, color, size=60.0):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        ld.color = color
        if kind == 'AREA':
            ld.size = size
        if kind == 'SUN':
            ld.angle = math.radians(6.0)
        ob = bpy.data.objects.new(name, ld)
        bpy.context.collection.objects.link(ob)
        ob.location = cam_pos(theta, z) if dist is None else \
            Vector((TARGET.x + dist * math.sin(math.radians(theta)),
                    TARGET.y - dist * math.cos(math.radians(theta)), z))
        look_at(ob, TARGET)
        return ob

    # warm honey key from the upper front-left of the camera
    lamp('RIG_key', 'SUN', theta_deg - 34, 200, 150, 4.2, (1.0, 0.85, 0.62))
    # cool sky fill from the opposite side
    lamp('RIG_fill', 'AREA', theta_deg + 78, 150, 60, 42000.0, (0.62, 0.72, 0.95), size=110)
    # warm rim from behind
    lamp('RIG_rim', 'AREA', theta_deg + 168, 145, 78, 55000.0, (1.0, 0.72, 0.42), size=90)
    # gentle bounce from below-front
    lamp('RIG_bounce', 'AREA', theta_deg - 8, 130, 6, 26000.0, (0.85, 0.78, 0.66), size=120)
    return cam


def set_world(rgb, strength=1.0):
    w = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs[0].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bg.inputs[1].default_value = strength


def setup_engine():
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_EEVEE_NEXT'
    scn.render.resolution_x = 1200
    scn.render.resolution_y = 900
    scn.render.resolution_percentage = 100
    scn.render.film_transparent = False
    scn.render.image_settings.file_format = 'PNG'
    ee = scn.eevee
    try:
        ee.taa_render_samples = 64
    except Exception:
        pass
    try:
        ee.use_raytracing = True
    except Exception:
        pass
    try:
        scn.view_settings.view_transform = 'AgX'
        scn.view_settings.look = 'AgX - Medium Contrast'
    except Exception:
        pass


def shoot(name, theta, height):
    build_rig(theta, height)
    bpy.context.scene.render.filepath = OUT + name
    bpy.ops.render.render(write_still=True)
    print('wrote', OUT + name + '.png')


def silhouette_on():
    black = bpy.data.materials.get('SIL_black')
    if black is None:
        black = bpy.data.materials.new('SIL_black')
        black.use_nodes = True
        nt = black.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs[0].default_value = (0, 0, 0, 1)
        em.inputs[1].default_value = 1.0
        nt.links.new(em.outputs[0], out.inputs[0])
    saved = {}
    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        saved[ob.name] = [s.material for s in ob.material_slots]
        for s in ob.material_slots:
            s.material = black
    return saved


def silhouette_off(saved):
    for name, mats in saved.items():
        ob = bpy.data.objects.get(name)
        if not ob:
            continue
        for s, m in zip(ob.material_slots, mats):
            s.material = m


def run():
    setup_engine()
    set_world((0.216, 0.216, 0.216), 1.0)
    shoot('front-entrance', 0.0, 40.0)
    shoot('three-quarter', -42.0, 48.0)
    shoot('side', 92.0, 40.0)
    saved = silhouette_on()
    prev_vt = bpy.context.scene.view_settings.view_transform
    bpy.context.scene.view_settings.view_transform = 'Standard'
    set_world((1.0, 1.0, 1.0), 1.0)
    build_rig(-18.0, 38.0)
    for ob in list(bpy.data.objects):
        if ob.type == 'LIGHT':
            bpy.data.objects.remove(ob, do_unlink=True)
    bpy.context.scene.render.filepath = OUT + 'silhouette'
    bpy.ops.render.render(write_still=True)
    silhouette_off(saved)
    bpy.context.scene.view_settings.view_transform = prev_vt
    set_world((0.216, 0.216, 0.216), 1.0)
    print('renders done')


GLB = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/assets/models/hollow-tree.glb'


def bake_material_basecolor():
    """glTF only writes baseColorFactor when Base Color is an unlinked constant.
    The viewport/render setup multiplies vertex colour in via a node; the exported
    material must instead carry the flat palette colour and let COLOR_0 do the rest
    (which is exactly baseColorFactor * COLOR_0 in the glTF spec)."""
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        if not bsdf:
            continue
        inp = bsdf.inputs['Base Color']
        if not inp.links:
            continue
        mix = inp.links[0].from_node
        const = None
        if mix.type == 'MIX_RGB':
            const = tuple(mix.inputs['Color2'].default_value)
        m.node_tree.links.remove(inp.links[0])
        if const:
            inp.default_value = const
        print('  baked base colour for', m.name, tuple(round(c, 4) for c in inp.default_value))


def export_glb():
    # strip the render rig so no cameras/lights can reach the file
    for ob in list(bpy.data.objects):
        if ob.type in {'CAMERA', 'LIGHT'} or ob.name.startswith('RIG_'):
            bpy.data.objects.remove(ob, do_unlink=True)
    for m in list(bpy.data.materials):
        if m.name.startswith('SIL_'):
            bpy.data.materials.remove(m)
    bake_material_basecolor()
    kw = dict(
        filepath=GLB,
        export_format='GLB',
        use_selection=False,
        export_yup=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_materials='EXPORT',
        export_normals=True,
        export_texcoords=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
    )
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    import os
    print('GLB written:', GLB, os.path.getsize(GLB), 'bytes')
