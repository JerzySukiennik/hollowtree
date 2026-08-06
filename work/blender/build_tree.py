bl_info = "Hollowtree hero prop builder"
import bpy, bmesh, math
from mathutils import Vector

# ---------------------------------------------------------------- parameters
TOTAL_H      = 74.0     # full bbox height (engine normalises bbox height to 74)
BOLE_H       = 59.0     # woody trunk height; canopy sits on top up to TOTAL_H
R_BASE       = 7.4
R_TOP        = 2.2
ROOT_FLARE   = 1.75
ROOT_H       = 7.0
ENT_Z        = 16.0
ENT_R        = 3.2
ENT_DEPTH    = 1.9      # wall thickness at the entrance == length of the shaft mouth
NSIDE        = 21       # 7 bark plates x 3 facets each
VOID_Z0      = 10.5     # floor of the inner shaft
VOID_Z1      = 41.0     # where the shaft closes off
GASH_ANG     = 5.62     # tall rift that shows the trunk is hollow
GASH_Z       = 29.0

PAL = {
    'bark':   0x6b503a,
    'dark':   0x4a3728,
    'hollow': 0x1b120c,
    'lip':    0x86664a,
    'canopy': 0x527a35,
    'candk':  0x3d5c27,
}

def hex_rgb(h):
    return ((h >> 16 & 255) / 255.0, (h >> 8 & 255) / 255.0, (h & 255) / 255.0)

def s2l(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def lin(h):
    return tuple(s2l(c) for c in hex_rgb(h))

def ratio(a, b):
    """linear multiplier that turns palette colour b into palette colour a"""
    la, lb = lin(a), lin(b)
    return tuple(la[i] / max(lb[i], 1e-5) for i in range(3))

# glTF stores COLOR_0 as normalised ushort, so vertex colour can only ever DARKEN
# the material's baseColorFactor. The two bark materials therefore carry the
# lightest tone of their range and vertex colour walks down from there; every
# palette entry is still hit exactly on the rendered surface.
MAT_BARK_BASE = PAL['lip']      # 0x86664a  -- sunlit entrance lip is vcol 1.0
MAT_DARK_BASE = PAL['dark']     # 0x4a3728  -- hollow interior walks down to 0x1b120c
MAT_LEAF_BASE = PAL['canopy']   # 0x527a35  -- lit canopy is vcol 1.0

R_BARK   = ratio(PAL['bark'],   MAT_BARK_BASE)
R_DARK   = ratio(PAL['dark'],   MAT_BARK_BASE)
R_HOLLOW = ratio(PAL['hollow'], MAT_DARK_BASE)
M_CANDK  = ratio(PAL['candk'],  MAT_LEAF_BASE)

# hue pair for the bark: warm where the light lands, cooler and bluer deep in
HUE_WARM = (1.05, 1.00, 0.89)
HUE_COOL = (0.92, 0.97, 1.14)

def clamp(x, a=0.0, b=1.0):
    return a if x < a else (b if x > b else x)

def smoothstep(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)

def shoulder(x, k=0.62):
    """monotone roll-off into 1.0 -- keeps highlight separation that clamp() flattens"""
    if x <= k:
        return max(0.0, x)
    return k + (1.0 - k) * (1.0 - math.exp(-(x - k) / (1.0 - k)))


def blend(m, target, k):
    return tuple(m[i] * (1.0 - k) + target[i] * k for i in range(3))

# ---------------------------------------------------------------- noise utils
def h2(a, b, s=0):
    n = (int(a) * 374761393 + int(b) * 668265263 + s * 1442695040888963407) & 0xffffffff
    n = (n ^ (n >> 13)) * 1274126177 & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffffffff) / 0xffffffff

def plate(j, z, jstep, zstep, seed):
    """blocky value noise -> chunky faceted bark plates (periodic in j).
    Geometry only: never used for shading, because a lattice of tones reads as
    a checkerboard."""
    za = int(math.floor(z / zstep))
    shift = (za * 5 + int(h2(za, 3, seed + 77) * 7)) % max(1, NSIDE)
    ja = int(math.floor(((j + shift) % NSIDE) / jstep)) % max(1, int(NSIDE / jstep))
    return h2(ja, za, seed) - 0.5

# ---------------------------------------------------------------- trunk shape
def r_base(z):
    t = clamp(z / BOLE_H)
    r = R_TOP + (R_BASE - R_TOP) * (1.0 - t) ** 1.35
    r *= 1.0 + 0.085 * math.sin(z * 0.185 + 1.15) + 0.045 * math.sin(z * 0.44 + 0.3)
    # the bole swells where it is hollow, the way an old cavity tree does --
    # this is also what gives the shaft room to be a real flight-through
    r *= 1.0 + 0.21 * math.exp(-((z - 17.0) / 9.0) ** 2)
    if z < ROOT_H:
        r *= 1.0 + (ROOT_FLARE - 1.0) * ((ROOT_H - z) / ROOT_H) ** 2.7
    return r

def r_ripple(ang, z):
    f = 1.0 + 0.045 * math.sin(ang * 3.0 + z * 0.11) + 0.035 * math.sin(ang * 7.0 - z * 0.26)
    if z < ROOT_H * 1.9:
        k = 1.0 - z / (ROOT_H * 1.9)
        f *= 1.0 + 0.22 * k * max(0.0, math.cos(ang * 5.0 + 0.7)) ** 2
    return f

def centre(z):
    t = clamp(z / BOLE_H)
    cx = 6.6 * t ** 1.7 - 1.35 * math.sin(t * 3.6)
    cy = 1.35 * math.sin(t * 2.15) - 2.2 * t ** 2.4
    return cx, cy

def lip_bulge(ang, z):
    """thickened collar of wood around the entrance"""
    da = math.atan2(math.sin(ang + math.pi / 2), math.cos(ang + math.pi / 2))
    g = math.exp(-((da / 0.72) ** 2 + ((z - ENT_Z) / 4.6) ** 2))
    g2 = math.exp(-((da / 0.95) ** 2 + ((z - (ENT_Z - 3.6)) / 3.0) ** 2))
    return 1.95 * g + 0.75 * g2

KNOT_SPEC = [
    (2.35, 27.0,  1.45, 0.55, 3.4),
    (5.05, 35.5,  1.15, 0.48, 2.8),
    (0.75, 21.0,  0.95, 0.42, 2.2),
    (3.55, 12.5,  1.20, 0.60, 3.0),
    (1.15, 44.0, -0.80, 0.50, 3.6),
]

# The bole itself swells where a limb leaves it, so the junction is a flare in the
# silhouette rather than a stub pushed into a cylinder. Filled from LIMB_SPEC and
# BRANCH_SPEC at import time (see build_junction_spec) -- all of them sit at z >= 23,
# well clear of the entrance band, so the shaft geometry is untouched.
JUNCTION_SPEC = []


def knots(ang, z):
    tot = 0.0
    for (ka, kz, amt, aw, zw) in KNOT_SPEC:
        da = math.atan2(math.sin(ang - ka), math.cos(ang - ka))
        tot += amt * math.exp(-((da / aw) ** 2 + ((z - kz) / zw) ** 2))
    for (ka, kz, amt, aw, zw) in JUNCTION_SPEC:
        da = math.atan2(math.sin(ang - ka), math.cos(ang - ka))
        tot += amt * math.exp(-((da / aw) ** 2 + ((z - kz) / zw) ** 2))
    return tot

def r_smooth(ang, z):
    """trunk surface without the high-frequency bark relief"""
    return r_base(z) * r_ripple(ang, z) + lip_bulge(ang, z) + knots(ang, z)

def bark_relief(j, z):
    f = 1.0 + 0.150 * plate(j, z, 3.0, 3.6, 3) * 2.0
    f *= 1.0 + 0.060 * plate(j, z, 1.0, 1.8, 17) * 2.0
    return f

def trunk_radius(j, z):
    ang = 2 * math.pi * j / NSIDE
    return r_base(z) * r_ripple(ang, z) * bark_relief(j, z) + lip_bulge(ang, z) + knots(ang, z)

def wall(ang, z):
    """wood thickness: exactly ENT_DEPTH at the entrance mouth, heavier away from
    it, and thinned on the far side of the entrance band so the shaft is a clear
    flight-through rather than a slot."""
    d = abs(z - ENT_Z)
    w = ENT_DEPTH + 0.62 * smoothstep((d - 2.0) / 9.0)
    far = math.exp(-((z - ENT_Z) / 6.5) ** 2) * clamp(0.5 + 0.5 * math.cos(ang - math.pi / 2))
    return w * (1.0 - 0.34 * far)

CLEAN_WELD  = 0.012
CLEAN_DEGEN = 0.008

ENT_FIX = [0.0]   # correction so the shaft mouth is exactly ENT_DEPTH of wood


def void_radius(ang, z):
    """inner surface of the hollow trunk, guaranteed to stay inside the bark"""
    rs = r_smooth(ang, z)
    v = rs - wall(ang, z)
    # never let the shaft breach the thinnest possible bark relief
    cap = r_base(z) * r_ripple(ang, z) * 0.80 + (lip_bulge(ang, z) + knots(ang, z)) * 0.85 - 0.40
    v = min(v, cap)
    if ENT_FIX[0]:
        da = math.atan2(math.sin(ang + math.pi / 2), math.cos(ang + math.pi / 2))
        v += ENT_FIX[0] * math.exp(-((da / 0.85) ** 2 + ((z - ENT_Z) / 5.0) ** 2))
    return v

RING_Z = [0.0, 0.5, 1.1, 1.9, 2.9, 4.0, 5.2, 6.5, 8.0, 9.6, 11.2,
          12.6, 13.8, 14.9, 16.0, 17.1, 18.3, 19.7, 21.3, 23.1, 25.2,
          27.5, 30.0, 32.8, 35.8, 38.8, 41.8, 44.6, 47.4, 50.0, 52.4,
          54.6, 56.8, 59.0]

VOID_RING_Z = [VOID_Z0, 12.0, 13.5, 14.8, 16.0, 17.2, 18.6, 20.5,
               23.0, 26.0, 29.5, 33.0, 37.0, VOID_Z1]


def build_trunk_mesh():
    bm = bmesh.new()
    rings = []
    for z in RING_Z:
        cx, cy = centre(z)
        row = []
        for j in range(NSIDE):
            ang = 2 * math.pi * j / NSIDE
            r = trunk_radius(j, z)
            row.append(bm.verts.new((cx + math.cos(ang) * r, cy + math.sin(ang) * r, z)))
        rings.append(row)
    bm.verts.ensure_lookup_table()
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(NSIDE):
            k = (j + 1) % NSIDE
            bm.faces.new((a[j], a[k], b[k], b[j]))
    cx, cy = centre(0.0)
    cb = bm.verts.new((cx, cy, 0.0))
    for j in range(NSIDE):
        k = (j + 1) % NSIDE
        bm.faces.new((rings[0][k], rings[0][j], cb))
    # broken crown
    top = rings[-1]
    cx, cy = centre(BOLE_H)
    crown = []
    for j in range(NSIDE):
        ang = 2 * math.pi * j / NSIDE
        rr = trunk_radius(j, BOLE_H) * 0.62
        zz = BOLE_H + 1.6 + 2.4 * h2(j, 7, 91) + 1.9 * math.cos(ang * 2.0 + 0.6)
        crown.append(bm.verts.new((cx + math.cos(ang) * rr * 0.9, cy + math.sin(ang) * rr * 0.9, zz)))
    for j in range(NSIDE):
        k = (j + 1) % NSIDE
        bm.faces.new((top[j], top[k], crown[k], crown[j]))
    ct = bm.verts.new((cx, cy, BOLE_H + 2.2))
    for j in range(NSIDE):
        k = (j + 1) % NSIDE
        bm.faces.new((crown[j], crown[k], ct))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('trunk')
    bm.to_mesh(me)
    bm.free()
    return me


def build_void_object(grow=0.0, name='void'):
    """closed solid describing the hollow inside the trunk.

    `grow` offsets the surface outward. The re-hollow pass uses a small positive
    offset so its faces never land coplanar with the inner shell the first cut
    already created -- coplanar operands make the exact solver punch holes."""
    bm = bmesh.new()
    rings = []
    for z in VOID_RING_Z:
        cx, cy = centre(z)
        row = []
        for j in range(NSIDE):
            ang = 2 * math.pi * j / NSIDE
            r = max(0.35, void_radius(ang, z) + grow)
            row.append(bm.verts.new((cx + math.cos(ang) * r, cy + math.sin(ang) * r, z)))
        rings.append(row)
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(NSIDE):
            k = (j + 1) % NSIDE
            bm.faces.new((a[j], a[k], b[k], b[j]))
    cx, cy = centre(VOID_Z0)
    fl = bm.verts.new((cx, cy, VOID_Z0 - 0.6 - grow))
    for j in range(NSIDE):
        k = (j + 1) % NSIDE
        bm.faces.new((rings[0][k], rings[0][j], fl))
    cx, cy = centre(VOID_Z1)
    tp = bm.verts.new((cx, cy, VOID_Z1 + 1.8 + grow))
    for j in range(NSIDE):
        k = (j + 1) % NSIDE
        bm.faces.new((rings[-1][j], rings[-1][k], tp))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


# --------------------------------------------------------------- radial slots
def slot_frame(ang, z_c):
    d = Vector((math.cos(ang), math.sin(ang), 0.0))
    perp = Vector((-math.sin(ang), math.cos(ang), 0.0))
    up = Vector((0.0, 0.0, 1.0))
    cx, cy = centre(z_c)
    return Vector((cx, cy, z_c)), d, perp, up


def make_slot(name, ang, z_c, s_out, s_in, rx, rz, flare=1.16, sides=18, seed=7):
    """prism driven radially through the trunk wall and on into the void"""
    origin, d, perp, up = slot_frame(ang, z_c)
    wob = [1.0 + 0.085 * (h2(j, 0, seed) - 0.5) * 2.0 + 0.05 * math.sin(2 * math.pi * j / sides * 3.0 + 0.9)
           for j in range(sides)]
    bm = bmesh.new()
    rings = []
    for u in (0.0, 0.14, 0.30, 0.52, 1.0):
        s = s_out + (s_in - s_out) * u
        k = 1.0 + (flare - 1.0) * (1.0 - u) ** 2.2
        row = []
        for j in range(sides):
            a = 2 * math.pi * j / sides
            row.append(bm.verts.new(origin + d * s
                                    + perp * (math.cos(a) * rx * k * wob[j])
                                    + up * (math.sin(a) * rz * k * wob[j])))
        rings.append(row)
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(sides):
            k = (j + 1) % sides
            bm.faces.new((a[j], a[k], b[k], b[j]))
    bm.faces.new(list(rings[0]))
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def in_slot(p, ang, z_c, s_out, s_in, rx, rz, pad=1.28):
    """is a point inside a slot envelope (used to tag interior faces)"""
    origin, d, perp, up = slot_frame(ang, z_c)
    rel = Vector(p) - origin
    s = rel.dot(d)
    if s > s_out + 0.6 or s < s_in - 0.6:
        return False
    a = rel.dot(perp) / (rx * pad)
    b = rel.dot(up) / (rz * pad)
    return a * a + b * b <= 1.0


# ---------------------------------------------------------------- tapered tube
def tube(bm, pts, radii, sides, twist=0.0, cap_end=True, jag=0.0, seed=0, aspect=1.0,
         frame_u=None):
    rings = []
    n = len(pts)
    # Parallel-transported frame. Deriving u from a fixed world up-vector flips the
    # frame by 90 degrees the moment a limb runs near-vertical (buttresses do, right
    # where they leave the bole), which shears one ring against the next: that is a
    # self-intersecting operand for the boolean solver and reads as a flat inserted
    # wedge in the render. Rotating the previous frame onto the new tangent instead
    # keeps consecutive rings coherent all the way along the limb.
    tangents = []
    for i in range(n):
        if i == 0:
            d = pts[1] - pts[0]
        elif i == n - 1:
            d = pts[-1] - pts[-2]
        else:
            d = pts[i + 1] - pts[i - 1]
        tangents.append(d.normalized())
    if frame_u is not None:
        # caller pins the thin axis of an elliptical cross-section (buttress fins)
        u_prev = (frame_u - tangents[0] * frame_u.dot(tangents[0])).normalized()
    else:
        seed_up = Vector((0, 0, 1))
        if abs(tangents[0].dot(seed_up)) > 0.9:
            seed_up = Vector((1, 0, 0))
        u_prev = tangents[0].cross(seed_up).normalized()
    frames = []
    for i in range(n):
        if i:
            axis = tangents[i - 1].cross(tangents[i])
            if axis.length > 1e-7:
                ang = tangents[i - 1].angle(tangents[i])
                from mathutils import Matrix
                u_prev = (Matrix.Rotation(ang, 3, axis.normalized()) @ u_prev)
            u_prev = (u_prev - tangents[i] * u_prev.dot(tangents[i])).normalized()
        frames.append((u_prev.copy(), tangents[i].cross(u_prev).normalized()))
    for i, p in enumerate(pts):
        d = tangents[i]
        u, v = frames[i]
        asp = aspect[i] if isinstance(aspect, (list, tuple)) else aspect
        row = []
        for j in range(sides):
            a = 2 * math.pi * j / sides + twist * i
            rr = radii[i] * (1.0 + jag * (h2(j, i, seed) - 0.5) * 2.0)
            row.append(bm.verts.new(p + (u * math.cos(a) * rr + v * math.sin(a) * rr * asp)))
        rings.append(row)
    for i in range(n - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(sides):
            k = (j + 1) % sides
            bm.faces.new((a[j], a[k], b[k], b[j]))
    if cap_end:
        bm.faces.new(list(reversed(rings[-1])))
    bm.faces.new(rings[0])
    return rings


def bez(p0, p1, p2, t):
    return p0 * (1 - t) ** 2 + p1 * 2 * (1 - t) * t + p2 * t ** 2


# ------------------------------------------------------- collars and anchoring
def anchor_radius(ang, z):
    """radial distance at which a limb should START, measured from the bole axis.

    Deep enough that the tube's inner cap is buried in solid wood (so the boolean
    union deletes it outright), but never so deep that the limb breaks into the
    hollow and leaves a lump hanging in the flight shaft."""
    if z <= VOID_Z1 + 2.0:
        return void_radius(ang, z) + 0.55 * wall(ang, z)
    return r_base(z) * 0.35


def collar_radii(rad, t_list, t_surf, amount, width):
    """swell the tube where it crosses the bark, then relax to the plain taper"""
    out = []
    for r, t in zip(rad, t_list):
        k = math.exp(-((t - t_surf) / width) ** 2)
        out.append(r * (1.0 + (amount - 1.0) * k))
    return out


def limb_object(name, pts, rad, sides, twist=0.0, jag=0.0, seed=0, aspect=1.0,
                tip_ragged=None, ragged_k=1.0, frame_u=None):
    bm = bmesh.new()
    rings = tube(bm, pts, rad, sides, twist=twist, jag=jag, seed=seed, aspect=aspect,
                 frame_u=frame_u)
    if tip_ragged is not None:
        # a snapped-off limb end -- never pull a vertex back past its own ring,
        # which would fold the cap and make the operand self-intersecting
        dirv = (pts[-1] - pts[-2]).normalized()
        amp = 2.2 * ragged_k
        for j, v in enumerate(rings[-1]):
            v.co += dirv * (h2(j, tip_ragged, 55) * amp)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


# ---------------------------------------------------------------- roots, limbs
BUTTRESS_SPEC = [
    (0.30, 15.8, 12.5, 1.55),
    (1.28, 13.1,  8.5, 1.25),
    (2.30, 16.7, 14.5, 1.70),
    (3.20, 12.1,  7.0, 1.10),
    (4.05, 15.0, 10.5, 1.45),
    (5.25, 14.3,  9.5, 1.35),
]
SURFACE_ROOT_SPEC = [(0.85, 21.0), (2.80, 22.5), (4.60, 19.0), (5.80, 21.6)]


def make_buttress(idx, cm=1.0, jagk=1.0):
    ang, reach, climb, thick = BUTTRESS_SPEC[idx]
    d = Vector((math.cos(ang), math.sin(ang), 0))
    cx0, cy0 = centre(climb)
    start = Vector((cx0, cy0, climb)) + d * anchor_radius(ang, climb) * 0.94
    cx1, cy1 = centre(2.0)
    mid = Vector((cx1, cy1, climb * 0.14)) + d * reach * 0.46
    end = Vector((cx1, cy1, 0.75)) + d * reach
    pts, rad, asp, ts = [], [], [], []
    seg = 8
    for i in range(seg + 1):
        t = i / seg
        pts.append(bez(start, mid, end, t))
        rad.append(thick * (1.20 - 0.78 * t ** 1.15) * (0.90 + 0.20 * h2(idx, i, 5)))
        asp.append(2.20 - 1.35 * t ** 0.75)
        ts.append(t)
    # a buttress is already a flare; it only needs enough swell to weld cleanly
    rad = collar_radii(rad, ts, 0.0, 1.0 + 0.16 * cm, 0.20)
    # the fin lies in the vertical plane through the root's own bearing, so the
    # thin axis is the horizontal tangential direction
    return limb_object('buttress_%d' % idx, pts, rad, 7, twist=0.0, jag=0.10 * jagk,
                       seed=idx * 13 + 1, aspect=asp,
                       frame_u=Vector((-math.sin(ang), math.cos(ang), 0.0)))


def make_groundroot(idx, cm=1.0, jagk=1.0):
    ang, reach = SURFACE_ROOT_SPEC[idx]
    d = Vector((math.cos(ang), math.sin(ang), 0))
    cx1, cy1 = centre(1.5)
    start = Vector((cx1, cy1, 3.0)) + d * anchor_radius(ang, 3.0) * 0.92
    side = Vector((-d.y, d.x, 0))
    mid = Vector((cx1, cy1, 1.3)) + d * reach * 0.55 + side * reach * 0.20
    end = Vector((cx1, cy1, 0.85)) + d * reach - side * reach * 0.10
    pts, rad, ts = [], [], []
    seg = 6
    for i in range(seg + 1):
        t = i / seg
        pts.append(bez(start, mid, end, t))
        rad.append((1.55 - 1.05 * t ** 1.1) * (0.85 + 0.3 * h2(idx, i, 9)))
        ts.append(t)
    rad = collar_radii(rad, ts, 0.0, 1.0 + 0.50 * cm, 0.18)
    return limb_object('groundroot_%d' % idx, pts, rad, 5, twist=0.16, jag=0.12 * jagk,
                       seed=idx * 23 + 4, aspect=1.15)


LIMB_SPEC = [
    (1.05, 31.5, 13.5, 2.15, 0.36),
    (4.15, 40.0, 11.0, 1.75, 0.28),
    (2.35, 23.0,  9.0, 1.55, 0.14),
    (5.55, 36.0,  7.5, 1.30, -0.10),
]


def make_limb(idx, cm=1.0, jagk=1.0):
    ang, z, ln, r0, rise = LIMB_SPEC[idx]
    d = Vector((math.cos(ang), math.sin(ang), 0))
    cx, cy = centre(z)
    start = Vector((cx, cy, z)) + d * anchor_radius(ang, z)
    mid = start + d * ln * 0.55 + Vector((0, 0, ln * (rise + 0.16)))
    end = start + d * ln + Vector((0, 0, ln * rise))
    pts, rad, ts = [], [], []
    seg = 6
    for i in range(seg + 1):
        t = i / seg
        pts.append(bez(start, mid, end, t))
        rad.append(r0 * (1.0 - 0.58 * t))
        ts.append(t)
    rad = collar_radii(rad, ts, 0.0, 1.0 + 0.85 * cm, 0.20)
    return limb_object('limb_%d' % idx, pts, rad, 6, twist=0.12, jag=0.16 * jagk,
                       seed=idx * 29 + 7, tip_ragged=idx, ragged_k=0.35 + 0.65 * jagk)


# (angle, attach height, length, base radius, rise, leaf-mass radius, ico subdiv)
BRANCH_SPEC = [
    (0.45, 43.5, 19.5, 1.95, 0.62,  9.6, 3),
    (1.75, 50.0, 15.0, 1.60, 0.56,  6.2, 2),
    (3.10, 46.0, 20.5, 2.05, 0.66, 10.8, 3),
    (4.30, 53.0, 13.5, 1.45, 0.88,  7.1, 3),
    (5.55, 48.5, 17.0, 1.75, 0.42,  8.0, 2),
    (2.15, 39.0, 20.0, 1.85, 0.12,  7.6, 3),   # low drooping bough
    (0.95, 47.0, 12.0, 1.25, 1.05,  5.5, 2),   # spire that juts above the cap
]

BRANCH_TIPS = []    # (tip Vector, leaf radius, subdivisions) filled by add_branches


def branch_curve(idx):
    ang, z, ln, r0, rise, mrad, sub = BRANCH_SPEC[idx]
    d = Vector((math.cos(ang), math.sin(ang), 0))
    side = Vector((-d.y, d.x, 0))
    cx, cy = centre(z)
    start = Vector((cx, cy, z)) + d * anchor_radius(ang, z)
    mid = start + d * ln * 0.5 + Vector((0, 0, ln * (rise + 0.22))) \
        + side * ln * 0.10 * (1 if idx % 2 else -1)
    end = start + d * ln + Vector((0, 0, ln * rise))
    return start, mid, end


def make_bough(idx, cm=1.0, jagk=1.0):
    ang, z, ln, r0, rise, mrad, sub = BRANCH_SPEC[idx]
    start, mid, end = branch_curve(idx)
    pts, rad, ts = [], [], []
    seg = 6
    for i in range(seg + 1):
        t = i / seg
        pts.append(bez(start, mid, end, t))
        rad.append(r0 * (1.0 - 0.60 * t))
        ts.append(t)
    rad = collar_radii(rad, ts, 0.0, 1.0 + 0.90 * cm, 0.19)
    return limb_object('bough_%d' % idx, pts, rad, 6, twist=0.15, jag=0.10 * jagk,
                       seed=idx * 41 + 3)


def fill_branch_tips():
    BRANCH_TIPS.clear()
    for idx, spec in enumerate(BRANCH_SPEC):
        BRANCH_TIPS.append((branch_curve(idx)[2].copy(), spec[5], spec[6]))


LIMB_FACTORIES = []


def build_limb_factories():
    """ordered (name, factory) pairs; factory(collar_mult, jag) -> closed object"""
    LIMB_FACTORIES.clear()
    for i in range(len(BUTTRESS_SPEC)):
        LIMB_FACTORIES.append(('buttress_%d' % i, (lambda k: lambda cm, jg: make_buttress(k, cm, jg))(i)))
    for i in range(len(SURFACE_ROOT_SPEC)):
        LIMB_FACTORIES.append(('groundroot_%d' % i, (lambda k: lambda cm, jg: make_groundroot(k, cm, jg))(i)))
    for i in range(len(LIMB_SPEC)):
        LIMB_FACTORIES.append(('limb_%d' % i, (lambda k: lambda cm, jg: make_limb(k, cm, jg))(i)))
    for i in range(len(BRANCH_SPEC)):
        LIMB_FACTORIES.append(('bough_%d' % i, (lambda k: lambda cm, jg: make_bough(k, cm, jg))(i)))
    return LIMB_FACTORIES


def build_junction_spec():
    """bole swellings at each limb attachment -- the flare side of the weld"""
    JUNCTION_SPEC.clear()
    for (ang, z, ln, r0, rise) in LIMB_SPEC:
        JUNCTION_SPEC.append((ang, z + r0 * 0.25, r0 * 0.62, 0.52, r0 * 2.0))
    for (ang, z, ln, r0, rise, mrad, sub) in BRANCH_SPEC:
        JUNCTION_SPEC.append((ang, z + r0 * 0.30, r0 * 0.68, 0.50, r0 * 2.1))
    for (ang, reach, climb, thick) in BUTTRESS_SPEC:
        # narrow in angle so the entrance mouth (ang -pi/2) keeps its own profile
        JUNCTION_SPEC.append((ang, climb * 0.55, thick * 0.55, 0.38, climb * 0.55))


# ---------------------------------------------------------------- canopy
MASS_SPEC = []


def icoshell(bm, cen, rad, squash, seed, sub):
    res = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    amp = 0.30 if sub >= 3 else 0.20
    q = 2.4 if sub >= 3 else 1.7
    for v in res['verts']:
        d = v.co.copy()
        qq = (int(math.floor(d.x * q)), int(math.floor(d.y * q)), int(math.floor(d.z * q)))
        n1 = h2(qq[0] * 31 + qq[1], qq[2], seed) - 0.5
        n2 = h2(qq[0], qq[1] * 17 + qq[2], seed + 5) - 0.5
        s = 1.0 + amp * n1 + 0.14 * n2
        v.co = Vector((d.x * rad * s, d.y * rad * s * 0.94, d.z * rad * s * squash)) + cen


def build_canopy_mesh():
    bm = bmesh.new()
    MASS_SPEC.clear()
    for i, (tip, rad, sub) in enumerate(BRANCH_TIPS):
        cen = tip + Vector((0, 0, rad * 0.40))
        MASS_SPEC.append((cen.copy(), rad))
        icoshell(bm, cen, rad, 0.76 + 0.10 * h2(i, 4, 61), seed=i * 7 + 2, sub=sub)
    ccx, ccy = centre(BOLE_H)
    for (dx, dy, z, rad, sq, seed, sub) in [
        (1.2, -2.0, 65.6, 9.9, 0.80,  99, 3),
        (-7.2, 5.6, 58.5, 6.4, 0.84, 131, 2),
        (5.6,  6.8, 61.0, 5.0, 0.90, 173, 2),
    ]:
        c = Vector((ccx + dx, ccy + dy, z))
        MASS_SPEC.append((c.copy(), rad))
        icoshell(bm, c, rad, sq, seed=seed, sub=sub)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('canopy_foliage')
    bm.to_mesh(me)
    bm.free()
    return me


def canopy_col(c, n, v, fi):
    best, bd, bi = None, 1e9, 0
    for i, (cen, rad) in enumerate(MASS_SPEC):
        d = (Vector(v) - cen).length / rad
        if d < bd:
            bd, best, bi = d, (cen, rad), i
    cen, rad = best
    rel = (Vector(v) - cen)
    top = clamp(rel.z / (rad * 0.8) * 0.5 + 0.5)
    m = 0.54 + 0.46 * smoothstep(top)
    m *= 0.90 + 0.10 * clamp(n.z * 0.5 + 0.5)
    inner = clamp(1.0 - (rel.length / rad))
    m *= 1.0 - 0.16 * inner
    m = clamp(m)
    k = 0.85 if bi % 2 else 0.22
    tone = blend((1.0, 1.0, 1.0), M_CANDK, k)
    hue = blend(HUE_COOL, HUE_WARM, smoothstep(top))
    return [clamp(m * tone[i] * hue[i]) for i in range(3)]


# ---------------------------------------------------------------- materials
def flat_mat(name, hexcol):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True        # -> doubleSided:false in glTF
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    r, g, b = hex_rgb(hexcol)
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (s2l(r), s2l(g), s2l(b), 1.0)
        if 'Roughness' in bsdf.inputs:
            bsdf.inputs['Roughness'].default_value = 0.92
        nt = m.node_tree
        attr = nt.nodes.new('ShaderNodeAttribute')
        attr.attribute_name = 'Col'
        attr.location = (-600, 100)
        mix = nt.nodes.new('ShaderNodeMixRGB')
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Fac'].default_value = 1.0
        mix.inputs['Color2'].default_value = (s2l(r), s2l(g), s2l(b), 1.0)
        mix.location = (-350, 100)
        nt.links.new(attr.outputs['Color'], mix.inputs['Color1'])
        nt.links.new(mix.outputs['Color'], bsdf.inputs['Base Color'])
    m.diffuse_color = (s2l(r), s2l(g), s2l(b), 1.0)
    return m


# ---------------------------------------------------------------- vtx colours
def ensure_col(me):
    if 'Col' not in me.color_attributes:
        me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='CORNER')
    return me.color_attributes['Col']


def set_colors(ob, fn):
    me = ob.data
    ca = ensure_col(me)
    for poly in me.polygons:
        c = poly.center
        n = poly.normal
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            r, g, b = fn(c, n, v, poly.index)
            ca.data[li].color = (r, g, b, 1.0)


# ---------------------------------------------------------------- assembly
def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects,
                  bpy.data.lights, bpy.data.cameras):
        for b in list(block):
            if b.users == 0:
                block.remove(b)


def new_obj(name, me):
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def shade_flat(ob):
    for p in ob.data.polygons:
        p.use_smooth = False


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def apply_bool(target, cutter, name, op='DIFFERENCE', self_isect=False):
    bpy.context.view_layer.objects.active = target
    mod = target.modifiers.new(name, 'BOOLEAN')
    mod.object = cutter
    mod.operation = op
    mod.solver = 'EXACT'
    if self_isect:
        try:
            mod.use_self = True
        except AttributeError:
            pass
    bpy.ops.object.modifier_apply(modifier=name)
    bpy.data.objects.remove(cutter, do_unlink=True)


# collar / jag / self-intersect settings tried in order for each limb. The EXACT
# solver silently discards the whole target when an operand self-intersects, so a
# limb that fails is rebuilt slightly tamer rather than dropped.
WELD_LADDER = [
    (1.00, 1.00, False),
    (1.00, 0.55, False),
    (0.75, 0.30, False),
    (0.50, 0.00, False),
    (0.25, 0.00, False),
    (0.00, 0.00, False),
    (1.00, 1.00, True),
]


def repair_shell(bm, rounds=6):
    """close the handful of defects that survive a chain of exact booleans.

    Merging slivers can leave an edge with three faces (a redundant sliver welded
    onto a seam) or a one-sided edge (a face lost to a degenerate). Drop the
    smallest face on each over-connected edge, then cap whatever holes that opens,
    and stop as soon as every edge has exactly two faces."""
    for _ in range(rounds):
        over = [e for e in bm.edges if len(e.link_faces) > 2]
        if over:
            kill = set()
            for e in over:
                fs = sorted(e.link_faces, key=lambda f: f.calc_area())
                for f in fs[:len(fs) - 2]:
                    kill.add(f)
            bmesh.ops.delete(bm, geom=list(kill), context='FACES')
        open_e = [e for e in bm.edges if len(e.link_faces) == 1]
        if open_e:
            # group the open edges into loops
            loops, seen = [], set()
            for e in open_e:
                if e.index in seen:
                    continue
                loop, stack = [], [e]
                seen.add(e.index)
                while stack:
                    cur = stack.pop()
                    loop.append(cur)
                    for v in cur.verts:
                        for o in v.link_edges:
                            if o.index not in seen and len(o.link_faces) == 1:
                                seen.add(o.index)
                                stack.append(o)
                loops.append(loop)
            small, big = [], []
            for loop in loops:
                (small if sum(e.calc_length() for e in loop) < 3.0 else big).append(loop)
            for loop in small:
                # a pinhole left by a sliver: sew it shut rather than cap it, so
                # validate() cannot come back and delete a duplicate face
                vs = list({v for e in loop for v in e.verts})
                cen = sum((v.co for v in vs), Vector()) / len(vs)
                bmesh.ops.pointmerge(bm, verts=vs, merge_co=cen)
            if big:
                res = bmesh.ops.holes_fill(bm, edges=[e for l in big for e in l], sides=0)
                new_f = res.get('faces', [])
                if new_f:
                    bmesh.ops.triangulate(bm, faces=new_f, quad_method='SHORT_EDGE',
                                          ngon_method='BEAUTY')
            bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges[:])
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context='VERTS')
        if not over and not open_e:
            break
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    b = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    n = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    print('shell after repair: boundary=%d nonmanifold=%d' % (b, n))
    return b, n


def edge_health(me):
    bm = bmesh.new()
    bm.from_mesh(me)
    bad = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    bm.free()
    return bad


def weld_limbs(trunk, factories):
    """boolean-union every limb into the bole so the result is one continuous
    surface instead of interpenetrating shells"""
    failed = []
    for i, (nm, fac) in enumerate(factories):
        pre = len(trunk.data.polygons)
        pre_bad = edge_health(trunk.data)
        done = False
        for attempt, (cm, jk, selfx) in enumerate(WELD_LADDER):
            ob = fac(cm, jk)
            backup = trunk.data.copy()
            apply_bool(trunk, ob, 'weld_%d' % i, op='UNION', self_isect=selfx)
            post = len(trunk.data.polygons)
            if post >= pre and edge_health(trunk.data) <= pre_bad:
                bpy.data.meshes.remove(backup)
                print('  weld %-14s faces %5d -> %5d%s'
                      % (nm, pre, post, '' if attempt == 0 else '   (attempt %d, collar x%.2f%s)'
                         % (attempt + 1, cm, ', self-isect' if selfx else '')))
                done = True
                break
            broken = trunk.data
            trunk.data = backup
            bpy.data.meshes.remove(broken)
        if not done:
            failed.append(nm)
            print('  weld %-14s UNRESOLVED - limb dropped' % nm)
    if failed:
        print('  UNRESOLVED WELDS:', failed)
    return failed


def build():
    clear_scene()
    build_junction_spec()
    mat_bark = flat_mat('bark', MAT_BARK_BASE)
    mat_dark = flat_mat('bark_dark', MAT_DARK_BASE)
    mat_leaf = flat_mat('foliage', MAT_LEAF_BASE)

    trunk = new_obj('trunk', build_trunk_mesh())
    bpy.context.view_layer.objects.active = trunk

    hx, hy = centre(ENT_Z)
    ok, loc, nor, idx = trunk.ray_cast(Vector((hx, -60.0, ENT_Z)), Vector((0, 1, 0)))
    if not ok:
        raise RuntimeError('entrance raycast missed the trunk')
    y_surf = loc.y
    r_out_ent = hy - y_surf
    # nudge the inner wall so the mouth of the shaft is exactly ENT_DEPTH of wood
    ENT_FIX[0] = 0.0
    ENT_FIX[0] = (r_out_ent - ENT_DEPTH) - void_radius(-math.pi / 2, ENT_Z)
    v_ent = void_radius(-math.pi / 2, ENT_Z)
    print('entrance: outer r %.3f  inner r %.3f  wall %.3f  (fix %.3f)'
          % (r_out_ent, v_ent, r_out_ent - v_ent, ENT_FIX[0]))

    # 1) hollow the trunk out
    apply_bool(trunk, build_void_object(), 'hollow')

    # 2) roots, broken limbs and the upper boughs are WELDED into the trunk mesh:
    # a boolean union per limb, each limb anchored inside the wall and swelling
    # into a collar as it crosses the bark. This happens BEFORE the apertures are
    # cut, so no collar can grow back across the mouth of the flight shaft.
    fill_branch_tips()
    weld_limbs(trunk, build_limb_factories())
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = trunk

    # 3) re-hollow. A buttress or bough is thicker than the wall it grows out of,
    # so welding one in pushes wood back into the cavity; subtracting the same void
    # solid a second time clears the shaft again without touching the outside.
    apply_bool(trunk, build_void_object(grow=0.07, name='void2'), 'rehollow')

    # 4) drive the entrance shaft through the wall into the void
    ENT_ARGS = dict(ang=-math.pi / 2, z_c=ENT_Z, s_out=r_out_ent + 14.0, s_in=v_ent - 2.2,
                    rx=ENT_R * 0.97, rz=ENT_R * 1.14)
    apply_bool(trunk, make_slot('entrance_cut', flare=1.17, sides=18, seed=404, **ENT_ARGS), 'shaft')

    # 4) tall rift higher up so the trunk reads hollow from outside
    v_gash = void_radius(GASH_ANG, GASH_Z)
    GASH_ARGS = dict(ang=GASH_ANG, z_c=GASH_Z, s_out=r_smooth(GASH_ANG, GASH_Z) + 5.0,
                     s_in=v_gash - 1.2, rx=0.92, rz=4.3)
    apply_bool(trunk, make_slot('gash_cut', flare=1.10, sides=14, seed=77, **GASH_ARGS), 'gash')

    # kill zero-area faces, then triangulate: a non-planar quad exports one
    # polygon normal for two triangles, which can oppose the winding of one
    bm = bmesh.new()
    bm.from_mesh(trunk.data)
    # the boolean leaves sub-millimetre slivers at the shaft mouth; welding them
    # first stops triangulation from turning those ngons non-manifold
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=CLEAN_WELD)
    bmesh.ops.dissolve_degenerate(bm, dist=CLEAN_DEGEN, edges=bm.edges[:])
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='SHORT_EDGE', ngon_method='BEAUTY')
    repair_shell(bm)
    bm.to_mesh(trunk.data)
    bm.free()
    # validate() can itself drop a face the repair had just created, so alternate
    # the two until neither has anything left to do
    for _ in range(4):
        changed = trunk.data.validate(verbose=False)
        bm = bmesh.new()
        bm.from_mesh(trunk.data)
        b, n = repair_shell(bm)
        bm.to_mesh(trunk.data)
        bm.free()
        if not changed and b == 0 and n == 0:
            break

    trunk.data.materials.append(mat_bark)
    trunk.data.materials.append(mat_dark)
    shade_flat(trunk)

    # ---- tag every interior surface (inner shell + both shafts)
    me = trunk.data
    inside = set()
    for p in me.polygons:
        c = p.center
        cx, cy = centre(c.z)
        rc = math.hypot(c.x - cx, c.y - cy)
        ang = math.atan2(c.y - cy, c.x - cx)
        is_inner = (VOID_Z0 - 1.5 <= c.z <= VOID_Z1 + 2.5
                    and rc < r_smooth(ang, c.z) - wall(ang, c.z) * 0.45)
        if is_inner or in_slot(c, **ENT_ARGS) or in_slot(c, **GASH_ARGS):
            inside.add(p.index)
            p.material_index = 1
    print('interior faces:', len(inside))

    mouth = Vector((hx, y_surf, ENT_Z))

    def trunk_col(c, n, v, fi):
        z = v.z
        cx, cy = centre(z)
        rr = math.hypot(v.x - cx, v.y - cy)
        ang = math.atan2(v.y - cy, v.x - cx)

        if fi in inside:
            # hollow: dark, with a little bounce near the mouths
            dm = min((Vector(v) - mouth).length / 9.0, 1.0)
            near = (1.0 - smoothstep(dm)) * clamp(-n.y * 0.5 + 0.5) if v.y < cy else 0.0
            sill = clamp(n.z) * 0.45
            k = clamp(0.05 + 0.34 * near + 0.30 * sill)
            tint = [R_HOLLOW[i] + (1.0 - R_HOLLOW[i]) * k for i in range(3)]
            base = 0.55 + 0.30 * clamp(1.0 - dm)
            return [clamp(base * tint[i]) for i in range(3)]

        # ---- outside bark: smooth gradients only, no lattice
        dev = rr / max(r_smooth(ang, z), 0.4)
        m = 0.60 + 0.40 * smoothstep(z / 34.0)                  # ambient height gradient
        m *= 0.80 + 0.20 * clamp(n.z * 0.5 + 0.55)              # sky occlusion
        m *= clamp(1.0 + 1.15 * (dev - 1.0), 0.80, 1.10)        # crevice occlusion
        m *= 1.0 - 0.14 * smoothstep((z - 38.0) / 20.0)         # shade under the canopy
        # slow tonal drift so the sunlit plates are not all one value
        m *= 1.0 + 0.055 * math.sin(z * 0.093 + ang * 2.0 + 0.7) \
                 + 0.035 * math.sin(z * 0.031 - ang * 1.0)
        # soft shoulder instead of a hard clamp: multiplying by 1.24 and clipping
        # stacked a quarter of the bark on one value and killed every highlight
        m = shoulder(m * 1.24, 0.62)

        tone = list(R_BARK)
        if z < ROOT_H * 1.5:
            k = 0.55 * (1.0 - z / (ROOT_H * 1.5)) ** 1.2
            tone = list(blend(tone, R_DARK, k))
        d = math.hypot(v.x - hx, v.z - ENT_Z)
        dy = v.y - y_surf
        if d < 8.4 and dy < 1.6:
            near = clamp(1.0 - dy / 2.0)
            if d < 5.6:
                k = smoothstep((5.6 - d) / 1.9) * near
                tone = list(blend(tone, (1.0, 1.0, 1.0), k))
            else:
                k = smoothstep((8.4 - d) / 2.8) * near * 0.55
                tone = list(blend(tone, R_DARK, k * 0.8))
        hue = blend(HUE_COOL, HUE_WARM, smoothstep((m - 0.45) / 0.5))
        return [clamp(m * tone[i] * hue[i]) for i in range(3)]

    set_colors(trunk, trunk_col)

    # ---- canopy: leaf mass only
    fol = build_canopy_mesh()
    fol_ob = new_obj('canopy_foliage', fol)
    fol_ob.data.materials.append(mat_leaf)
    shade_flat(fol_ob)
    set_colors(fol_ob, canopy_col)

    ent = bpy.data.objects.new('entrance', None)
    ent.empty_display_type = 'ARROWS'
    ent.empty_display_size = 3.0
    bpy.context.collection.objects.link(ent)
    ent.location = (hx, y_surf, ENT_Z)

    print('TRIS trunk:', tri_count(trunk), 'canopy:', tri_count(fol_ob))
    return trunk, fol_ob, ent, inside


# ---------------------------------------------------------------- finishing
def fit_height(trunk, fol):
    zmax = -1e9
    zmin = 1e9
    for ob in (trunk, fol):
        for v in ob.data.vertices:
            zmax = max(zmax, v.co.z)
            zmin = min(zmin, v.co.z)
    print('raw bbox z: %.3f .. %.3f' % (zmin, zmax))
    for ob in (trunk, fol):
        for v in ob.data.vertices:
            if v.co.z < 0.0:
                v.co.z = 0.0
    delta = TOTAL_H - zmax
    for v in fol.data.vertices:
        v.co.z += delta * clamp((v.co.z - 40.0) / 25.0)
    print('height fit: delta=%.3f' % delta)


def place_entrance_empty(trunk, ent, interior):
    """anchor the empty on the aperture rim: the loop of verts shared by the
    tunnel wall and the outer bark. That is literally the mouth surface."""
    hx, hy = centre(ENT_Z)
    hits = []
    for f in (1.15, 1.30):
        for i in range(36):
            a = 2 * math.pi * i / 36
            px = hx + math.cos(a) * ENT_R * f
            pz = ENT_Z + math.sin(a) * ENT_R * f * 1.14
            ok, loc, nor, idx = trunk.ray_cast(Vector((px, -60.0, pz)), Vector((0, 1, 0)))
            # only front-wall hits count; a ray through the mouth lands deep inside
            if ok and loc.y < hy - 1.5:
                hits.append(loc.y)
    if hits:
        ent.location = (hx, sum(hits) / len(hits), ENT_Z)
    ok, loc, nor, idx = trunk.ray_cast(Vector((hx, -60.0, ENT_Z)), Vector((0, 1, 0)))
    print('entrance empty at', tuple(round(x, 3) for x in ent.location),
          '| bark ring around the mouth from %d hits | first solid on axis at y=%.3f'
          % (len(hits), loc.y if ok else float('nan')))


def localize_canopy(fol):
    """pivot node carries the transform; the mesh sits at identity under it"""
    zs = [v.co.z for v in fol.data.vertices]
    xs = [v.co.x for v in fol.data.vertices]
    ys = [v.co.y for v in fol.data.vertices]
    pivot = Vector((sum(xs) / len(xs), sum(ys) / len(ys), min(zs) - 1.0))
    for v in fol.data.vertices:
        v.co -= pivot
    canopy = bpy.data.objects.new('canopy', None)
    canopy.empty_display_type = 'PLAIN_AXES'
    canopy.empty_display_size = 5.0
    bpy.context.collection.objects.link(canopy)
    canopy.location = pivot
    bpy.context.view_layer.update()
    fol.parent = canopy
    fol.matrix_parent_inverse.identity()
    fol.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    print('canopy pivot', tuple(round(x, 3) for x in pivot))
    return canopy


def run():
    trunk, fol, ent, interior = build()
    fit_height(trunk, fol)
    place_entrance_empty(trunk, ent, interior)
    canopy = localize_canopy(fol)
    zs = [v.co.z for v in trunk.data.vertices] + \
         [v.co.z + canopy.location.z for v in fol.data.vertices]
    return {
        'trunk_tris': tri_count(trunk),
        'canopy_tris': tri_count(fol),
        'total_tris': tri_count(trunk) + tri_count(fol),
        'entrance': tuple(round(x, 3) for x in ent.location),
        'canopy_pivot': tuple(round(x, 3) for x in canopy.location),
        'objects': [o.name for o in bpy.data.objects],
        'materials': [m.name for m in bpy.data.materials],
        'zmin': round(min(zs), 4),
        'zmax': round(max(zs), 4),
    }
