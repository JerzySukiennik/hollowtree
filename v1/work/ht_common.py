"""Shared helpers for Hollowtree asset generation (run inside Blender)."""
import math
import bpy

# ---------- colour ----------

def hexc(h):
    return ((h >> 16 & 255) / 255.0, (h >> 8 & 255) / 255.0, (h & 255) / 255.0)


def s2l(c):
    out = []
    for v in c:
        v = max(0.0, min(1.0, v))
        out.append(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(lerp(c1[i], c2[i], t) for i in range(3))


def add(c1, c2, k=1.0):
    return tuple(min(1.0, c1[i] + c2[i] * k) for i in range(3))


def scale(c, k):
    return tuple(min(1.0, max(0.0, c[i] * k)) for i in range(3))


def clamp(v, a=0.0, b=1.0):
    return a if v < a else (b if v > b else v)


def smooth(e0, e1, x):
    t = clamp((x - e0) / (e1 - e0) if e1 != e0 else 0.0)
    return t * t * (3 - 2 * t)


# ---------- noise ----------

def _n(x, y, z, s):
    return (math.sin(x * 0.37 + s) * math.sin(y * 0.21 + s * 1.7)
            * math.sin(z * 0.29 + s * 2.3))


def fbm(x, y, z):
    return (_n(x, y, z, 1.0) * 0.5 + _n(x * 2.1, y * 1.9, z * 2.3, 3.4) * 0.3
            + _n(x * 4.3, y * 3.7, z * 4.1, 7.1) * 0.2)


# ---------- mesh builder ----------

class MeshBuild:
    """Collects verts/faces with an explicit desired-normal per face."""

    def __init__(self, xform=None):
        self.v = []
        self.f = []
        self.tint = []
        self.xform = xform

    def vert(self, p):
        self.v.append(tuple(self.xform(p) if self.xform else p))
        return len(self.v) - 1

    def face(self, idx, want_normal=None, tint=1.0):
        idx = list(idx)
        if want_normal is not None:
            if self.xform:
                want_normal = self.xform(want_normal)
            a, b, c = (self.v[idx[0]], self.v[idx[1]], self.v[idx[2]])
            ux, uy, uz = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
            vx, vy, vz = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
            nx, ny, nz = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
            if nx * want_normal[0] + ny * want_normal[1] + nz * want_normal[2] < 0:
                idx.reverse()
        self.f.append(tuple(idx))
        self.tint.append(tint)

    def tris(self):
        return sum(max(0, len(f) - 2) for f in self.f)


def make_object(name, build, color_fn, material):
    me = bpy.data.meshes.new(name)
    me.from_pydata(build.v, [], list(build.f))
    me.update()
    me.validate()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(material)

    col = me.color_attributes.new(name="Col", type='FLOAT_COLOR', domain='CORNER')
    # validate()/from_pydata may reorder polygons, so bind tints by vertex set
    tint_of = {}
    for f, t in zip(build.f, build.tint):
        tint_of[tuple(sorted(f))] = t
    cache = {}
    missing = 0
    for poly in me.polygons:
        key_f = tuple(sorted(poly.vertices))
        if key_f in tint_of:
            t = tint_of[key_f]
        else:
            t = 1.0
            missing += 1
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            key = vi
            if key not in cache:
                cache[key] = color_fn(me.vertices[vi].co)
            c = cache[key]
            if isinstance(t, (int, float)):
                c = (min(1.0, c[0] * t), min(1.0, c[1] * t), min(1.0, c[2] * t))
            else:
                c = (min(1.0, c[0] * t[0]), min(1.0, c[1] * t[1]), min(1.0, c[2] * t[2]))
            lin = s2l(c)
            col.data[li].color = (lin[0], lin[1], lin[2], 1.0)
    if missing:
        print(f'  [warn] {name}: {missing} faces without a tint binding')
    for poly in me.polygons:
        poly.use_smooth = False
    return ob


def vcol_material(name, emissive=0.0, rough=0.92):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = "Col"
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = rough
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    if emissive > 0.0:
        nt.links.new(attr.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = emissive
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


def g2b(p):
    """game-space (Y up, +Z entrance) -> blender-space (Z up)."""
    return (p[0], -p[2], p[1])


def b2g(p):
    return (p[0], p[2], -p[1])


def normalize_scene(objs, size, seat=('center', 'center', 'min')):
    """Scale the combined bbox of objs (blender axes) to exactly `size`."""
    import mathutils
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for ob in objs:
        for c in ob.bound_box:
            w = ob.matrix_world @ mathutils.Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
    cur = [mx[i] - mn[i] for i in range(3)]
    k = [size[i] / cur[i] if cur[i] > 1e-6 else 1.0 for i in range(3)]
    org = [(mn[i] if seat[i] == 'min' else (mn[i] + mx[i]) * 0.5) for i in range(3)]
    for ob in objs:
        for vt in ob.data.vertices:
            for i in range(3):
                vt.co[i] = (vt.co[i] - org[i]) * k[i]
        ob.data.update()
    return cur, k


def export_glb(path, objs):
    kw = dict(filepath=path, export_format='GLB', use_selection=False,
              export_apply=True, export_yup=True, export_cameras=False,
              export_lights=False, export_normals=True,
              export_vertex_color='ACTIVE')
    win = bpy.context.window_manager.windows[0]
    area = None
    for a in win.screen.areas:
        if a.type == 'VIEW_3D':
            area = a
            break
    ctx = dict(window=win, screen=win.screen)
    if area:
        ctx.update(area=area, region=area.regions[-1])
    with bpy.context.temp_override(**ctx):
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.export_scene.gltf(**kw)
