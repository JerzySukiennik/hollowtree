"""Render evidence shots of the Hollowtree assets (run inside Blender)."""
import math
import os
import sys
import bpy
from mathutils import Vector

HERE = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/work'
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import ht_common as C
import importlib
importlib.reload(C)

OUT = os.path.join(HERE, 'renders')


def g2b(p):
    return Vector(C.g2b(p))


def setup_world(color=(0.02, 0.015, 0.01), strength=1.0):
    w = bpy.data.worlds.new('W') if not bpy.data.worlds else bpy.data.worlds[0]
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs[0].default_value = (color[0], color[1], color[2], 1)
    bg.inputs[1].default_value = strength


def add_light(name, pos_game, energy, color, radius=4.0, kind='POINT'):
    d = bpy.data.lights.new(name, kind)
    d.energy = energy
    d.color = color
    if kind == 'POINT':
        d.shadow_soft_size = radius
    ob = bpy.data.objects.new(name, d)
    ob.location = g2b(pos_game)
    bpy.context.collection.objects.link(ob)
    return ob


def render(path, loc_game, look_game, res=(1200, 900), lens=20.0):
    scn = bpy.context.scene
    cam_d = bpy.data.cameras.new('cam')
    cam_d.lens = lens
    cam = bpy.data.objects.new('cam', cam_d)
    bpy.context.collection.objects.link(cam)
    cam.location = g2b(loc_game)
    direction = g2b(look_game) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scn.camera = cam
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    scn.render.filepath = path
    scn.render.image_settings.file_format = 'PNG'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print('rendered', path, os.path.getsize(path))


def prep_engine(samples=64, exposure=0.0):
    scn = bpy.context.scene
    try:
        scn.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scn.render.engine = 'BLENDER_EEVEE'
    ee = scn.eevee
    if hasattr(ee, 'taa_render_samples'):
        ee.taa_render_samples = samples
    if hasattr(ee, 'use_raytracing'):
        ee.use_raytracing = True
    scn.view_settings.view_transform = 'Standard'
    scn.view_settings.look = 'None'
    scn.view_settings.exposure = exposure
