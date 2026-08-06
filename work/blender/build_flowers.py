"""Hollowtree meadow flowers -- revision pass.

Fixes carried by this build:
  * harebell: the main stem no longer runs through the main bell. The stem leans
    away at the top and every bloom hangs off its own peduncle, so nothing green
    crosses the bloom the player hovers over while gathering.
  * harebell: lobe tips pulled back from near-white to the brief's #b9cdf2, with
    #5d78bd carrying the throat.
  * clover: the head is rebuilt as suggested tubular florets around the crown
    instead of a smooth dome with stray tabs, and the stem stops at the head base
    rather than burying triangles inside it.
  * clover: leaves are trifoliate.
  * daisy: geometry untouched (it was the strongest of the three); only the petal
    underside is retinted onto a warm ramp instead of a desaturated grey.

Blender is Z-up; the exporter writes +Y up, which is what the engine expects.
"""
import bpy, bmesh, math, os
from mathutils import Vector

OUT = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/assets/models/'

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


def clamp(x, a=0.0, b=1.0):
    return a if x < a else (b if x > b else x)


# ------------------------------------------------------------------- palettes
DAISY = dict(
    petal=0xfdf3e0, tip=0xffffff, core=0xf2b93c, core_dk=0xffd46b, stem=0x4f7c34,
    # warm ramp for the petal underside: darkened along the petal's own hue
    # instead of desaturated toward grey
    under_lo=0xd6bf94, under_hi=0xf3e7cd,
)
CLOVER = dict(
    petal=0xd8618f, tip=0xf0a2c0, core=0xb44a78, stem=0x4a7530,
    leaf=0x6a9642, leaf_dk=0x47712e, leaf_pale=0xccdcb7,
)
HAREBELL = dict(
    petal=0x7f9fe0, tip=0xb9cdf2, core=0x5d78bd, throat=0x455a90,
    stem=0x51763a, stem_dk=0x3c592a, leaf=0x6d9a4c,
)


# ------------------------------------------------------------------ mesh build
class Builder:
    """collects flat-shaded triangles with a per-corner colour"""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.cols = []          # one colour per face corner

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
        return ob


def bez(p0, p1, p2, t):
    return p0 * (1 - t) ** 2 + p1 * 2 * (1 - t) * t + p2 * t ** 2


def frame(d):
    up = Vector((0, 0, 1))
    if abs(d.normalized().dot(up)) > 0.92:
        up = Vector((1, 0, 0))
    u = d.cross(up).normalized()
    v = d.cross(u).normalized()
    return u, v


def stalk(B, pts, radii, sides, cols, cap_start=True, cap_end=True):
    """tapered tube; `cols` is a colour per point"""
    rings = []
    n = len(pts)
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)])
        if d.length < 1e-6:
            d = Vector((0, 0, 1))
        u, v = frame(d)
        rings.append([p + u * math.cos(2 * math.pi * j / sides) * radii[i]
                      + v * math.sin(2 * math.pi * j / sides) * radii[i]
                      for j in range(sides)])
    for i in range(n - 1):
        for j in range(sides):
            k = (j + 1) % sides
            B.quad(rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j],
                   cols[i], cols[i], cols[i + 1], cols[i + 1])
    if cap_start and sides >= 3:
        for j in range(1, sides - 1):
            B.tri(rings[0][0], rings[0][j + 1], rings[0][j], cols[0], cols[0], cols[0])
    if cap_end and sides >= 3:
        for j in range(1, sides - 1):
            B.tri(rings[-1][0], rings[-1][j], rings[-1][j + 1], cols[-1], cols[-1], cols[-1])
    return rings


def curve_pts(p0, p1, p2, n):
    return [bez(Vector(p0), Vector(p1), Vector(p2), i / (n - 1)) for i in range(n)]


# ==================================================================== HAREBELL
HB_STEM = (Vector((0, 0, 0)), Vector((0.30, -0.16, 3.40)), Vector((-0.32, 0.10, 6.30)))


def hb_stem_at(z):
    """walk the stem curve for the point nearest a given height"""
    best, bd = None, 1e9
    for i in range(101):
        p = bez(*HB_STEM, i / 100.0)
        if abs(p.z - z) < bd:
            bd, best = abs(p.z - z), p
    return best


def bell(B, cen, mouth_r, depth, sides, pal, tip_k=1.0, bands=3):
    """a nodding campanula bell: narrow throat at the top, flared lobed mouth.

    Built downward from the peduncle so the flare opens toward the ground."""
    top = Vector(cen) + Vector((0, 0, depth * 0.55))
    throat = lin(pal['throat'])
    core = lin(pal['core'])
    body = lin(pal['petal'])
    tipc = mixc(body, lin(pal['tip']), clamp(tip_k))
    rings = []
    levels = ([(0.00, 0.10), (0.42, 0.34), (0.78, 0.66), (1.00, 1.00)] if bands >= 3
              else [(0.00, 0.12), (0.60, 0.50), (1.00, 1.00)])
    for (u, rr) in levels:
        z = top.z - depth * u
        r = mouth_r * rr
        rings.append([Vector((top.x + math.cos(2 * math.pi * j / sides) * r,
                              top.y + math.sin(2 * math.pi * j / sides) * r, z))
                      for j in range(sides)])
    # every other mouth vertex pulled down and out -> five/six lobes
    for j in range(sides):
        if j % 2 == 0:
            p = rings[-1][j]
            c = Vector((top.x, top.y, p.z))
            rings[-1][j] = c + (p - c) * 1.18 + Vector((0, 0, -depth * 0.14))
    tones = ([core, mixc(core, body, 0.55), body, tipc] if bands >= 3
             else [core, mixc(core, body, 0.62), tipc])
    for i in range(len(rings) - 1):
        for j in range(sides):
            k = (j + 1) % sides
            B.quad(rings[i][j], rings[i + 1][j], rings[i + 1][k], rings[i][k],
                   tones[i], tones[i + 1], tones[i + 1], tones[i])
    # close the top of the bell where the peduncle enters
    for j in range(1, sides - 1):
        B.tri(rings[0][0], rings[0][j], rings[0][j + 1], throat, throat, throat)
    return top


def bud(B, cen, r, h, pal):
    """an unopened bell: a small spindle"""
    tip = Vector(cen) + Vector((0, 0, h * 0.5))
    base = Vector(cen) - Vector((0, 0, h * 0.5))
    c_lo = lin(pal['core'])
    c_hi = mixc(lin(pal['petal']), lin(pal['tip']), 0.25)
    ring = [Vector((cen[0] + math.cos(2 * math.pi * j / 4) * r,
                    cen[1] + math.sin(2 * math.pi * j / 4) * r, cen[2])) for j in range(4)]
    for j in range(4):
        k = (j + 1) % 4
        B.tri(ring[j], ring[k], tip, c_hi, c_hi, c_hi)
        B.tri(ring[k], ring[j], base, c_lo, c_lo, c_lo)


def blade(B, root, tip, side, w0, w1, c_base, c_tip):
    """a slim leaf blade as two triangles"""
    root, tip, side = Vector(root), Vector(tip), Vector(side).normalized()
    a = root - side * w0
    b = root + side * w0
    c = tip + side * w1
    d = tip - side * w1
    B.quad(a, b, c, d, c_base, c_base, c_tip, c_tip)


def build_harebell():
    B = Builder()
    pal = HAREBELL
    c_stem_lo = lin(pal['stem_dk'])
    c_stem = lin(pal['stem'])
    pts = curve_pts(*HB_STEM, 5)
    rad = [0.085, 0.070, 0.056, 0.044, 0.030]
    cols = [c_stem_lo, mixc(c_stem_lo, c_stem, 0.6), c_stem, c_stem, c_stem]
    stalk(B, pts, rad, 3, cols)

    # blooms: three open bells and two buds, all hung on their own peduncle and
    # all set clear of the stem, which leans the other way above 4.5
    blooms = [
        dict(cen=(0.95, 0.34, 5.16), r=0.60, depth=0.90, sides=6, tip=1.00, att=5.92,
             bands=3),
        dict(cen=(-0.62, -0.63, 4.12), r=0.46, depth=0.72, sides=5, tip=0.72, att=4.72,
             bands=2),
    ]
    head_top = None
    for i, bl in enumerate(blooms):
        top = bell(B, bl['cen'], bl['r'], bl['depth'], bl['sides'], pal, bl['tip'],
                   bands=bl['bands'])
        att = hb_stem_at(bl['att'])
        stalk(B, [att, top], [0.040, 0.028], 3, [c_stem, c_stem],
              cap_start=False, cap_end=False)
        if i == 0:
            head_top = Vector(bl['cen'])
    for cen, att in ((Vector((0.34, -0.52, 5.70)), 5.98),
                     (Vector((-0.70, 0.44, 4.90)), 5.28),
                     (Vector((0.52, 0.76, 3.42)), 3.94)):
        bud(B, cen, 0.15, 0.44, pal)
        a = hb_stem_at(att)
        stalk(B, [a, cen], [0.034, 0.026], 3, [c_stem, c_stem],
              cap_start=False, cap_end=False)

    # two linear stem leaves low down
    c_leaf = lin(pal['leaf'])
    blade(B, (0.14, -0.06, 0.95), (0.86, -0.50, 1.85), (0.5, 0.86, 0), 0.09, 0.02,
          lin(pal['stem_dk']), c_leaf)
    blade(B, (0.22, -0.11, 1.70), (-0.44, 0.42, 2.62), (0.72, 0.69, 0), 0.08, 0.02,
          lin(pal['stem_dk']), c_leaf)
    return B, head_top


# ====================================================================== CLOVER
CL_STEM = (Vector((0, 0, 0)), Vector((0.22, 0.06, 1.70)), Vector((0.24, 0.04, 3.02)))


def cl_stem_at(z):
    best, bd = None, 1e9
    for i in range(101):
        p = bez(*CL_STEM, i / 100.0)
        if abs(p.z - z) < bd:
            bd, best = abs(p.z - z), p
    return best


def floret(B, crown, direction, length, r0, r1, pal, k):
    """one tubular floret of a clover head: a short corolla tube with a flared,
    slightly split mouth. Three-sided so nine of them still fit the budget."""
    d = Vector(direction).normalized()
    base = Vector(crown) + d * 0.10
    tip = Vector(crown) + d * length
    c_lo = lin(pal['core'])
    c_mid = lin(pal['petal'])
    c_hi = mixc(c_mid, lin(pal['tip']), 0.55 + 0.45 * k)
    u, v = frame(d)
    ring0 = [base + (u * math.cos(2 * math.pi * j / 3) + v * math.sin(2 * math.pi * j / 3)) * r0
             for j in range(3)]
    ring1 = [tip + (u * math.cos(2 * math.pi * j / 3 + 0.5)
                    + v * math.sin(2 * math.pi * j / 3 + 0.5)) * r1 for j in range(3)]
    for j in range(3):
        k2 = (j + 1) % 3
        B.quad(ring0[j], ring0[k2], ring1[k2], ring1[j],
               mixc(c_lo, c_mid, 0.35), mixc(c_lo, c_mid, 0.35), c_hi, c_hi)
    B.tri(ring1[0], ring1[1], ring1[2], c_hi, c_hi, c_hi)
    B.tri(ring0[2], ring0[1], ring0[0], c_lo, c_lo, c_lo)


def trifoliate(B, node, bearing, size, pal):
    """petiole plus three leaflets -- the second-strongest clover identifier"""
    node = Vector(node)
    d = Vector((math.cos(bearing), math.sin(bearing), 0.28)).normalized()
    hub = node + d * size * 0.9
    c_stem = lin(pal['stem'])
    stalk(B, [node, hub], [0.055, 0.040], 3, [c_stem, c_stem],
          cap_start=False, cap_end=False)
    c_leaf = lin(pal['leaf'])
    c_dk = lin(pal['leaf_dk'])
    c_pale = lin(pal['leaf_pale'])
    for m in range(3):
        a = bearing + (m - 1) * 1.15
        ld = Vector((math.cos(a), math.sin(a), 0.10)).normalized()
        side = Vector((-ld.y, ld.x, 0)).normalized()
        p0 = hub + ld * size * 0.16
        p1 = hub + ld * size * 0.95
        w = size * 0.30
        # obovate leaflet: narrow at the petiole, broad and blunt at the tip
        B.tri(p0, p0 + side * w * 0.45 + ld * size * 0.30,
              p1 + side * w * 0.30, c_pale, c_leaf, c_dk)
        B.tri(p0, p1 + side * w * 0.30, p1, c_pale, c_dk, c_leaf)
        B.tri(p0, p1, p1 - side * w * 0.30, c_pale, c_leaf, c_dk)
        B.tri(p0, p1 - side * w * 0.30,
              p0 - side * w * 0.45 + ld * size * 0.30, c_pale, c_dk, c_leaf)


def build_clover():
    B = Builder()
    pal = CLOVER
    c_stem_lo = lin(0x375822)
    c_stem = lin(pal['stem'])
    pts = curve_pts(*CL_STEM, 5)
    rad = [0.105, 0.092, 0.082, 0.074, 0.068]
    cols = [c_stem_lo, mixc(c_stem_lo, c_stem, 0.6), c_stem, c_stem, c_stem]
    stalk(B, pts, rad, 3, cols)          # stops at the head base: nothing buried

    crown = Vector((0.24, 0.04, 3.36))
    # nine florets around the crown, two tiers, so the head reads as a cluster of
    # tubes rather than a faceted pom
    n_lo, n_hi = 6, 3
    for i in range(n_lo):
        a = 2 * math.pi * i / n_lo
        d = Vector((math.cos(a) * 0.95, math.sin(a) * 0.95, -0.18))
        floret(B, crown, d, 0.50, 0.115, 0.145, pal, 0.35 + 0.2 * (i % 2))
    for i in range(n_hi):
        a = 2 * math.pi * i / n_hi + 0.7
        d = Vector((math.cos(a) * 0.62, math.sin(a) * 0.62, 0.78))
        floret(B, crown, d, 0.48, 0.105, 0.130, pal, 0.75)
    # small calyx dome closing the underside of the crown
    c_calyx = lin(pal['leaf_dk'])
    ring = [crown + Vector((math.cos(2 * math.pi * j / 6) * 0.19,
                            math.sin(2 * math.pi * j / 6) * 0.19, -0.14)) for j in range(6)]
    bot = crown + Vector((0, 0, -0.32))
    for j in range(6):
        B.tri(ring[j], ring[(j + 1) % 6], bot, c_calyx, c_calyx, c_calyx)

    trifoliate(B, cl_stem_at(1.42), 0.55, 0.95, pal)
    trifoliate(B, cl_stem_at(2.15), 3.60, 0.80, pal)
    return B, crown


# ---------------------------------------------------------------- shared setup
def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects,
                  bpy.data.lights, bpy.data.cameras, bpy.data.images):
        for b in list(block):
            if b.users == 0:
                block.remove(b)


def flower_material():
    m = bpy.data.materials.get('ht_flower')
    if m is None:
        m = bpy.data.materials.new('ht_flower')
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (1.0, 1.0, 1.0, 1.0)
        if 'Roughness' in bsdf.inputs:
            bsdf.inputs['Roughness'].default_value = 0.82
        if 'Metallic' in bsdf.inputs:
            bsdf.inputs['Metallic'].default_value = 0.0
    m.use_backface_culling = False
    return m


def fit_height(ob, target):
    zs = [v.co.z for v in ob.data.vertices]
    lo, hi = min(zs), max(zs)
    k = target / (hi - lo)
    for v in ob.data.vertices:
        v.co.z = (v.co.z - lo) * k
        v.co.x *= k
        v.co.y *= k
    return k, lo


def export(name, ob, head_loc):
    ent = bpy.data.objects.new('head', None)
    ent.empty_display_type = 'PLAIN_AXES'
    ent.empty_display_size = 0.4
    bpy.context.collection.objects.link(ent)
    ent.location = head_loc
    path = OUT + 'flower-%s.glb' % name
    kw = dict(filepath=path, export_format='GLB', use_selection=False,
              export_yup=True, export_apply=True, export_cameras=False,
              export_lights=False, export_materials='EXPORT', export_normals=True,
              export_texcoords=False, export_animations=False, export_skins=False,
              export_morph=False)
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('GLB written:', path, os.path.getsize(path), 'bytes')


def make(name, builder_fn, height):
    clear_scene()
    mat = flower_material()
    B, head = builder_fn()
    ob = B.to_object(name)
    ob.data.materials.append(mat)
    k, lo = fit_height(ob, height)
    head = Vector(head)
    head = Vector((head.x * k, head.y * k, (head.z - lo) * k))
    print('%-9s tris=%d  scale=%.4f  head=%s'
          % (name, len(ob.data.polygons), k, tuple(round(x, 3) for x in head)))
    export(name, ob, head)
    return ob


# ------------------------------------------------------------------ daisy retint
def retint_daisy():
    """import the shipped daisy, move the petal underside off grey and onto a warm
    ramp, and write it back. Geometry, node names and topology are untouched."""
    clear_scene()
    src = OUT + 'flower-daisy.glb'
    bpy.ops.import_scene.gltf(filepath=src)
    ob = next(o for o in bpy.data.objects if o.type == 'MESH')
    ob.name = 'daisy'
    ob.data.name = 'daisy'
    hd = next((o for o in bpy.data.objects if o.type == 'EMPTY' and o.name.lower().startswith('head')), None)
    head_y = hd.matrix_world.translation.z if hd else 4.05
    # bake the import's node transform into the mesh so the export is at identity
    for o in bpy.data.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    ca = ob.data.color_attributes.get('Col') or ob.data.color_attributes[0]
    if ca.domain != 'CORNER' or ca.data_type != 'FLOAT_COLOR':
        ob.data.color_attributes.active_color = ca
        ca = ob.data.color_attributes.new(name='ColF', type='FLOAT_COLOR', domain='CORNER')
        old = ob.data.color_attributes[0]
        for i in range(len(ca.data)):
            ca.data[i].color = old.data[i].color
    target = lin(0xc7bfb0)
    lo = lin(DAISY['under_lo'])
    hi = lin(DAISY['under_hi'])
    zs = [v.co.z for v in ob.data.vertices]
    n = 0
    for p in ob.data.polygons:
        p.use_smooth = False
        for li in p.loop_indices:
            c = ca.data[li].color
            if all(abs(c[i] - target[i]) < 0.012 for i in range(3)):
                z = ob.data.vertices[ob.data.loops[li].vertex_index].co.z
                t = clamp((z - 2.5) / 1.6)
                r, g, b = mixc(lo, hi, t)
                ca.data[li].color = (r, g, b, 1.0)
                n += 1
    ob.data.color_attributes.active_color = ca
    print('daisy    retinted %d underside corners; head y=%.3f' % (n, head_y))
    for o in list(bpy.data.objects):
        if o.type == 'EMPTY':
            bpy.data.objects.remove(o, do_unlink=True)
    print('daisy    tris=%d' % len(ob.data.polygons))
    export('daisy', ob, Vector((0.0, 0.0, head_y)))


def run():
    retint_daisy()
    make('clover', build_clover, 3.9)
    make('harebell', build_harebell, 6.3)
