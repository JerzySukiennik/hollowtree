"""Hollowtree meadow flowers: rebuild harebell + clover, recolour daisy.

Run headless:
  Blender --background --factory-startup --python work/blender/ht_flowers.py

Contract kept for every asset:
  * single mesh object named after the species, one material `ht_flower`
  * an EMPTY named `head` parented to the mesh, sitting at the gather bloom
  * flat shading, no textures / cameras / lights, transforms applied
  * exported +Y up with COLOR_0 as float VEC3 (Blender FLOAT_COLOR, CORNER)
  * authored heights 4.6 (daisy) / 3.9 (clover) / 6.3 (harebell), base at y=0
"""
import bpy, bmesh, math, os
from mathutils import Vector

ROOT = '/Users/jurek/Downloads/Claude/Projects/Hollowtree/'
OUT = ROOT + 'assets/models/'

# ------------------------------------------------------------------ colour
def hexc(h):
    return ((h >> 16 & 255) / 255.0, (h >> 8 & 255) / 255.0, (h & 255) / 255.0)


def s2l(c):
    out = []
    for v in c:
        v = max(0.0, min(1.0, v))
        out.append(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def l2s(c):
    out = []
    for v in c:
        v = max(0.0, min(1.0, v))
        out.append(v * 12.92 if v <= 0.0031308 else 1.055 * (v ** (1 / 2.4)) - 0.055)
    return tuple(out)


def hexs(c):
    return '#%02x%02x%02x' % tuple(int(round(v * 255)) for v in l2s(c))


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def shade(c, k):
    return tuple(min(1.0, max(0.0, c[i] * k)) for i in range(3))


# ------------------------------------------------------------------ builder
class B:
    def __init__(self):
        self.v = []
        self.f = []       # list of vertex-index tuples
        self.c = []       # list of per-corner sRGB colours

    def vert(self, p):
        self.v.append(tuple(p))
        return len(self.v) - 1

    def face(self, idx, cols):
        idx = list(idx)
        if len(cols) == 1:
            cols = list(cols) * len(idx)
        assert len(cols) == len(idx), (len(cols), len(idx))
        self.f.append(tuple(idx))
        self.c.append([tuple(x) for x in cols])

    def tri_estimate(self):
        return sum(max(0, len(f) - 2) for f in self.f)


def frame(t):
    t = Vector(t).normalized()
    up = Vector((0, 0, 1))
    if abs(t.dot(up)) > 0.94:
        up = Vector((1, 0, 0))
    n1 = t.cross(up).normalized()
    n2 = t.cross(n1).normalized()
    return n1, n2


def ring_pts(center, tangent, radius, sides, roll=0.0):
    n1, n2 = frame(tangent)
    c = Vector(center)
    return [c + (n1 * math.cos(roll + 2 * math.pi * i / sides)
                 + n2 * math.sin(roll + 2 * math.pi * i / sides)) * radius
            for i in range(sides)]


def tube(b, pts, radii, cols, sides=3, roll=0.0):
    """Polygonal tube through `pts`; returns the list of index-rings."""
    rings = []
    for i, p in enumerate(pts):
        if i == 0:
            tg = Vector(pts[1]) - Vector(pts[0])
        elif i == len(pts) - 1:
            tg = Vector(pts[-1]) - Vector(pts[-2])
        else:
            tg = Vector(pts[i + 1]) - Vector(pts[i - 1])
        rings.append([b.vert(q) for q in ring_pts(p, tg, radii[i], sides, roll)])
    for i in range(len(pts) - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            b.face([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]],
                   [cols[i], cols[i], cols[i + 1], cols[i + 1]])
    return rings


def sample(pts, t):
    """Piecewise-linear sample of a polyline at parameter t in [0,1]."""
    n = len(pts) - 1
    x = max(0.0, min(0.9999, t)) * n
    i = int(x)
    f = x - i
    a, bb = Vector(pts[i]), Vector(pts[i + 1])
    return a + (bb - a) * f


# ------------------------------------------------------------------ mesh out
def build_object(name, b, head_pos, target_h):
    me = bpy.data.meshes.new(name)
    me.from_pydata(b.v, [], list(b.f))
    me.update()
    me.validate(verbose=False)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)

    # bind colours by sorted vertex set (validate/from_pydata may reorder polys)
    lut = {}
    for f, cols in zip(b.f, b.c):
        lut[tuple(sorted(f))] = dict(zip(f, cols))
    att = me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='CORNER')
    missing = 0
    for poly in me.polygons:
        key = tuple(sorted(poly.vertices))
        m = lut.get(key)
        if m is None:
            missing += 1
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            srgb = m.get(vi, (1, 1, 1)) if m else (1, 1, 1)
            lin = s2l(srgb)
            att.data[li].color = (lin[0], lin[1], lin[2], 1.0)
    if missing:
        print('  [warn] %s: %d polys without colour binding' % (name, missing))

    # outward normals, flat shading
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = False
    me.update()

    # uniform normalise: height -> target_h, base at z = 0, centred in x/y footprint
    zs = [v.co.z for v in me.vertices]
    k = target_h / (max(zs) - min(zs))
    z0 = min(zs)
    for v in me.vertices:
        v.co = ((v.co.x) * k, (v.co.y) * k, (v.co.z - z0) * k)
    me.update()

    hp = Vector(((head_pos[0]) * k, (head_pos[1]) * k, (head_pos[2] - z0) * k))
    emp = bpy.data.objects.new('head', None)
    emp.empty_display_size = 0.3
    bpy.context.collection.objects.link(emp)
    emp.location = hp
    emp.parent = ob

    me.calc_loop_triangles()
    print('  %s: %d tris, %d verts, head=(%.3f, %.3f, %.3f)'
          % (name, len(me.loop_triangles), len(me.vertices), hp.x, hp.y, hp.z))
    return ob


def flower_material():
    mat = bpy.data.materials.new('ht_flower')
    mat.use_nodes = True
    mat.use_backface_culling = False          # doubleSided, as the daisy already is
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    col = nt.nodes.new('ShaderNodeVertexColor')
    col.layer_name = 'Col'
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.82
    try:
        bsdf.inputs['Specular IOR Level'].default_value = 0.36
    except KeyError:
        pass
    nt.links.new(col.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


def export(path, name):
    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            ob.data.color_attributes.active_color_index = 0
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=False,
        export_apply=True, export_yup=True, export_cameras=False,
        export_lights=False, export_normals=True, export_vertex_color='ACTIVE',
        export_attributes=False, export_texcoords=False, export_materials='EXPORT')
    print('  wrote', path, '(%.1f kB)' % (os.path.getsize(path) / 1024.0))


def fresh():
    """Empty the scene WITHOUT read_homefile -- that op makes Blender re-run the
    --python script from the top, which silently doubles every build pass."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for blk in (bpy.data.meshes, bpy.data.materials):
        for d in list(blk):
            blk.remove(d)


# ================================================================= HAREBELL
HB = {
    'stem':  hexc(0x51763a),
    'stemd': hexc(0x3c592a),
    'steml': hexc(0x6d9a4c),
    'core':  hexc(0x5d78bd),     # missing mid-tone, now the bell throat
    'deep':  hexc(0x455a90),
    'petal': hexc(0x7f9fe0),
    'tip':   hexc(0xb9cdf2),     # ceiling: nothing brighter than this
    'bud':   hexc(0x6f8fd4),
}


def bell(b, centre, top_z, r_belly, r_mouth, r_tip, z_belly, z_mouth, z_tip,
         lobes=5, roll=0.0, pal=HB, scale_tone=1.0):
    """A nodding campanula: hangs from `top_z` down, mouth flaring at the bottom."""
    cx, cy = centre
    apex = b.vert((cx, cy, top_z))
    neck = [b.vert((cx + math.cos(roll + 2 * math.pi * i / lobes) * r_belly * 0.20,
                    cy + math.sin(roll + 2 * math.pi * i / lobes) * r_belly * 0.20,
                    top_z - (top_z - z_belly) * 0.28)) for i in range(lobes)]
    belly = [b.vert((cx + math.cos(roll + 2 * math.pi * i / lobes) * r_belly,
                     cy + math.sin(roll + 2 * math.pi * i / lobes) * r_belly,
                     z_belly)) for i in range(lobes)]
    mouth = [b.vert((cx + math.cos(roll + 2 * math.pi * i / lobes) * r_mouth,
                     cy + math.sin(roll + 2 * math.pi * i / lobes) * r_mouth,
                     z_mouth)) for i in range(lobes)]
    tips = [b.vert((cx + math.cos(roll + 2 * math.pi * (i + 0.5) / lobes) * r_tip,
                    cy + math.sin(roll + 2 * math.pi * (i + 0.5) / lobes) * r_tip,
                    z_tip)) for i in range(lobes)]
    cdeep = shade(pal['deep'], scale_tone)
    ccore = shade(pal['core'], scale_tone)
    cpet = shade(pal['petal'], scale_tone)
    ctip = shade(pal['tip'], scale_tone)
    for i in range(lobes):
        j = (i + 1) % lobes
        b.face([apex, neck[i], neck[j]], [cdeep, cdeep, cdeep])
        b.face([neck[i], belly[i], belly[j], neck[j]], [cdeep, ccore, ccore, cdeep])
        b.face([belly[i], mouth[i], mouth[j], belly[j]], [ccore, cpet, cpet, ccore])
        # the flaring lobe between two mouth verts
        b.face([mouth[i], tips[i], mouth[j]], [cpet, ctip, cpet])
    return mouth


def blade(b, base, tip, width, c0, c1, cmid=None, segs=2):
    """Grass-like leaf: `segs` cross-sections tapering to a point."""
    base, tip = Vector(base), Vector(tip)
    axis = tip - base
    side = axis.cross(Vector((0, 0, 1)))
    if side.length < 1e-5:
        side = Vector((1, 0, 0))
    side.normalize()
    prev = None
    for s in range(segs):
        t = s / float(segs)
        w = width * (1.0 - t) ** 0.7
        p = base + axis * t + Vector((0, 0, 1)) * (0.10 * axis.length * math.sin(math.pi * t))
        pair = (b.vert(p - side * w), b.vert(p + side * w))
        c = mix(c0, c1, t)
        if prev is not None:
            b.face([prev[0], prev[1], pair[1], pair[0]],
                   [pc, pc, c, c])
        prev, pc = pair, c
    vt = b.vert(tip)
    b.face([prev[0], prev[1], vt], [pc, pc, cmid or c1])


def build_harebell():
    fresh()
    b = B()
    st, sd, sl = HB['stem'], HB['stemd'], HB['steml']

    # --- main stem, kept hard over on -x so it never crosses the main bell
    spath = [(0.00, 0.00, 0.00), (0.04, 0.02, 1.55), (0.00, -0.04, 3.10),
             (-0.10, 0.00, 4.45), (-0.20, 0.03, 5.55)]
    srad = [0.078, 0.066, 0.056, 0.046, 0.034]
    scol = [sd, st, st, sl, sl]
    tube(b, spath, srad, scol)

    # --- arching peduncle -> main bell, carried well clear in +x
    # every pedicel tapers to a near-point that SITS ON the bloom's apex instead
    # of being driven into it -- that is what keeps the stem out of the bell.
    p1 = [(-0.20, 0.03, 5.55), (0.25, 0.14, 5.98), (0.85, 0.26, 5.94), (1.10, 0.32, 5.77)]
    tube(b, p1, [0.034, 0.030, 0.026, 0.006], [sl, sl, st, st])

    # --- main bell hangs BELOW its pedicel; nothing of the stem is above it
    bell(b, (1.10, 0.32), 5.74, r_belly=0.50, r_mouth=0.58, r_tip=0.88,
         z_belly=5.06, z_mouth=4.70, z_tip=4.50, roll=0.35)

    # --- second, smaller bell on the far side
    p2 = [(-0.02, -0.02, 4.05), (-0.50, -0.26, 4.34), (-0.82, -0.36, 4.21)]
    tube(b, p2, [0.030, 0.026, 0.006], [sl, st, st])
    bell(b, (-0.82, -0.36), 4.18, r_belly=0.30, r_mouth=0.35, r_tip=0.54,
         z_belly=3.76, z_mouth=3.52, z_tip=3.38, roll=1.1, scale_tone=0.94)

    # --- an unopened bud lower down
    p3 = [(0.02, 0.00, 2.95), (0.42, -0.30, 3.21)]
    tube(b, p3, [0.028, 0.006], [st, st])
    cx, cy, tz = 0.42, -0.30, 3.18
    top = b.vert((cx, cy, tz))
    r = [b.vert((cx + math.cos(2 * math.pi * i / 5) * 0.135,
                 cy + math.sin(2 * math.pi * i / 5) * 0.135, tz - 0.16)) for i in range(5)]
    bot = b.vert((cx, cy, tz - 0.50))
    for i in range(5):
        j = (i + 1) % 5
        b.face([top, r[i], r[j]], [HB['deep'], HB['bud'], HB['bud']])
        b.face([r[i], bot, r[j]], [HB['bud'], HB['tip'], HB['bud']])

    # --- basal grass blades + two stem leaves
    for ang, ln in ((0.4, 1.55), (2.3, 1.30), (3.9, 1.70), (5.4, 1.15)):
        blade(b, (math.cos(ang) * 0.09, math.sin(ang) * 0.09, 0.05),
              (math.cos(ang) * 0.62 * ln, math.sin(ang) * 0.62 * ln, 0.15 + ln),
              0.085, sd, sl, cmid=HB['steml'])
    blade(b, (0.02, -0.02, 2.05), (0.62, -0.55, 2.75), 0.055, st, sl, segs=1)
    blade(b, (-0.04, 0.01, 3.45), (-0.58, 0.45, 4.05), 0.050, st, sl, segs=1)

    mat = flower_material()
    ob = build_object('harebell', b, (1.10, 0.32, 5.05), 6.3)
    ob.data.materials.append(mat)
    export(OUT + 'flower-harebell.glb', 'harebell')


# =================================================================== CLOVER
CL = {
    'stem':  hexc(0x4a7530),
    'stemd': hexc(0x375822),
    'steml': hexc(0x6a9642),
    'pale':  hexc(0xccdcb7),
    'leafd': hexc(0x47712e),
    'core':  hexc(0xb44a78),     # missing mid-tone, now the floret throats
    'petal': hexc(0xd8618f),
    'tip':   hexc(0xf0a2c0),
}


def floret(b, centre, direction, length, r0, r1, cap=True, pal=CL, tone=1.0):
    """One tubular floret: a 3-sided corolla tube flaring at its mouth."""
    c = Vector(centre)
    d = Vector(direction).normalized()
    n1, n2 = frame(d)
    base = [b.vert(c + (n1 * math.cos(a) + n2 * math.sin(a)) * r0)
            for a in (0.0, 2.094, 4.189)]
    apex = c + d * length
    ccore = shade(pal['core'], tone)
    cpet = shade(pal['petal'], tone)
    ctip = shade(pal['tip'], tone)
    if cap:
        top = [b.vert(apex + (n1 * math.cos(a) + n2 * math.sin(a)) * r1)
               for a in (0.0, 2.094, 4.189)]
        for i in range(3):
            j = (i + 1) % 3
            b.face([base[i], base[j], top[j], top[i]], [ccore, ccore, ctip, ctip])
        b.face(top, [cpet, cpet, cpet])
    else:
        tv = b.vert(apex)
        for i in range(3):
            j = (i + 1) % 3
            b.face([base[i], base[j], tv], [ccore, ccore, ctip])


def clover_head(b, centre, radius, rows, tone=1.0, core_sides=6):
    """A globular head: closed core + suggested tubular florets around the crown."""
    cx, cy, cz = centre
    ccore = shade(CL['core'], tone)
    cpet = shade(CL['petal'], tone)
    rr = radius * 0.62
    ring = [b.vert((cx + math.cos(2 * math.pi * i / core_sides) * rr,
                    cy + math.sin(2 * math.pi * i / core_sides) * rr, cz))
            for i in range(core_sides)]
    top = b.vert((cx, cy, cz + radius * 0.72))
    bot = b.vert((cx, cy, cz - radius * 0.40))
    for i in range(core_sides):
        j = (i + 1) % core_sides
        b.face([ring[i], ring[j], top], [ccore, ccore, cpet])
        b.face([ring[i], bot, ring[j]], [ccore, ccore, ccore])
    n = 0
    for count, elev, phase, cap in rows:
        for i in range(count):
            a = phase + 2 * math.pi * i / count
            e = elev
            d = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)))
            att = Vector((cx, cy, cz)) + d * (radius * 0.52)
            floret(b, att, d, radius * 0.66, radius * 0.13, radius * 0.19,
                   cap=cap, tone=tone)
            n += 1
    return n


def leaflet(b, base, out_dir, length, width, tone=1.0):
    """One obcordate clover leaflet with the pale chevron."""
    base = Vector(base)
    d = Vector(out_dir).normalized()
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 1e-5:
        side = Vector((1, 0, 0))
    side.normalize()
    lift = Vector((0, 0, 1)) * (length * 0.13)
    v_b = b.vert(base)
    v_l = b.vert(base + d * (length * 0.55) - side * width + lift)
    v_r = b.vert(base + d * (length * 0.55) + side * width + lift)
    v_tl = b.vert(base + d * length - side * (width * 0.45) + lift * 0.5)
    v_tr = b.vert(base + d * length + side * (width * 0.45) + lift * 0.5)
    cd = shade(CL['leafd'], tone)
    cl = shade(CL['steml'], tone)
    cp = shade(CL['pale'], tone)
    b.face([v_b, v_l, v_r], [cd, cp, cp])
    b.face([v_l, v_tl, v_tr], [cp, cl, cl])
    b.face([v_l, v_tr, v_r], [cp, cl, cp])


def trifoliate(b, stem_pt, out_dir, reach, size, tone=1.0):
    """Petiole out from the stem, then three leaflets at 120 degrees."""
    d = Vector(out_dir).normalized()
    j = Vector(stem_pt) + d * reach
    side = d.cross(Vector((0, 0, 1))).normalized()
    p0 = Vector(stem_pt)
    b.face([b.vert(p0 - side * 0.035), b.vert(p0 + side * 0.035),
            b.vert(j + side * 0.022), b.vert(j - side * 0.022)],
           [shade(CL['stem'], tone)] * 4)
    for k in range(3):
        a = k * 2.094 + 0.5
        dd = Vector((math.cos(a), math.sin(a), 0.30)).normalized()
        leaflet(b, j, dd, size, size * 0.40, tone=tone)


def build_clover():
    fresh()
    b = B()
    st, sd, sl = CL['stem'], CL['stemd'], CL['steml']

    # --- main stem: stops at the crown, no geometry buried inside the head
    spath = [(0.00, 0.00, 0.00), (0.06, 0.02, 1.10), (0.11, 0.00, 2.15), (0.16, 0.03, 3.02)]
    tube(b, spath, [0.072, 0.066, 0.058, 0.050], [sd, st, st, sl])

    # --- main head: 7 tubular florets on two rows around a closed core
    n1 = clover_head(b, (0.16, 0.03, 3.34), 0.62,
                     rows=[(4, 0.30, 0.0, True), (3, 1.02, 0.9, True)])

    # --- side head, younger and smaller
    p2 = [(0.11, 0.00, 2.15), (-0.33, 0.18, 2.52), (-0.50, 0.25, 2.76)]
    tube(b, p2, [0.046, 0.040, 0.034], [st, st, sl])
    n2 = clover_head(b, (-0.50, 0.25, 2.94), 0.34,
                     rows=[(5, 0.55, 0.4, False)], tone=0.96, core_sides=6)

    # --- two trifoliate leaves
    trifoliate(b, (0.07, 0.02, 1.28), (0.85, -0.52, 0.10), 0.42, 0.62)
    trifoliate(b, (0.12, 0.01, 1.92), (-0.72, -0.62, 0.08), 0.38, 0.54, tone=0.94)

    print('  clover florets: %d main + %d side' % (n1, n2))
    mat = flower_material()
    ob = build_object('clover', b, (0.16, 0.03, 3.42), 3.9)
    ob.data.materials.append(mat)
    export(OUT + 'flower-clover.glb', 'clover')


# ==================================================================== DAISY
# geometry untouched; only the grey petal underside is put on a warm ramp
UNDER_SRC = (0xc7, 0xbf, 0xb0)
UNDER_LO = hexc(0xd9c8a4)     # warm tan at the shaded base  (sat 0.245)
UNDER_HI = hexc(0xf7ecd6)     # cream toward #fdf3e0 at the lit tip (sat 0.134)


def build_daisy():
    fresh()
    bpy.ops.import_scene.gltf(filepath=OUT + 'flower-daisy.glb')
    ob = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    me = ob.data
    src = me.color_attributes[0]

    def as8(c):
        s = l2s(c[:3])
        return tuple(int(round(v * 255)) for v in s)

    # which vertices carry the grey underside
    hits = set()
    for li, d in enumerate(src.data):
        if as8(d.color) == UNDER_SRC:
            hits.add(me.loops[li].vertex_index)
    if not hits:
        print('  daisy: underside already on the warm ramp, nothing to recolour')
        return
    zs = [me.vertices[v].co.z for v in hits]
    z0, z1 = min(zs), max(zs)
    print('  daisy: %d underside verts, z %.3f..%.3f' % (len(hits), z0, z1))

    vals = []
    for li, d in enumerate(src.data):
        vi = me.loops[li].vertex_index
        if as8(d.color) == UNDER_SRC:
            t = (me.vertices[vi].co.z - z0) / max(1e-6, z1 - z0)
            vals.append(s2l(mix(UNDER_LO, UNDER_HI, t)) + (1.0,))
        else:
            vals.append(tuple(d.color))

    me.color_attributes.remove(src)
    att = me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='CORNER')
    for li, v in enumerate(vals):
        att.data[li].color = v
    me.color_attributes.active_color_index = 0

    # rebuild the material to the shared spec (double-sided, vertex colour driven)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)
    me.materials.clear()
    me.materials.append(flower_material())
    for poly in me.polygons:
        poly.use_smooth = False
    me.calc_loop_triangles()
    zs = [v.co.z for v in me.vertices]
    print('  daisy: %d tris, height %.4f' % (len(me.loop_triangles), max(zs) - min(zs)))
    export(OUT + 'flower-daisy.glb', 'daisy')


if __name__ == '__main__':
    print('--- harebell')
    build_harebell()
    print('--- clover')
    build_clover()
    print('--- daisy')
    build_daisy()
    print('all flowers written')
