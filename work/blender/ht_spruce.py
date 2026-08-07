"""Hollowtree -- spruce sapling (the only resin source in the game).

Silhouette brief: a young spruce. Bare-ish lower bole, irregular whorls of
branches narrowing to a leader spike. The one thing that must survive being
147 instances at meadow distance is (a) the tapering conifer spike, which is
what separates it from every round-headed flower, and (b) a warm amber resin
run on the bole, which is the reason a player walks over here at all.

The resin sits at z 4.6. The whorl that would naturally live at that height is
built as a HALF whorl on the far side only -- a broken branch stub is exactly
why a real spruce weeps there, and it keeps the bead unoccluded from the front.

Blender is Z-up; the exporter writes +Y up, which is what the engine expects.
Triangle budget for the whole file: 180.
"""
import bpy, math, os
from mathutils import Vector

OUT = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/assets/models/'
NAME = 'flower-spruce.glb'
HEIGHT = 7.2

TAU = math.pi * 2


# ---------------------------------------------------------------- colour utils
def hex_rgb(h):
    return ((h >> 16 & 255) / 255.0, (h >> 8 & 255) / 255.0, (h & 255) / 255.0)


def s2l(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(h):
    """glTF COLOR_0 is linear; the material factor is white, so this IS the colour"""
    return tuple(s2l(c) for c in hex_rgb(h))


def mixc(a, b, k):
    return tuple(a[i] * (1 - k) + b[i] * k for i in range(3))


def shade(c, k):
    return tuple(min(1.0, max(0.0, x * k)) for x in c)


NEEDLE = lin(0x2f4a2a)        # deep, inside the crown
NEEDLE_TIP = lin(0x3c5c33)    # lighter at the tips
BARK = lin(0x4a3a24)
RESIN = lin(0xc98a3c)
RESIN_HI = lin(0xe0a95c)


# ------------------------------------------------------------------ mesh build
class Builder:
    """collects flat-shaded triangles with a per-corner colour"""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.cols = []

    def tri(self, a, b, c, ca, cb, cc):
        i = len(self.verts)
        self.verts += [Vector(a), Vector(b), Vector(c)]
        self.faces.append((i, i + 1, i + 2))
        self.cols.append((ca, cb, cc))

    def quad(self, a, b, c, d, ca, cb, cc, cd):
        self.tri(a, b, c, ca, cb, cc)
        self.tri(a, c, d, ca, cc, cd)

    def count(self):
        return len(self.faces)

    def to_object(self, name):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in self.verts], [], self.faces)
        me.update()
        ob = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(ob)
        ca = me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='CORNER')
        for p in me.polygons:
            p.use_smooth = False
            cols = self.cols[p.index]
            for k, li in enumerate(p.loop_indices):
                r, g, b = cols[k]
                ca.data[li].color = (r, g, b, 1.0)
        set_active_color(me)
        return ob


def set_active_color(me, name='Col'):
    """the exporter only writes the mesh's *render* colour attribute"""
    try:
        me.attributes.active_color_name = name
    except Exception:
        pass
    try:
        me.attributes.default_color_name = name
    except Exception:
        pass
    ca = me.color_attributes.get(name)
    if ca is not None:
        me.color_attributes.active_color = ca


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects,
                  bpy.data.lights, bpy.data.cameras, bpy.data.images):
        for b in list(block):
            if b.users == 0:
                block.remove(b)


def flower_material():
    m = bpy.data.materials.new('ht_spruce')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (1.0, 1.0, 1.0, 1.0)
        if 'Roughness' in bsdf.inputs:
            bsdf.inputs['Roughness'].default_value = 0.85
        if 'Metallic' in bsdf.inputs:
            bsdf.inputs['Metallic'].default_value = 0.0
        # The glTF exporter writes a real COLOR_0 only when the material actually
        # reads the colour attribute; without this node it emits a white
        # placeholder and the whole sapling ships grey.
        attr = nt.nodes.new('ShaderNodeVertexColor')
        attr.layer_name = 'Col'
        attr.location = (-320, 120)
        for l in list(bsdf.inputs['Base Color'].links):
            nt.links.remove(l)
        nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    m.use_backface_culling = False
    return m


# --------------------------------------------------------------------- helpers
def jit(seed):
    """deterministic 0..1 -- the lopsidedness has to be the same every build"""
    x = math.sin(seed * 127.1 + 311.7) * 43758.5453
    return x - math.floor(x)


# The bole leans a little; a sapling that grew dead straight looks CAD-made.
SPINE = [(0.00, 0.000, 0.000),
         (2.45, 0.055, 0.020),
         (4.60, 0.020, -0.030),
         (6.60, -0.090, -0.055),
         (7.20, -0.135, -0.070)]


def spine_at(z):
    for i in range(len(SPINE) - 1):
        z0, x0, y0 = SPINE[i]
        z1, x1, y1 = SPINE[i + 1]
        if z <= z1 or i == len(SPINE) - 2:
            t = (z - z0) / (z1 - z0)
            t = min(1.0, max(0.0, t))
            return Vector((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z))
    return Vector((0, 0, z))


def build_trunk(B):
    """three-sided tapering bole. Bark at the bottom, needle green at the leader,
    so the spike above the top whorl reads as foliage rather than a stick."""
    rings = [(0.00, 0.30), (2.45, 0.205), (4.60, 0.150), (6.60, 0.062)]
    cols = [shade(BARK, 0.52), BARK, shade(BARK, 0.86), shade(NEEDLE, 0.85)]
    yaw = 0.35
    pts = []
    for z, r in rings:
        c = spine_at(z)
        pts.append([c + Vector((math.cos(yaw + TAU * i / 3) * r,
                                math.sin(yaw + TAU * i / 3) * r, 0.0))
                    for i in range(3)])
    for k in range(len(rings) - 1):
        for i in range(3):
            j = (i + 1) % 3
            B.quad(pts[k][i], pts[k][j], pts[k + 1][j], pts[k + 1][i],
                   cols[k], cols[k], cols[k + 1], cols[k + 1])
    # leader spike -- the taper that has to survive at 150 px
    apex = spine_at(7.20)
    tip = shade(NEEDLE_TIP, 1.05)
    for i in range(3):
        j = (i + 1) % 3
        B.tri(pts[-1][i], pts[-1][j], apex, cols[-1], cols[-1], tip)


def whorl(B, z, n, radius, droop, yaw, seed, dark, light,
          arc=TAU, ragged=(), lopsided=0.0):
    """One tier of branches as a drooping skirt band.

    Radii and droop vary per branch direction, so no two tiers are the same
    cone; `lopsided` biases one flank wider, which is what real saplings do
    after a few years of one-sided light.
    """
    c = spine_at(z)
    r_in = 0.13 + 0.05 * (1.0 - z / HEIGHT)
    closed = abs(arc - TAU) < 1e-6
    m = n if closed else n + 1
    inner, outer, tint = [], [], []
    for i in range(m):
        a = yaw + arc * i / n
        k = jit(seed + i * 3.7)
        bias = 1.0 + lopsided * math.cos(a - yaw - 0.9)
        r = radius * (0.74 + 0.42 * k) * bias
        d = droop * (0.62 + 0.75 * jit(seed + i * 5.1 + 2.0))
        ca = math.cos(a)
        sa = math.sin(a)
        inner.append(c + Vector((ca * r_in, sa * r_in, 0.06)))
        outer.append(c + Vector((ca * r, sa * r, -d)))
        tint.append(mixc(light, shade(light, 1.10), k))
    for i in range(n):
        j = (i + 1) % m
        B.quad(inner[i], inner[j], outer[j], outer[i],
               dark, dark, tint[j], tint[i])
    # a few branches push past the skirt so the outline is ragged, not a cone
    for i in ragged:
        j = (i + 1) % m
        a = yaw + arc * (i + 0.5) / n
        mid = (outer[i] + outer[j]) * 0.5
        ext = c + Vector(((mid - c).x, (mid - c).y, 0)) * 1.42
        ext.z = c.z - droop * 1.55
        B.tri(outer[i], outer[j], ext, tint[i], tint[j], shade(light, 1.12))


def build_resin(B):
    """The whole point of the plant: a swollen amber blister on the bole with a
    run weeping down off it, plus one detached drip. It wraps the trunk so it
    reads from any yaw the instancer picks."""
    n = 5
    yaw = -math.pi / 2 + 0.2
    # (z, radial offset from the bole surface, colour)
    levels = [(4.86, 0.02, shade(RESIN, 0.72)),
              (4.60, 0.21, RESIN_HI),
              (4.26, 0.11, shade(RESIN, 0.88))]
    rings = []
    for z, off, col in levels:
        c = spine_at(z)
        rt = 0.150 + (0.205 - 0.150) * max(0.0, (4.60 - z) / 2.15) - 0.01
        r = rt + off
        rings.append(([c + Vector((math.cos(yaw + TAU * i / n) * r,
                                   math.sin(yaw + TAU * i / n) * r, 0.0))
                       for i in range(n)], col))
    for k in range(len(rings) - 1):
        a, ca_ = rings[k]
        b, cb_ = rings[k + 1]
        for i in range(n):
            j = (i + 1) % n
            B.quad(a[i], a[j], b[j], b[i], ca_, ca_, cb_, cb_)
    # cap the top of the blister onto the bole
    top = spine_at(4.98)
    for i in range(n):
        j = (i + 1) % n
        B.tri(rings[0][0][i], rings[0][0][j], top,
              rings[0][1], rings[0][1], shade(RESIN, 0.62))
    # the run tapers to a hanging drip
    drip = spine_at(3.88) + Vector((math.cos(yaw) * 0.09, math.sin(yaw) * 0.09, 0))
    for i in range(n):
        j = (i + 1) % n
        B.tri(rings[-1][0][i], rings[-1][0][j], drip,
              rings[-1][1], rings[-1][1], RESIN_HI)
    # one droplet that has already let go
    d = spine_at(3.46) + Vector((math.cos(yaw) * 0.13, math.sin(yaw) * 0.13, 0))
    r = 0.10
    up = d + Vector((0, 0, 0.15))
    dn = d - Vector((0, 0, 0.19))
    ring = [d + Vector((math.cos(yaw + TAU * i / 3) * r,
                        math.sin(yaw + TAU * i / 3) * r, 0)) for i in range(3)]
    for i in range(3):
        j = (i + 1) % 3
        B.tri(ring[i], ring[j], up, RESIN_HI, RESIN_HI, shade(RESIN, 0.80))
        B.tri(ring[j], ring[i], dn, RESIN_HI, RESIN_HI, RESIN_HI)


def build():
    B = Builder()
    build_trunk(B)
    n_trunk = B.count()

    # Tiers overlap: a sapling is a crowded thing, and widely spaced skirts read
    # as stacked umbrellas rather than as a conifer.
    whorl(B, 2.05, 7, 1.52, 0.66, 0.15, 11.0,
          shade(NEEDLE, 0.58), NEEDLE, ragged=(1, 4), lopsided=0.18)
    whorl(B, 2.80, 7, 1.44, 0.60, 1.02, 23.0,
          shade(NEEDLE, 0.62), NEEDLE, ragged=(0, 5), lopsided=0.14)
    whorl(B, 3.52, 6, 1.28, 0.54, 2.05, 37.0,
          shade(NEEDLE, 0.66), NEEDLE, ragged=(3,), lopsided=0.12)
    # part whorl only: the branches missing on the near side are the wound the
    # resin is running out of, and they keep the bead unoccluded
    whorl(B, 4.20, 5, 1.06, 0.46, 0.42, 51.0,
          shade(NEEDLE, 0.70), NEEDLE, arc=math.radians(252), ragged=(2,))
    whorl(B, 4.98, 6, 0.94, 0.40, 2.55, 67.0,
          shade(NEEDLE, 0.74), mixc(NEEDLE, NEEDLE_TIP, 0.45),
          ragged=(1, 4), lopsided=0.10)
    whorl(B, 5.62, 5, 0.74, 0.32, 0.88, 83.0,
          shade(NEEDLE, 0.78), mixc(NEEDLE, NEEDLE_TIP, 0.75), ragged=(3,))
    whorl(B, 6.20, 5, 0.51, 0.25, 2.30, 97.0,
          shade(NEEDLE, 0.82), NEEDLE_TIP, ragged=(1,))
    whorl(B, 6.74, 4, 0.29, 0.16, 0.60, 113.0,
          shade(NEEDLE, 0.88), shade(NEEDLE_TIP, 1.06))
    n_crown = B.count() - n_trunk

    build_resin(B)
    n_resin = B.count() - n_trunk - n_crown
    print('tris  trunk=%d crown=%d resin=%d TOTAL=%d'
          % (n_trunk, n_crown, n_resin, B.count()))
    head = spine_at(4.60) + Vector((math.cos(-math.pi / 2 + 0.2) * 0.24,
                                    math.sin(-math.pi / 2 + 0.2) * 0.24, 0.0))
    return B, head


def fit_height(ob, target):
    zs = [v.co.z for v in ob.data.vertices]
    lo, hi = min(zs), max(zs)
    k = target / (hi - lo)
    for v in ob.data.vertices:
        v.co.z = (v.co.z - lo) * k
        v.co.x *= k
        v.co.y *= k
    return k, lo


def export(ob, head_loc):
    ent = bpy.data.objects.new('head', None)
    ent.empty_display_type = 'PLAIN_AXES'
    ent.empty_display_size = 0.4
    bpy.context.collection.objects.link(ent)
    ent.location = head_loc
    path = OUT + NAME
    kw = dict(filepath=path, export_format='GLB', use_selection=False,
              export_yup=True, export_apply=True, export_cameras=False,
              export_lights=False, export_materials='EXPORT', export_normals=True,
              export_texcoords=False, export_animations=False, export_skins=False,
              export_morph=False)
    for extra in ({'export_all_vertex_colors': False, 'export_vertex_color': 'ACTIVE'},
                  {'export_vertex_color': 'ACTIVE'},
                  {'export_colors': True}):
        try:
            bpy.ops.export_scene.gltf(**dict(kw, **extra))
            break
        except TypeError:
            continue
    print('GLB written:', path, os.path.getsize(path), 'bytes')


def run():
    clear_scene()
    mat = flower_material()
    B, head = build()
    ob = B.to_object('spruce')
    ob.data.materials.append(mat)
    k, lo = fit_height(ob, HEIGHT)
    head = Vector((head.x * k, head.y * k, (head.z - lo) * k))
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    print('spruce  tris=%d scale=%.4f head=%s' %
          (len(ob.data.polygons), k, tuple(round(x, 3) for x in head)))
    print('bbox    x[%.3f %.3f] y[%.3f %.3f] z[%.3f %.3f]'
          % (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)))
    export(ob, head)


run()
