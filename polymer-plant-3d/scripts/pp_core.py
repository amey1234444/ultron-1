"""
pp_core -- core toolkit for the polymer / plastics plant digital-twin asset library.

Conventions
-----------
* Units are metres. Blender is authored Z-up; GLB is exported +Y-up so the
  frontend (three.js) receives X right, Y up, Z toward camera.
* Every asset root sits at its own logical origin: the centre of the footprint
  at ground level. A machine authored here drops straight into its area slot.
* One mesh object per *named part*. Sub-primitives are accumulated into a single
  bmesh so a part is one draw call, not fifty.
* No pure white (#FFFFFF) or pure black (#000000) as a dominant surface -- every
  material is a controlled neutral so the asset reads on both light and dark UI.
"""

import bpy
import bmesh
import math
import os
import json
from mathutils import Vector, Matrix, Euler

TAU = math.pi * 2.0
D2R = math.radians


# --------------------------------------------------------------------------
# colour
# --------------------------------------------------------------------------

def _s2l(v):
    """sRGB 0-255 -> linear scene referred."""
    v = v / 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def hexc(h, a=1.0):
    h = h.lstrip('#')
    return (_s2l(int(h[0:2], 16)), _s2l(int(h[2:4], 16)), _s2l(int(h[4:6], 16)), a)


# --------------------------------------------------------------------------
# material library
#
# name: (hex, metallic, roughness, alpha)
#
# Luminance is deliberately held inside roughly 25%-88% sRGB so nothing
# dissolves into a white panel or a near-black panel. Accents are muted.
# --------------------------------------------------------------------------

MAT_SPECS = {
    # --- steels -----------------------------------------------------------
    'MAT_STAINLESS':        ('#BCC1C7', 1.00, 0.26, 1.0),
    'MAT_STAINLESS_BRUSHED':('#AEB4BA', 1.00, 0.38, 1.0),
    'MAT_STEEL_BRIGHT':     ('#C2C7CC', 1.00, 0.32, 1.0),
    'MAT_STEEL_CARBON':     ('#7E858C', 1.00, 0.55, 1.0),
    'MAT_STEEL_GALV':       ('#A9B0B6', 1.00, 0.48, 1.0),
    'MAT_STEEL_MACHINED':   ('#9AA1A8', 1.00, 0.22, 1.0),
    'MAT_ALUMINIUM':        ('#B4B9BE', 1.00, 0.40, 1.0),
    'MAT_CAST_IRON':        ('#6E747A', 0.85, 0.62, 1.0),
    'MAT_COPPER':           ('#9A6B4E', 1.00, 0.35, 1.0),

    # --- painted equipment ------------------------------------------------
    'MAT_PAINT_OFFWHITE':   ('#DAD9D2', 0.00, 0.42, 1.0),   # machine bodies
    'MAT_PAINT_LIGHT':      ('#C4C6C6', 0.00, 0.46, 1.0),
    'MAT_PAINT_GREY':       ('#9AA0A6', 0.00, 0.50, 1.0),
    'MAT_PAINT_GRAPHITE':   ('#4C5158', 0.00, 0.52, 1.0),
    'MAT_PAINT_DARK':       ('#34383D', 0.00, 0.55, 1.0),   # darkest neutral used
    'MAT_PAINT_BLUE':       ('#3C6C90', 0.00, 0.45, 1.0),   # machine frames
    'MAT_PAINT_BLUE_DEEP':  ('#2F5madeup', 0.00, 0.45, 1.0),

    # --- process / safety accents ----------------------------------------
    'MAT_ACCENT_YELLOW':    ('#C6A233', 0.00, 0.48, 1.0),
    'MAT_ACCENT_ORANGE':    ('#BE7A38', 0.00, 0.48, 1.0),
    'MAT_ACCENT_RED':       ('#A8463D', 0.00, 0.46, 1.0),
    'MAT_ACCENT_GREEN':     ('#4E8A60', 0.00, 0.48, 1.0),
    'MAT_ACCENT_BLUE':      ('#4A7FA4', 0.00, 0.44, 1.0),

    # --- civil ------------------------------------------------------------
    'MAT_CONCRETE':         ('#B0AEA7', 0.00, 0.88, 1.0),
    'MAT_CONCRETE_DARK':    ('#918F89', 0.00, 0.90, 1.0),
    'MAT_ASPHALT':          ('#6C7075', 0.00, 0.82, 1.0),
    'MAT_GROUND':           ('#9E9C93', 0.00, 0.94, 1.0),
    'MAT_GRASS':            ('#77836B', 0.00, 0.92, 1.0),

    # --- misc -------------------------------------------------------------
    'MAT_RUBBER':           ('#4E5257', 0.00, 0.86, 1.0),
    'MAT_PLASTIC_GREY':     ('#8B9096', 0.00, 0.55, 1.0),
    'MAT_PELLET':           ('#CFCCC2', 0.00, 0.60, 1.0),
    'MAT_GLASS':            ('#AEBAC2', 0.00, 0.10, 0.35),
    'MAT_SCREEN':           ('#3A4750', 0.00, 0.28, 1.0),
    'MAT_INSULATION':       ('#C9C6BC', 0.00, 0.72, 1.0),
    'MAT_GRATING':          ('#8E949A', 0.90, 0.62, 1.0),
    'MAT_CABLE':            ('#42474C', 0.00, 0.70, 1.0),
}

# fix the typo'd deep blue with a real value
MAT_SPECS['MAT_PAINT_BLUE_DEEP'] = ('#2F5877', 0.00, 0.45, 1.0)


def mat(name):
    """Fetch or lazily create a library material."""
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    if name not in MAT_SPECS:
        raise KeyError('unknown material %r' % name)
    col, metallic, rough, alpha = MAT_SPECS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    def setv(key, val):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = val
    setv('Base Color', hexc(col, alpha))
    setv('Metallic', metallic)
    setv('Roughness', rough)
    if alpha < 1.0:
        setv('Alpha', alpha)
        try:
            m.blend_method = 'BLEND'
        except (AttributeError, TypeError):
            pass
        try:
            m.surface_render_method = 'BLENDED'
        except (AttributeError, TypeError):
            pass
    # keep specular sane across versions
    for k in ('Specular IOR Level', 'Specular'):
        setv(k, 0.5)
    m.diffuse_color = hexc(col, alpha)
    m.metallic = metallic
    m.roughness = rough
    return m


def mats(*names):
    return [mat(n) for n in names]


# --------------------------------------------------------------------------
# scene plumbing
# --------------------------------------------------------------------------

def coll(name, parent=None):
    """Get or create a collection, linked under `parent` (or the scene)."""
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
    tgt = parent if parent is not None else bpy.context.scene.collection
    if c.name not in tgt.children:
        try:
            tgt.children.link(c)
        except RuntimeError:
            pass
    return c


def reset_scene():
    """Wipe the file back to an empty scene (keeps no default cube)."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras,
                bpy.data.lights, bpy.data.curves):
        for d in list(blk):
            if d.users == 0:
                blk.remove(d)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0


def group(name, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), collection=None, **meta_kw):
    """An empty that becomes a glTF node -- used for every hierarchy level."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 0.5
    e.location = loc
    e.rotation_euler = Euler(rot)
    tgt = collection if collection is not None else (
        parent.users_collection[0] if parent is not None else bpy.context.scene.collection)
    tgt.objects.link(e)
    if parent is not None:
        e.parent = parent
    if meta_kw:
        meta(e, **meta_kw)
    return e


def meta(obj, **kw):
    """Attach glTF `extras` metadata."""
    for k, v in kw.items():
        obj[k] = v
    return obj


def dup(src, name, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=None, collection=None):
    """Linked duplicate -- shares mesh data, so the GLB stores the mesh once."""
    o = bpy.data.objects.new(name, src.data)
    o.location = loc
    o.rotation_euler = Euler(rot)
    if scale is not None:
        o.scale = scale if hasattr(scale, '__len__') else (scale, scale, scale)
    tgt = collection if collection is not None else (
        parent.users_collection[0] if parent is not None else src.users_collection[0])
    tgt.objects.link(o)
    if parent is not None:
        o.parent = parent
    return o


# --------------------------------------------------------------------------
# transforms
# --------------------------------------------------------------------------

def MX(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return (Matrix.Translation(Vector(loc))
            @ Euler(rot).to_matrix().to_4x4()
            @ Matrix.Diagonal(Vector(scale).to_4d()))


def dir_matrix(a, b):
    """Matrix placing a Z-aligned primitive along segment a->b (centred)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    if L < 1e-9:
        return Matrix.Translation(a), 0.0
    q = d.to_track_quat('Z', 'Y')
    return Matrix.Translation((a + b) * 0.5) @ q.to_matrix().to_4x4(), L


# --------------------------------------------------------------------------
# MB -- the part builder
# --------------------------------------------------------------------------

class MB(object):
    """Accumulates primitives into one mesh, then emits one named object.

    Every primitive takes `mi`, the material slot index, so a part can carry a
    couple of materials (body + trim) without becoming two draw calls.
    """

    def __init__(self):
        self.bm = bmesh.new()

    # -- low level -------------------------------------------------------
    def _tag(self, res, mi):
        faces = set()
        for v in res.get('verts', ()):
            for f in v.link_faces:
                faces.add(f)
        for f in faces:
            f.material_index = mi
        return self

    def _emit(self, verts, faces, mx, mi):
        bm = self.bm
        vs = [bm.verts.new(mx @ Vector(v)) for v in verts]
        for f in faces:
            try:
                nf = bm.faces.new([vs[i] for i in f])
                nf.material_index = mi
            except ValueError:
                pass
        return self

    # -- primitives ------------------------------------------------------
    def cube(self, size=(1, 1, 1), loc=(0, 0, 0), rot=(0, 0, 0), mi=0):
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=MX(loc, rot, size))
        return self._tag(res, mi)

    def _cone(self, r1, r2, depth, segs, mx, cap=True):
        try:
            return bmesh.ops.create_cone(self.bm, cap_ends=cap, cap_tris=False,
                                         segments=segs, radius1=r1, radius2=r2,
                                         depth=depth, matrix=mx)
        except TypeError:
            return bmesh.ops.create_cone(self.bm, cap_ends=cap, cap_tris=False,
                                         segments=segs, diameter1=r1, diameter2=r2,
                                         depth=depth, matrix=mx)

    def cyl(self, r, h, loc=(0, 0, 0), rot=(0, 0, 0), segs=24, mi=0, cap=True):
        return self._tag(self._cone(r, r, h, segs, MX(loc, rot), cap), mi)

    def cone(self, r1, r2, h, loc=(0, 0, 0), rot=(0, 0, 0), segs=24, mi=0, cap=True):
        return self._tag(self._cone(r1, r2, h, segs, MX(loc, rot), cap), mi)

    def sphere(self, r, loc=(0, 0, 0), segs=16, mi=0):
        try:
            res = bmesh.ops.create_uvsphere(self.bm, u_segments=segs,
                                            v_segments=max(4, segs // 2),
                                            radius=r, matrix=MX(loc))
        except TypeError:
            res = bmesh.ops.create_uvsphere(self.bm, u_segments=segs,
                                            v_segments=max(4, segs // 2),
                                            diameter=r, matrix=MX(loc))
        return self._tag(res, mi)

    def tube(self, ro, ri, h, loc=(0, 0, 0), rot=(0, 0, 0), segs=24, mi=0, caps=True):
        """Hollow cylinder (pipe / shell / ring)."""
        verts, faces = [], []
        for i in range(segs):
            a = TAU * i / segs
            c, s = math.cos(a), math.sin(a)
            verts += [(ro * c, ro * s, -h / 2), (ro * c, ro * s, h / 2),
                      (ri * c, ri * s, -h / 2), (ri * c, ri * s, h / 2)]
        for i in range(segs):
            j = (i + 1) % segs
            a, b = i * 4, j * 4
            faces.append((a + 0, b + 0, b + 1, a + 1))      # outer wall
            faces.append((a + 3, b + 3, b + 2, a + 2))      # inner wall
            if caps:
                faces.append((a + 1, b + 1, b + 3, a + 3))  # top rim
                faces.append((a + 2, b + 2, b + 0, a + 0))  # bottom rim
        return self._emit(verts, faces, MX(loc, rot), mi)

    def disc(self, r, h, loc=(0, 0, 0), rot=(0, 0, 0), segs=24, mi=0):
        return self.cyl(r, h, loc, rot, segs, mi)

    def torus(self, R, r, loc=(0, 0, 0), rot=(0, 0, 0), seg_major=24, seg_minor=10,
              arc=TAU, mi=0):
        verts, faces = [], []
        closed = abs(arc - TAU) < 1e-6
        nmaj = seg_major if closed else seg_major + 1
        for i in range(nmaj):
            a = arc * i / seg_major
            ca, sa = math.cos(a), math.sin(a)
            for j in range(seg_minor):
                b = TAU * j / seg_minor
                cb, sb = math.cos(b), math.sin(b)
                verts.append(((R + r * cb) * ca, (R + r * cb) * sa, r * sb))
        rings = nmaj
        for i in range(rings if closed else rings - 1):
            i2 = (i + 1) % rings
            for j in range(seg_minor):
                j2 = (j + 1) % seg_minor
                faces.append((i * seg_minor + j, i2 * seg_minor + j,
                              i2 * seg_minor + j2, i * seg_minor + j2))
        return self._emit(verts, faces, MX(loc, rot), mi)

    # -- compound --------------------------------------------------------
    def seg(self, a, b, r, segs=12, mi=0, cap=True):
        """Cylinder spanning two points."""
        mx, L = dir_matrix(a, b)
        if L <= 0:
            return self
        return self._tag(self._cone(r, r, L, segs, mx, cap), mi)

    def pipe(self, pts, r, segs=12, mi=0, elbows=True, mx=None):
        """Polyline pipe run: straight cylinders plus spheres at every bend."""
        pts = [Vector(p) for p in pts]
        if mx is not None:
            pts = [mx @ p for p in pts]
        for i in range(len(pts) - 1):
            self.seg(pts[i], pts[i + 1], r, segs, mi)
        if elbows:
            for p in pts[1:-1]:
                self.sphere(r, p, max(8, segs), mi)
        return self

    def flange(self, ro, t, loc=(0, 0, 0), rot=(0, 0, 0), segs=24, mi=0,
               bolts=0, bolt_r=0.018, bolt_circle=None, bolt_h=0.022, bolt_mi=None):
        """Raised-face flange with an optional bolt circle."""
        self.cyl(ro, t, loc, rot, segs, mi)
        if bolts:
            bc = bolt_circle if bolt_circle is not None else ro * 0.80
            bmi = mi if bolt_mi is None else bolt_mi
            base = MX(loc, rot)
            for i in range(bolts):
                a = TAU * i / bolts
                p = base @ Vector((bc * math.cos(a), bc * math.sin(a), t / 2 + bolt_h / 2 - 0.001))
                q = base.to_quaternion().to_euler()
                self.cyl(bolt_r, bolt_h, p, q, 6, bmi)
                p2 = base @ Vector((bc * math.cos(a), bc * math.sin(a), -t / 2 - bolt_h / 2 + 0.001))
                self.cyl(bolt_r, bolt_h, p2, q, 6, bmi)
        return self

    def ibeam(self, length, h=0.30, w=0.16, tw=0.012, tf=0.018,
              loc=(0, 0, 0), rot=(0, 0, 0), mi=0, axis='X'):
        """I-section beam: section depth `h`, flange width `w`.

        The section is built with its length on local Z and its depth on local
        Y, then rotated so a horizontal beam always stands web-vertical.
        """
        # columns are the world images of local X (width), Y (depth), Z (length)
        pre3 = {
            'X': Matrix(((0, 0, 1), (1, 0, 0), (0, 1, 0))),   # length +X, depth +Z
            'Y': Matrix(((-1, 0, 0), (0, 0, 1), (0, 1, 0))),  # length +Y, depth +Z
            'Z': Matrix(((1, 0, 0), (0, 1, 0), (0, 0, 1))),   # column
        }[axis]
        base = MX(loc, rot) @ pre3.to_4x4()
        # built in local frame: length along Z, web in XZ
        def bx(size, off):
            res = bmesh.ops.create_cube(self.bm, size=1.0,
                                        matrix=base @ MX(off, (0, 0, 0), size))
            self._tag(res, mi)
        bx((w, tf, length), (0, h / 2 - tf / 2, 0))
        bx((w, tf, length), (0, -h / 2 + tf / 2, 0))
        bx((tw, h - 2 * tf, length), (0, 0, 0))
        return self

    def helix_flight(self, r_in, r_out, pitch, turns, thick, loc=(0, 0, 0),
                     rot=(0, 0, 0), segs_per_turn=28, mi=0, start_angle=0.0):
        """Real helical screw flight geometry.

        `r_in` and `r_out` may be callables of t in [0,1] so the channel depth
        can taper the way a compression screw actually does.
        """
        fi = r_in if callable(r_in) else (lambda t: r_in)
        fo = r_out if callable(r_out) else (lambda t: r_out)
        ft = thick if callable(thick) else (lambda t: thick)
        n = max(4, int(segs_per_turn * turns))
        verts, faces = [], []
        for i in range(n + 1):
            t = i / float(n)
            a = start_angle + TAU * turns * t
            z = pitch * turns * t
            ri, ro, th = fi(t), fo(t), ft(t)
            ca, sa = math.cos(a), math.sin(a)
            verts += [(ri * ca, ri * sa, z - th / 2), (ro * ca, ro * sa, z - th / 2),
                      (ro * ca, ro * sa, z + th / 2), (ri * ca, ri * sa, z + th / 2)]
        for i in range(n):
            a, b = i * 4, (i + 1) * 4
            for k in range(4):
                k2 = (k + 1) % 4
                faces.append((a + k, a + k2, b + k2, b + k))
        faces.append((0, 3, 2, 1))
        faces.append((n * 4 + 0, n * 4 + 1, n * 4 + 2, n * 4 + 3))
        return self._emit(verts, faces, MX(loc, rot), mi)

    def prism(self, profile, depth, loc=(0, 0, 0), rot=(0, 0, 0), mi=0, cap=True):
        """Extrude a closed 2D profile (list of (x,y)) along local Z."""
        n = len(profile)
        verts = [(x, y, -depth / 2) for (x, y) in profile] + \
                [(x, y, depth / 2) for (x, y) in profile]
        faces = []
        for i in range(n):
            j = (i + 1) % n
            faces.append((i, j, j + n, i + n))
        if cap:
            faces.append(tuple(range(n - 1, -1, -1)))
            faces.append(tuple(range(n, 2 * n)))
        return self._emit(verts, faces, MX(loc, rot), mi)

    # -- output ----------------------------------------------------------
    def finish(self, name, material, parent=None, collection=None,
               loc=(0, 0, 0), rot=(0, 0, 0), smooth_angle=34.0, **meta_kw):
        """Emit the accumulated geometry as one named object."""
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        if smooth_angle is not None:
            thr = math.radians(smooth_angle)
            for f in bm.faces:
                f.smooth = True
            for e in bm.edges:
                try:
                    e.smooth = e.calc_face_angle(0.0) < thr
                except Exception:
                    e.smooth = False
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        self.bm = None
        ob = bpy.data.objects.new(name, me)
        ob.location = loc
        ob.rotation_euler = Euler(rot)
        for m in (material if isinstance(material, (list, tuple)) else [material]):
            me.materials.append(m if not isinstance(m, str) else mat(m))
        tgt = collection if collection is not None else (
            parent.users_collection[0] if parent is not None else bpy.context.scene.collection)
        tgt.objects.link(ob)
        if parent is not None:
            ob.parent = parent
        if meta_kw:
            meta(ob, **meta_kw)
        return ob


# --------------------------------------------------------------------------
# structural / civil helpers  (each returns one object)
# --------------------------------------------------------------------------

def pad(name, sx, sy, t=0.35, loc=(0, 0, 0), rot=(0, 0, 0), parent=None,
        material='MAT_CONCRETE', chamfer=0.0, collection=None):
    """Concrete foundation slab, top face at loc.z."""
    b = MB()
    b.cube((sx, sy, t), (0, 0, -t / 2))
    if chamfer > 0:
        b.cube((sx + chamfer * 2, sy + chamfer * 2, t * 0.4), (0, 0, -t + t * 0.2))
    return b.finish(name, mat(material), parent, collection, loc, rot)


def road(name, pts, width=7.0, parent=None, material='MAT_ASPHALT', z=0.02,
         collection=None, kerb=True):
    """Flat road ribbon following a polyline of (x, y) points."""
    b = MB()
    pts = [Vector((p[0], p[1], z)) for p in pts]
    for i in range(len(pts) - 1):
        a, d = pts[i], pts[i + 1] - pts[i]
        L = d.length
        ang = math.atan2(d.y, d.x)
        c = (pts[i] + pts[i + 1]) / 2
        b.cube((L, width, 0.04), (c.x, c.y, z), (0, 0, ang), mi=0)
        if kerb:
            for s in (-1, 1):
                off = Vector((-math.sin(ang), math.cos(ang), 0)) * (width / 2 + 0.12) * s
                b.cube((L, 0.24, 0.14), (c.x + off.x, c.y + off.y, z + 0.03), (0, 0, ang), mi=1)
    for p in pts[1:-1]:
        b.cyl(width / 2, 0.04, (p.x, p.y, z), segs=12, mi=0)
    return b.finish(name, mats(material, 'MAT_CONCRETE'), parent, collection)


def grating(name, sx, sy, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, t=0.05,
            collection=None, material='MAT_GRATING'):
    b = MB()
    b.cube((sx, sy, t), (0, 0, -t / 2))
    return b.finish(name, mat(material), parent, collection, loc, rot)


def handrail_run(b, pts, height=1.10, post_every=1.8, r=0.024, mi=0, toe=True):
    """Add a handrail (2 rails + posts + toeboard) to an existing MB, in its frame."""
    pts = [Vector(p) for p in pts]
    total = 0.0
    for i in range(len(pts) - 1):
        a, c = pts[i], pts[i + 1]
        d = c - a
        L = d.length
        if L < 1e-6:
            continue
        for hz in (height, height * 0.52):
            b.seg(a + Vector((0, 0, hz)), c + Vector((0, 0, hz)), r, 8, mi)
        if toe:
            n = Vector((-d.y, d.x, 0))
            n = n.normalized() if n.length > 1e-6 else Vector((0, 1, 0))
            mid = (a + c) / 2 + Vector((0, 0, 0.06))
            b.cube((L, 0.02, 0.12), mid, (0, 0, math.atan2(d.y, d.x)), mi)
        k = max(1, int(round(L / post_every)))
        for j in range(k + 1):
            p = a + d * (j / float(k))
            if i > 0 and j == 0:
                continue
            b.seg(p, p + Vector((0, 0, height + r)), r * 1.15, 8, mi)
        total += L
    return b


def platform(name, sx, sy, z, loc=(0, 0, 0), rot=(0, 0, 0), parent=None,
             rails=(True, True, True, True), legs=True, collection=None,
             leg_r=0.07, deck_t=0.06):
    """Elevated grating platform with handrails and legs. `z` = deck top height."""
    b = MB()
    hx, hy = sx / 2, sy / 2
    b.cube((sx, sy, deck_t), (0, 0, z - deck_t / 2), mi=0)
    # edge beams
    b.cube((sx, 0.10, 0.20), (0, hy - 0.05, z - deck_t - 0.10), mi=1)
    b.cube((sx, 0.10, 0.20), (0, -hy + 0.05, z - deck_t - 0.10), mi=1)
    b.cube((0.10, sy, 0.20), (hx - 0.05, 0, z - deck_t - 0.10), mi=1)
    b.cube((0.10, sy, 0.20), (-hx + 0.05, 0, z - deck_t - 0.10), mi=1)
    if legs:
        for sxx in (-1, 1):
            for syy in (-1, 1):
                p = Vector((sxx * (hx - 0.25), syy * (hy - 0.25), 0))
                b.seg(p, p + Vector((0, 0, z - deck_t - 0.10)), leg_r, 10, 1)
    corners = [Vector((-hx, -hy, z)), Vector((hx, -hy, z)),
               Vector((hx, hy, z)), Vector((-hx, hy, z))]
    edges = [(0, 1), (1, 2), (2, 3), (3, 0)]
    for k, (i, j) in enumerate(edges):
        if rails[k]:
            handrail_run(b, [corners[i], corners[j]], mi=1)
    return b.finish(name, mats('MAT_GRATING', 'MAT_STEEL_GALV'), parent, collection, loc, rot)


def stair(name, top_z, run=None, width=1.0, loc=(0, 0, 0), rot=(0, 0, 0),
          parent=None, collection=None, rise=0.20):
    """Straight industrial stair climbing +X to `top_z` at 38 degrees."""
    n = max(2, int(round(top_z / rise)))
    rise = top_z / n
    going = rise / math.tan(math.radians(38))
    run = run if run is not None else going * n
    going = run / n
    b = MB()
    ang = math.atan2(top_z, run)
    L = math.hypot(top_z, run)
    for s in (-1, 1):
        b.cube((L, 0.05, 0.26), (run / 2, s * (width / 2 - 0.025), top_z / 2),
               (0, -ang, 0), mi=1)
    for i in range(n):
        b.cube((going * 0.92, width - 0.1, 0.045),
               (going * (i + 0.5), 0, rise * (i + 1) - 0.02), mi=0)
    for s in (-1, 1):
        a = Vector((0, s * (width / 2), 0))
        c = Vector((run, s * (width / 2), top_z))
        for hz in (1.05, 0.55):
            b.seg(a + Vector((0, 0, hz)), c + Vector((0, 0, hz)), 0.024, 8, 1)
        k = max(2, int(L / 1.6))
        for j in range(k + 1):
            p = a + (c - a) * (j / float(k))
            b.seg(p, p + Vector((0, 0, 1.05)), 0.028, 8, 1)
    return b.finish(name, mats('MAT_GRATING', 'MAT_STEEL_GALV'), parent, collection, loc, rot)


def ladder(name, height, loc=(0, 0, 0), rot=(0, 0, 0), parent=None,
           width=0.46, cage=True, collection=None):
    b = MB()
    for s in (-1, 1):
        b.seg((0, s * width / 2, 0), (0, s * width / 2, height), 0.026, 8, 0)
    n = int(height / 0.30)
    for i in range(1, n):
        z = i * 0.30
        b.seg((0, -width / 2, z), (0, width / 2, z), 0.014, 6, 0)
    if cage and height > 3.0:
        for i in range(int((height - 2.2) / 0.9)):
            z = 2.2 + i * 0.9
            b.torus(0.38, 0.018, (0.30, 0, z), (0, D2R(90), 0), 14, 6, arc=math.pi * 1.15, mi=0)
    return b.finish(name, mat('MAT_STEEL_GALV'), parent, collection, loc, rot)


def pipe_rack(name, length, width=6.0, height=6.5, bays=None, loc=(0, 0, 0),
              rot=(0, 0, 0), parent=None, collection=None, tiers=(3.6, 5.4, 6.5),
              lod='area'):
    """Classic portal-frame pipe rack running along local +X."""
    bays = bays if bays else max(2, int(length / 6.0))
    step = length / bays
    b = MB()
    for i in range(bays + 1):
        x = -length / 2 + i * step
        for s in (-1, 1):
            b.ibeam(height, 0.30, 0.18, loc=(x, s * width / 2, height / 2), axis='Z', mi=0)
        for tz in tiers:
            b.ibeam(width, 0.26, 0.16, loc=(x, 0, tz), axis='Y', mi=0)
    if lod != 'overview':
        for tz in tiers:
            for s in (-1, 1):
                b.ibeam(length, 0.18, 0.12, loc=(0, s * (width / 2 - 0.3), tz), axis='X', mi=0)
    return b.finish(name, mat('MAT_STEEL_CARBON'), parent, collection, loc, rot)


def cable_tray(name, pts, width=0.45, parent=None, collection=None, depth=0.10,
               material='MAT_STEEL_GALV'):
    """U-channel cable tray following a polyline of 3D points."""
    b = MB()
    pts = [Vector(p) for p in pts]
    for i in range(len(pts) - 1):
        a, c = pts[i], pts[i + 1]
        d = c - a
        L = d.length
        if L < 1e-6:
            continue
        ang = math.atan2(d.y, d.x)
        pitch = -math.asin(max(-1, min(1, d.z / L)))
        mid = (a + c) / 2
        b.cube((L, width, 0.012), mid, (0, pitch, ang), mi=0)
        n = Vector((-math.sin(ang), math.cos(ang), 0)) * (width / 2)
        for s in (-1, 1):
            b.cube((L, 0.012, depth), mid + n * s + Vector((0, 0, depth / 2)),
                   (0, pitch, ang), mi=0)
    return b.finish(name, mat(material), parent, collection)


def building(name, sx, sy, h, loc=(0, 0, 0), rot=(0, 0, 0), parent=None,
             collection=None, lod='area', roof='gable', roof_rise=2.2,
             body='MAT_PAINT_LIGHT', trim='MAT_PAINT_GRAPHITE', doors=2,
             windows=True, plinth=0.5):
    """Industrial clad building: plinth, ribbed walls, gable or flat roof."""
    b = MB()
    hx, hy = sx / 2, sy / 2
    wall_t = 0.18
    b.cube((sx + 0.4, sy + 0.4, plinth), (0, 0, plinth / 2), mi=2)      # plinth
    for s in (-1, 1):
        b.cube((sx, wall_t, h - plinth), (0, s * hy, plinth + (h - plinth) / 2), mi=0)
        b.cube((wall_t, sy, h - plinth), (s * hx, 0, plinth + (h - plinth) / 2), mi=0)
    if roof == 'gable':
        rr = roof_rise
        slope = math.atan2(rr, hy)
        L = math.hypot(rr, hy)
        for s in (-1, 1):
            # +Y half must fall as y grows, so the pitch is -s * slope
            b.cube((sx + 0.5, L, 0.12), (0, s * hy / 2, h + rr / 2), (-s * slope, 0, 0), mi=1)
        # gable end walls: profile in the YZ plane, extruded through the wall
        for s in (-1, 1):
            b.prism([(0, -hy), (0, hy), (-rr, 0)], wall_t,
                    (s * hx, 0, h), (0, D2R(90), 0), mi=0)
    else:
        b.cube((sx + 0.4, sy + 0.4, 0.22), (0, 0, h + 0.11), mi=1)
        b.cube((sx + 0.5, sy + 0.5, 0.30), (0, 0, h + 0.30), mi=1)      # parapet cap
    # ribs
    if lod != 'overview':
        n = max(3, int(sx / 2.4))
        for i in range(n + 1):
            x = -hx + sx * i / n
            for s in (-1, 1):
                b.cube((0.10, 0.06, h - plinth), (x, s * (hy + 0.02), plinth + (h - plinth) / 2), mi=1)
        n2 = max(3, int(sy / 2.4))
        for i in range(n2 + 1):
            y = -hy + sy * i / n2
            for s in (-1, 1):
                b.cube((0.06, 0.10, h - plinth), (s * (hx + 0.02), y, plinth + (h - plinth) / 2), mi=1)
    # roller doors
    for i in range(doors):
        dx = (-hx + sx * (i + 1) / (doors + 1))
        dh = min(h * 0.62, 5.0)
        b.cube((min(4.2, sx / (doors + 2)), 0.10, dh), (dx, -hy - 0.06, plinth * 0.2 + dh / 2), mi=1)
    if windows and lod != 'overview':
        bandz = h * 0.74
        for s in (-1, 1):
            b.cube((sx * 0.86, 0.06, 0.9), (0, s * (hy + 0.03), bandz), mi=3)
            b.cube((0.06, sy * 0.86, 0.9), (s * (hx + 0.03), 0, bandz), mi=3)
    return b.finish(name, mats(body, trim, 'MAT_CONCRETE', 'MAT_SCREEN'),
                    parent, collection, loc, rot)


# --------------------------------------------------------------------------
# cameras & lighting
# --------------------------------------------------------------------------

def add_camera(name, target, distance, azimuth=45.0, elevation=26.0, lens=42.0,
               parent=None, collection=None):
    """Three-quarter presentation camera aimed at `target`."""
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = lens
    cam_data.clip_start = 0.05
    cam_data.clip_end = 2000.0
    t = Vector(target)
    az, el = math.radians(azimuth), math.radians(elevation)
    pos = t + Vector((math.cos(az) * math.cos(el),
                      math.sin(az) * math.cos(el),
                      math.sin(el))) * distance
    cam = bpy.data.objects.new(name, cam_data)
    cam.location = pos
    direction = (t - pos)
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    tgt = collection if collection is not None else (
        parent.users_collection[0] if parent is not None else bpy.context.scene.collection)
    tgt.objects.link(cam)
    if parent is not None:
        cam.parent = parent
        cam.matrix_parent_inverse = parent.matrix_world.inverted()
    return cam


def setup_world(theme='light', strength=1.0):
    """Neutral studio world -- light or dark QA background."""
    scn = bpy.context.scene
    w = bpy.data.worlds.get('PP_WORLD') or bpy.data.worlds.new('PP_WORLD')
    scn.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new('ShaderNodeBackground')
    out = nt.nodes.new('ShaderNodeOutputWorld')
    sky = nt.nodes.new('ShaderNodeTexSky')
    if theme == 'light':
        bg.inputs['Color'].default_value = hexc('#E9EAEA')
        bg.inputs['Strength'].default_value = 1.05 * strength
    else:
        bg.inputs['Color'].default_value = hexc('#2A2E33')
        bg.inputs['Strength'].default_value = 0.65 * strength
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    nt.nodes.remove(sky)
    return w


def setup_lighting(name='PP_LIGHTS', sun_energy=3.2, collection=None):
    """Soft neutral daylight + fill + rim, tuned to read on both themes."""
    root = group(name, collection=collection)
    specs = [
        ('KEY_SUN', 'SUN', (60, -55, 70), sun_energy, '#FFF6E8', 2.5),
        ('FILL_SUN', 'SUN', (-70, 40, 55), sun_energy * 0.34, '#DCE6F2', 6.0),
        ('RIM_SUN', 'SUN', (10, 90, 30), sun_energy * 0.30, '#E6EEF8', 8.0),
    ]
    for lname, ltype, loc, energy, col, ang in specs:
        ld = bpy.data.lights.new(lname, ltype)
        ld.energy = energy
        ld.color = hexc(col)[:3]
        if ltype == 'SUN':
            ld.angle = math.radians(ang)
        lo = bpy.data.objects.new(lname, ld)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        (collection or bpy.context.scene.collection).objects.link(lo)
        lo.parent = root
    return root


def setup_render(res=(1600, 1000), samples=48, engine=None):
    scn = bpy.context.scene
    if engine is None:
        for e in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
            try:
                scn.render.engine = e
                engine = e
                break
            except Exception:
                continue
    else:
        scn.render.engine = engine
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    scn.render.film_transparent = False
    scn.render.image_settings.file_format = 'PNG'
    try:
        scn.view_settings.view_transform = 'AgX'
    except Exception:
        try:
            scn.view_settings.view_transform = 'Filmic'
        except Exception:
            pass
    scn.view_settings.look = 'None'
    scn.view_settings.exposure = 0.0
    scn.view_settings.gamma = 1.0
    ee = getattr(scn, 'eevee', None)
    if ee is not None:
        for attr, val in (('taa_render_samples', samples), ('use_gtao', True),
                          ('gtao_distance', 1.2), ('use_raytracing', True),
                          ('use_shadow_jitter_viewport', True)):
            try:
                setattr(ee, attr, val)
            except Exception:
                pass
    if scn.render.engine == 'CYCLES':
        scn.cycles.samples = samples
    return scn.render.engine


# --------------------------------------------------------------------------
# export
# --------------------------------------------------------------------------

def _select_tree(objs):
    bpy.ops.object.select_all(action='DESELECT')
    out = []

    def walk(o):
        out.append(o)
        for c in o.children:
            walk(c)
    for o in objs:
        walk(o)
    for o in out:
        try:
            o.hide_set(False)
        except Exception:
            pass
        o.hide_viewport = False
        o.select_set(True)
    if out:
        bpy.context.view_layer.objects.active = out[0]
    return out


def export_glb(roots, filepath, cameras=True):
    """Export a subtree to GLB with extras, +Y up, applied transforms."""
    roots = roots if isinstance(roots, (list, tuple)) else [roots]
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    sel = _select_tree(roots)
    kwargs = dict(
        filepath=filepath, export_format='GLB', use_selection=True,
        export_apply=True, export_extras=True, export_cameras=cameras,
        export_lights=False, export_yup=True, export_normals=True,
        export_texcoords=True, export_tangents=False, export_materials='EXPORT',
        export_animations=False, export_skins=False, export_morph=False,
        export_def_bones=False, export_hierarchy_flatten_objs=False,
        export_gn_mesh=False, export_optimize_animation_size=False,
        export_try_sparse_sk=False, will_save_settings=False,
    )
    props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    kwargs = {k: v for k, v in kwargs.items() if k in props}
    bpy.ops.export_scene.gltf(**kwargs)
    size = os.path.getsize(filepath) if os.path.exists(filepath) else 0
    tris = 0
    for o in sel:
        if o.type == 'MESH':
            me = o.data
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
    return {'file': os.path.basename(filepath), 'objects': len(sel),
            'tris': tris, 'kb': round(size / 1024.0, 1)}


def stats(roots):
    roots = roots if isinstance(roots, (list, tuple)) else [roots]
    objs, tris = 0, 0
    def walk(o):
        nonlocal objs, tris
        objs += 1
        if o.type == 'MESH':
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
        for c in o.children:
            walk(c)
    for r in roots:
        walk(r)
    return {'objects': objs, 'tris': tris}
