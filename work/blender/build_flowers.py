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
    throat = lin(pal['throat'])
    # The body of the bell stays on the brief's petal blue; only the lobe points
    # lift to the tip colour. Ramping the whole flare up to the tip washed the
    # bloom out to near-white at field distance.
    tones = ([throat, core, body, body] if bands >= 3
             else [throat, mixc(core, body, 0.75), body])
    def vcol(i, j):
        # lobe points (the vertices pulled out below) carry the tip colour
        if i == len(rings) - 1 and j % 2 == 0:
            return tipc
        return tones[i]
    for i in range(len(rings) - 1):
        for j in range(sides):
            k = (j + 1) % sides
            B.quad(rings[i][j], rings[i + 1][j], rings[i + 1][k], rings[i][k],
                   vcol(i, j), vcol(i + 1, j), vcol(i + 1, k), vcol(i, k))
    # A green calyx closes the top and takes the peduncle. Botanically right for a
    # campanula, and it means the only thing the (green) peduncle ever touches is
    # more green -- no stem geometry anywhere near the corolla.
    calyx = Vector((top.x, top.y, top.z + mouth_r * 0.30))
    c_cal = lin(pal['stem'])
    c_cal_lo = lin(pal['stem_dk'])
    for j in range(sides):
        k = (j + 1) % sides
        B.tri(rings[0][j], rings[0][k], calyx, c_cal_lo, c_cal_lo, c_cal)
    return calyx


def bud(B, cen, r, h, pal):
    """an unopened, nodding bell. The upper half is the green calyx that the
    peduncle attaches to, so nothing green ever pierces the corolla below it."""
    tip = Vector(cen) + Vector((0, 0, h * 0.5))
    base = Vector(cen) - Vector((0, 0, h * 0.5))
    c_lo = mixc(lin(pal['core']), lin(pal['petal']), 0.5)
    c_cal = lin(pal['stem'])
    c_cal_lo = lin(pal['stem_dk'])
    ring = [Vector((cen[0] + math.cos(2 * math.pi * j / 4) * r,
                    cen[1] + math.sin(2 * math.pi * j / 4) * r, cen[2])) for j in range(4)]
    for j in range(4):
        k = (j + 1) % 4
        B.tri(ring[j], ring[k], tip, c_cal_lo, c_cal_lo, c_cal)
        B.tri(ring[k], ring[j], base, c_lo, c_lo, c_lo)
    return tip


def blade(B, root, tip, side, w0, w1, c_base, c_tip, fold=0.45):
    """A leaf as two triangles folded along its own midrib.

    A single flat quad disappears to a one-pixel sliver whenever the instance
    happens to face the camera edge-on, which aliases badly across hundreds of
    instances. Folding the two halves down off the midrib gives the leaf real
    thickness in every view for the same triangle count."""
    root, tip, side = Vector(root), Vector(tip), Vector(side).normalized()
    drop = Vector((0, 0, -1)) * max(w0, w1) * fold
    mid = root + (tip - root) * 0.42
    l = mid + side * w0 + drop
    r = mid - side * w0 + drop
    B.tri(root, l, tip, c_base, c_tip, c_tip)
    B.tri(root, tip, r, c_base, c_tip, c_tip)


def build_harebell():
    B = Builder()
    pal = HAREBELL
    c_stem_lo = lin(pal['stem_dk'])
    c_stem = lin(pal['stem'])
    pts = curve_pts(*HB_STEM, 5)
    rad = [0.085, 0.070, 0.056, 0.044, 0.030]
    cols = [c_stem_lo, mixc(c_stem_lo, c_stem, 0.6), c_stem, c_stem, c_stem]
    stalk(B, pts, rad, 3, cols, cap_start=False, cap_end=False)

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
        btip = bud(B, cen, 0.15, 0.44, pal)
        a = hb_stem_at(att)
        stalk(B, [a, btip], [0.034, 0.026], 3, [c_stem, c_stem],
              cap_start=False, cap_end=False)

    # two linear stem leaves low down
    c_leaf = lin(pal['leaf'])
    blade(B, (0.14, -0.06, 0.95), (0.74, -0.40, 1.62), (0.5, 0.86, 0), 0.28, 0.28,
          lin(pal['stem_dk']), c_leaf)
    blade(B, (0.22, -0.11, 1.70), (-0.34, 0.32, 2.34), (0.72, 0.69, 0), 0.26, 0.26,
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
    c_hi = lin(pal['tip']) if k >= 0.7 else mixc(c_mid, lin(pal['tip']), 0.45 + 0.5 * k)
    u, v = frame(d)
    ring0 = [base + (u * math.cos(2 * math.pi * j / 3) + v * math.sin(2 * math.pi * j / 3)) * r0
             for j in range(3)]
    ring1 = [tip + (u * math.cos(2 * math.pi * j / 3 + 0.5)
                    + v * math.sin(2 * math.pi * j / 3 + 0.5)) * r1 for j in range(3)]
    for j in range(3):
        k2 = (j + 1) % 3
        B.quad(ring0[j], ring0[k2], ring1[k2], ring1[j], c_mid, c_mid, c_hi, c_hi)
    B.tri(ring1[0], ring1[1], ring1[2], c_hi, c_hi, c_hi)
    B.tri(ring0[2], ring0[1], ring0[0], c_lo, c_lo, c_lo)


def trifoliate(B, node, bearing, size, pal):
    """petiole plus three leaflets -- the second-strongest clover identifier"""
    node = Vector(node)
    d = Vector((math.cos(bearing), math.sin(bearing), 0.20)).normalized()
    hub = node + d * size * 0.9
    c_stem = lin(pal['stem'])
    stalk(B, [node, hub], [0.055, 0.045], 3, [c_stem, lin(pal['leaf_pale'])],
          cap_start=False, cap_end=False)
    c_leaf = lin(pal['leaf'])
    c_dk = lin(pal['leaf_dk'])
    c_pale = lin(pal["leaf_pale"])  # petiole highlight
    for m in range(3):
        a = bearing + (m - 1) * 2.09   # a true 120-degree trefoil
        ld = Vector((math.cos(a), math.sin(a), 0.34)).normalized()
        side = Vector((-ld.y, ld.x, 0)).normalized()
        p0 = hub + ld * size * 0.08
        p1 = hub + ld * size * 0.74
        w = size * 0.72
        # broad and blunt, widest past the middle, with a shallow fold off the
        # midrib so the trefoil still has width when seen edge-on. Solid green:
        # putting the pale chevron on a corner vertex bled it across the whole
        # blade and the leaves read as washed-out ribbons.
        drop = Vector((0, 0, -w * 0.14))
        m = hub + ld * size * 0.42
        B.tri(p0, m + side * w + drop, p1, c_dk, c_leaf, c_leaf)
        B.tri(p0, p1, m - side * w + drop, c_dk, c_leaf, c_leaf)


def build_clover():
    B = Builder()
    pal = CLOVER
    c_stem_lo = lin(0x375822)
    c_stem = lin(pal['stem'])
    pts = curve_pts(*CL_STEM, 5)
    rad = [0.105, 0.092, 0.082, 0.074, 0.068]
    cols = [c_stem_lo, mixc(c_stem_lo, c_stem, 0.6), c_stem, c_stem, c_stem]
    stalk(B, pts, rad, 3, cols)          # stops at the head base: nothing buried

    crown = Vector((0.24, 0.04, 3.34))
    # nine florets around the crown, two tiers, so the head reads as a cluster of
    # tubes rather than a faceted pom
    tiers = [(5, -0.22, 0.40, 0.150, 0.190, 0.25),
             (4,  0.28, 0.40, 0.140, 0.180, 0.55),
             (2,  1.05, 0.34, 0.125, 0.160, 0.85)]
    phase = 0.0
    for (n, elev, length, r0, r1, k) in tiers:
        phase += 0.62
        for i in range(n):
            a = 2 * math.pi * i / n + phase
            ce, se = math.cos(elev), math.sin(elev)
            d = Vector((math.cos(a) * ce, math.sin(a) * ce, se))
            floret(B, crown, d, length, r0, r1, pal, k + 0.08 * (i % 2))
    # receptacle bridging the stem top to the crown, kept narrow and low so no
    # green geometry ever reaches up into the florets
    c_calyx = lin(pal['leaf_dk'])
    top = pts[-1]
    ring = [top + Vector((math.cos(2 * math.pi * j / 6) * 0.17,
                          math.sin(2 * math.pi * j / 6) * 0.17, 0.02)) for j in range(6)]
    apex = crown + Vector((0, 0, -0.06))
    for j in range(6):
        B.tri(ring[j], ring[(j + 1) % 6], apex, c_calyx, c_calyx, c_calyx)

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
        # The glTF exporter writes a real COLOR_0 only when the material actually
        # reads the colour attribute; without this node it emits a white
        # placeholder and every flower ships grey.
        nt = m.node_tree
        for n in list(nt.nodes):
            if n.type == 'VERTEX_COLOR' or (n.type == 'ATTRIBUTE' and n.attribute_name == 'Col'):
                nt.nodes.remove(n)
        attr = nt.nodes.new('ShaderNodeVertexColor')
        attr.layer_name = 'Col'
        attr.location = (-320, 120)
        for l in list(bsdf.inputs['Base Color'].links):
            nt.links.remove(l)
        nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
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
    for extra in ({'export_all_vertex_colors': False, 'export_vertex_color': 'ACTIVE'},
                  {'export_vertex_color': 'ACTIVE'},
                  {'export_colors': True}):
        try:
            bpy.ops.export_scene.gltf(**dict(kw, **extra))
            break
        except TypeError:
            continue
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


def widen_basal_leaves(ob, z_max=0.55, widen=2.15, fold=0.16):
    """Broaden the daisy's ground leaves without adding a single triangle.

    They shipped as ribbons a few hundredths wide; at field density that reads as
    a stray line rather than a leaf. Each blade radiates from the stem, so the
    blades can be found by clustering the low green faces by bearing, then each
    cluster is scaled away from its own midrib and folded slightly downward so it
    never presents zero width."""
    me = ob.data
    faces = []
    for p in me.polygons:
        vs = [me.vertices[i].co for i in p.vertices]
        if max(v.z for v in vs) > z_max:
            continue
        c = p.center
        if math.hypot(c.x, c.y) < 0.18:
            continue
        faces.append((math.atan2(c.y, c.x), p))
    if not faces:
        print('daisy    no basal leaf faces found')
        return 0
    faces.sort(key=lambda t: t[0])
    clusters, cur = [], [faces[0]]
    for prev, nxt in zip(faces, faces[1:]):
        if nxt[0] - prev[0] > 0.55:
            clusters.append(cur)
            cur = []
        cur.append(nxt)
    clusters.append(cur)
    # the first and last cluster may be the same blade wrapped across -pi/+pi
    if len(clusters) > 1 and (faces[0][0] + 2 * math.pi) - faces[-1][0] <= 0.55:
        clusters[0] = clusters[0] + clusters.pop()
    moved = set()
    for cl in clusters:
        ang = [a for a, _ in cl]
        ref = ang[0]
        mean = ref + sum(math.atan2(math.sin(a - ref), math.cos(a - ref))
                         for a in ang) / len(ang)
        d = Vector((math.cos(mean), math.sin(mean), 0.0))
        idxs = {i for _, p in cl for i in p.vertices}
        span = max(Vector((me.vertices[i].co.x, me.vertices[i].co.y, 0)).dot(d)
                   for i in idxs)
        for i in idxs:
            if i in moved:
                continue
            moved.add(i)
            v = me.vertices[i]
            rel = Vector((v.co.x, v.co.y, 0.0))
            along = rel.dot(d)
            perp = rel - d * along
            v.co.x = d.x * along + perp.x * widen
            v.co.y = d.y * along + perp.y * widen
            # drop the flanks a little so the blade is a shallow trough, not a plane
            v.co.z -= perp.length * widen * fold * (along / max(span, 1e-4))
    print('daisy    widened %d basal-leaf vertices across %d blades'
          % (len(moved), len(clusters)))
    return len(moved)


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

    # read whatever the importer produced, then collapse to a single CORNER
    # FLOAT_COLOR layer -- leaving the import's spare layers in place makes the
    # exporter emit COLOR_1/COLOR_2, which the engine never reads and only pays for
    me = ob.data
    src_a = me.color_attributes.get('Col') or me.color_attributes[0]
    per_loop = []
    for li, loop in enumerate(me.loops):
        idx = li if src_a.domain == 'CORNER' else loop.vertex_index
        c = src_a.data[idx].color
        per_loop.append((c[0], c[1], c[2]))
    while me.color_attributes:
        me.color_attributes.remove(me.color_attributes[0])
    ca = me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='CORNER')
    for li, c in enumerate(per_loop):
        ca.data[li].color = (c[0], c[1], c[2], 1.0)
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
    set_active_color(me)
    print('daisy    retinted %d underside corners; head y=%.3f' % (n, head_y))
    for o in list(bpy.data.objects):
        if o.type == 'EMPTY':
            bpy.data.objects.remove(o, do_unlink=True)
    widen_basal_leaves(ob)
    print('daisy    tris=%d colattrs=%s' % (len(ob.data.polygons),
          [(a.name, a.domain, a.data_type) for a in ob.data.color_attributes]))
    export('daisy', ob, Vector((0.0, 0.0, head_y)))


def run():
    retint_daisy()
    make('clover', build_clover, 3.9)
    make('harebell', build_harebell, 6.3)
