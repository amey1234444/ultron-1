# -*- coding: utf-8 -*-
"""Low-level mesh construction helpers used by every build_* module."""

import bpy, bmesh, math
from math import pi, sin, cos, acos, atan2, sqrt, radians
from mathutils import Matrix

TAU = 2.0 * pi

# ---------------------------------------------------------------------------
# scene / collection plumbing
# ---------------------------------------------------------------------------

def coll(name, parent=None):
    if name in bpy.data.collections:
        c = bpy.data.collections[name]
        return c
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    return c


def mk(name, verts, faces, mat=None, target=None, smooth_angle=radians(38),
       shade_smooth=True, merge=1e-5):
    """Build a mesh object from raw verts/faces and register it."""
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate(verbose=False)
    ob = bpy.data.objects.new(name, me)
    (target or bpy.context.scene.collection).objects.link(ob)

    if merge:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()

    if mat is not None:
        me.materials.append(mat)
    if shade_smooth:
        smooth_by_angle(ob, smooth_angle)
    return ob


def smooth_by_angle(ob, angle=radians(38)):
    """Blender 4.1+ dropped mesh.auto_smooth_angle; emulate with EDGE_SPLIT."""
    me = ob.data
    for p in me.polygons:
        p.use_smooth = True
    m = ob.modifiers.new("SmoothByAngle", 'EDGE_SPLIT')
    m.split_angle = angle
    m.use_edge_sharp = True


def bevel(ob, width=0.004, segments=2, angle=radians(38), clamp=True):
    m = ob.modifiers.new("Bevel", 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    m.angle_limit = angle
    m.miter_outer = 'MITER_ARC'
    if clamp:
        m.use_clamp_overlap = True
    try:
        ob.modifiers.move(len(ob.modifiers) - 1, 0)
    except Exception:
        pass
    return m


def apply_mods(ob):
    """Bake the modifier stack into the mesh without relying on an operator
    context (bpy.ops needs a 3D view, which a headless MCP call does not have)."""
    if not ob.modifiers:
        return ob
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    new = bpy.data.meshes.new_from_object(ev, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = new
    new.name = old.name
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def _delete(ob):
    me = ob.data
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    bpy.data.objects.remove(ob, do_unlink=True)
    if me and me.users == 0:
        bpy.data.meshes.remove(me)


def join(objs, name, mat=None, target=None):
    """Apply modifiers and merge a list of objects into one, operator-free."""
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    for o in objs:
        apply_mods(o)
    keep = objs[0]
    if len(objs) > 1:
        # gather the union of material slots first -- a fresh bmesh carries
        # face material_index but no slots, so they have to be remapped
        mats = []
        for o in objs:
            for ms in o.data.materials:
                if ms is not None and ms not in mats:
                    mats.append(ms)
        bm = bmesh.new()
        dg = bpy.context.evaluated_depsgraph_get()
        inv = keep.matrix_world.inverted()
        for o in objs:
            tmp = bpy.data.meshes.new_from_object(o.evaluated_get(dg), depsgraph=dg)
            tmp.transform(inv @ o.matrix_world)
            local = list(o.data.materials)
            remap = [mats.index(mt) if mt in mats else 0 for mt in local]
            if remap:
                for p in tmp.polygons:
                    p.material_index = remap[min(p.material_index, len(remap) - 1)]
            else:
                for p in tmp.polygons:
                    p.material_index = 0
            bm.from_mesh(tmp)
            bpy.data.meshes.remove(tmp)
        me = bpy.data.meshes.new(name)
        for mt in mats:
            me.materials.append(mt)
        bm.to_mesh(me)
        bm.free()
        old = keep.data
        keep.data = me
        if old.users == 0:
            bpy.data.meshes.remove(old)
        for o in objs[1:]:
            _delete(o)
    ob = keep
    ob.name = name
    ob.data.name = name
    if mat is not None:
        ob.data.materials.clear()
        ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    if target is not None:
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        target.objects.link(ob)
    return ob


def set_origin(ob, point):
    """Move the object origin to `point` without moving the geometry."""
    d = (point[0] - ob.location[0], point[1] - ob.location[1],
         point[2] - ob.location[2])
    ob.data.transform(Matrix.Translation((-d[0], -d[1], -d[2])))
    ob.location = point


# ---------------------------------------------------------------------------
# primitives -- built explicitly so the topology stays predictable
# ---------------------------------------------------------------------------

def box(name, center, size, mat=None, target=None, bev=0.005, seg=2):
    cx, cy, cz = center
    sx, sy, sz = size[0] * .5, size[1] * .5, size[2] * .5
    v = [(cx - sx, cy - sy, cz - sz), (cx + sx, cy - sy, cz - sz),
         (cx + sx, cy + sy, cz - sz), (cx - sx, cy + sy, cz - sz),
         (cx - sx, cy - sy, cz + sz), (cx + sx, cy - sy, cz + sz),
         (cx + sx, cy + sy, cz + sz), (cx - sx, cy + sy, cz + sz)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
         (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    ob = mk(name, v, f, mat, target)
    if bev:
        bevel(ob, bev, seg)
    return ob


def _axis_pt(axis, a, b, t):
    if axis == 'X':
        return (t, a, b)
    if axis == 'Y':
        return (a, t, b)
    return (a, b, t)


def _off(center, axis, d):
    i = {'X': 0, 'Y': 1, 'Z': 2}[axis]
    c = list(center)
    c[i] += d
    return tuple(c)


def lathe(name, profile, seg=48, axis='Z', origin=(0, 0, 0), arc=TAU,
          mat=None, target=None, bev=0.0, closed=True, smooth=radians(38),
          phase=0.0):
    """Revolve a 2-D profile [(r, t), ...] around `axis`.

    `r` is radial distance, `t` position along the axis.  `closed` treats the
    profile as a closed loop (solid of revolution with real wall thickness).
    """
    ox, oy, oz = origin
    n = len(profile)
    full = arc >= TAU - 1e-9
    steps = seg if full else seg + 1
    verts, faces = [], []
    for j in range(steps):
        ang = phase + arc * (j / seg)
        ca, sa = cos(ang), sin(ang)
        for (r, t) in profile:
            r = max(r, 1e-6)
            p = _axis_pt(axis, r * ca, r * sa, t)
            verts.append((p[0] + ox, p[1] + oy, p[2] + oz))
    jmax = steps if full else steps - 1
    rng = range(n) if closed else range(n - 1)
    for j in range(jmax):
        j2 = (j + 1) % steps
        for i in rng:
            i2 = (i + 1) % n
            faces.append((j * n + i, j * n + i2, j2 * n + i2, j2 * n + i))
    if not full and closed:
        faces.append(tuple(range(n - 1, -1, -1)))
        b = (steps - 1) * n
        faces.append(tuple(range(b, b + n)))
    ob = mk(name, verts, faces, mat, target, smooth_angle=smooth)
    if bev:
        bevel(ob, bev, 2)
    return ob


def cyl(name, r, length, axis='X', center=(0, 0, 0), seg=48, mat=None,
        target=None, bev=0.0, chamfer=0.0):
    h = length * .5
    if chamfer > 0:
        c = min(chamfer, r * .4, h * .4)
        prof = [(0, -h), (r - c, -h), (r, -h + c), (r, h - c), (r - c, h), (0, h)]
    else:
        prof = [(0, -h), (r, -h), (r, h), (0, h)]
    return lathe(name, prof, seg, axis, center, mat=mat, target=target,
                 bev=bev, closed=True)


def tube(name, r_out, r_in, length, axis='X', center=(0, 0, 0), seg=48,
         mat=None, target=None, bev=0.0):
    h = length * .5
    prof = [(r_in, -h), (r_out, -h), (r_out, h), (r_in, h)]
    return lathe(name, prof, seg, axis, center, mat=mat, target=target,
                 bev=bev, closed=True)


def frustum(name, r0, r1, length, axis='X', center=(0, 0, 0), seg=48,
            mat=None, target=None, bev=0.0):
    h = length * .5
    prof = [(1e-6, -h), (r0, -h), (r1, h), (1e-6, h)]
    return lathe(name, prof, seg, axis, center, mat=mat, target=target,
                 bev=bev, closed=True)


def ring_of(fn, count, radius, axis='Z', center=(0, 0, 0), start=0.0,
            arc=TAU, plane=None):
    """Call fn(i, (x, y, z)) `count` times around a circle. Returns the objects."""
    out = []
    for i in range(count):
        a = start + arc * (i / count if arc >= TAU - 1e-9 else i / max(1, count - 1))
        u, v = radius * cos(a), radius * sin(a)
        p = _axis_pt(plane or axis, u, v, 0.0)
        out.append(fn(i, (center[0] + p[0], center[1] + p[1], center[2] + p[2]), a))
    return [o for o in out if o]


# ---------------------------------------------------------------------------
# fasteners
# ---------------------------------------------------------------------------

def hex_head(name, r=0.011, h=0.009, axis='Z', center=(0, 0, 0), mat=None,
             target=None, washer=True):
    parts = [lathe(name + "_hd",
                   [(0, 0), (r * .92, 0), (r, h * .25), (r * .93, h), (0, h)],
                   6, axis, center, mat=mat, target=target, closed=True,
                   smooth=radians(20))]
    if washer:
        parts.append(cyl(name + "_wsh", r * 1.24, h * .3, axis,
                         _off(center, axis, -h * .15), 20, mat, target))
    return join(parts, name, mat, target)


def socket_screw(name, r=0.010, h=0.008, axis='Z', center=(0, 0, 0), mat=None,
                 target=None, dark=None):
    parts = [lathe(name + "_h",
                   [(0, 0), (r, 0), (r, h * .78), (r * .9, h), (r * .52, h)],
                   28, axis, center, mat=mat, target=target, closed=True)]
    rs = r * .52
    parts.append(lathe(name + "_s",
                       [(0, -h * .55), (rs, -h * .55), (rs, 0), (0, 0)],
                       6, axis, _off(center, axis, h), mat=(dark or mat),
                       target=target, closed=True, smooth=radians(20)))
    return join(parts, name, mat, target)


def pressure_boss(name, center, axis='Z', sign=1, mat=None, dark=None,
                  body_mat=None, target=None, boss_r=0.026, boss_h=0.030,
                  body_r=0.019, body_h=0.046, seg=40, capped=False):
    """Machined pressure tapping: threaded boss, shoulder, gasket, transducer.

    Used for P-INT-01/02 on the barrel underside and for P-SCR-IN / P-SCR-OUT
    on the screen-pack inlet and outlet adapters. `sign` is the direction the
    tapping faces along `axis` (+1 or -1) so the boss always sits on the
    correct surface normal.
    """
    parts = []
    # threaded boss rising off the parent surface
    parts.append(lathe(name + "_boss",
                       [(0, 0), (boss_r, 0), (boss_r, boss_h * .52),
                        (boss_r * .86, boss_h * .62), (boss_r * .86, boss_h),
                        (0, boss_h)],
                       seg, axis, center, mat=mat, target=target))
    # hex wrench flats on the shoulder
    parts.append(lathe(name + "_hex",
                       [(0, 0), (boss_r * .95, 0), (boss_r * .95, boss_h * .30),
                        (0, boss_h * .30)],
                       6, axis, _off(center, axis, sign * boss_h * .10),
                       mat=mat, target=target, smooth=radians(20)))
    # gasket / sealing washer at the root
    parts.append(lathe(name + "_gasket",
                       [(boss_r * .55, 0), (boss_r * 1.16, 0),
                        (boss_r * 1.16, boss_h * .10), (boss_r * .55, boss_h * .10)],
                       seg, axis, center, mat=(dark or mat), target=target))
    # transducer body
    top = _off(center, axis, sign * boss_h)
    parts.append(lathe(name + "_body",
                       [(0, 0), (body_r, 0), (body_r, body_h * .82),
                        (body_r * .78, body_h), (0, body_h)],
                       seg, axis, top, mat=(body_mat or mat), target=target))
    if capped:
        parts.append(lathe(name + "_cap",
                           [(0, 0), (body_r * .72, 0), (body_r * .72, 0.010),
                            (0, 0.010)],
                           seg, axis, _off(top, axis, sign * body_h),
                           mat=(dark or mat), target=target))
    else:
        # cable gland on the transducer head
        parts.append(lathe(name + "_gland",
                           [(0, 0), (body_r * .52, 0), (body_r * .52, 0.016),
                            (body_r * .40, 0.020), (0, 0.020)],
                           seg, axis, _off(top, axis, sign * body_h),
                           mat=(dark or mat), target=target))
    for p in parts:
        _mirror_along(p, center, axis, sign)
    return join(parts, name, None, target)


def _mirror_along(ob, center, axis, sign):
    """Flip a boss built along +axis so it points down / backwards."""
    if sign >= 0:
        return ob
    i = {'X': 0, 'Y': 1, 'Z': 2}[axis]
    piv = center[i]
    me = ob.data
    for v in me.vertices:
        v.co[i] = 2.0 * piv - v.co[i]
    me.flip_normals()
    return ob


def plug_cap(name, r=0.026, h=0.030, axis='Z', center=(0, 0, 0), mat=None,
             target=None, seg=32):
    """Raised circular cap / thermocouple boss found on the barrel top blocks."""
    prof = [(0, 0), (r * 1.12, 0), (r * 1.12, h * .18), (r, h * .26),
            (r, h * .82), (r * .86, h), (0, h)]
    return lathe(name, prof, seg, axis, center, mat=mat, target=target,
                 closed=True)


# ---------------------------------------------------------------------------
# Erdmenger fully-wiped bilobal screw profile
# ---------------------------------------------------------------------------

def erdmenger_profile(R, Ri, n=2, samples=20):
    """Exact self-wiping co-rotating screw cross-section.

    The flank is the true conjugate curve traced by the mating screw's tip as
    both screws co-rotate at equal speed:

        rho(t) = sqrt(C^2 + 2*C*R*cos t + R^2)
        psi(t) = atan2(R sin t, C + R cos t) - t

    evaluated from t0 = acos(-C/2R), where rho == R, to t = pi, where rho == Ri.
    Tip and root arcs close the profile.  Returns [(y, z), ...] in CCW order.
    """
    C = R + Ri
    k = C / (2.0 * R)
    if not (0.0 < k < 1.0):
        raise ValueError("R/Ri combination is not fully wipeable")
    a_flank = 2.0 * acos(k)
    a_tip = pi / n - a_flank
    if a_tip <= 0:
        raise ValueError("tip angle collapsed; increase Do/Di ratio")
    a_root = a_tip

    t0 = acos(-k)
    flank = []
    for i in range(samples + 1):
        t = t0 + (pi - t0) * (i / samples)
        rho = sqrt(C * C + 2.0 * C * R * cos(t) + R * R)
        psi = atan2(R * sin(t), C + R * cos(t)) - t
        flank.append((rho, psi))
    psi0 = flank[0][1]
    flank = [(rho, psi0 - psi) for (rho, psi) in flank]   # 0 -> +a_flank
    flank[0] = (R, 0.0)
    flank[-1] = (Ri, a_flank)

    pts = []
    period = TAU / n
    for lobe in range(n):
        base = lobe * period
        for i in range(samples + 1):                       # tip arc
            pts.append((R, base - a_tip * .5 + a_tip * (i / samples)))
        for (rho, dpsi) in flank[1:]:                      # descending flank
            pts.append((rho, base + a_tip * .5 + dpsi))
        rb = base + a_tip * .5 + a_flank
        for i in range(1, samples + 1):                    # root arc
            pts.append((Ri, rb + a_root * (i / samples)))
        rb2 = rb + a_root
        for i in range(len(flank) - 2, -1, -1):            # ascending flank
            rho, dpsi = flank[i]
            pts.append((rho, rb2 + (a_flank - dpsi)))
    return [(rho * cos(a), rho * sin(a)) for (rho, a) in pts]


def erdmenger_bore(R, Ri, n=2, samples=20, clearance=0.0015, vertical=False):
    """The figure-of-eight bore the screw pair sweeps, as a [(y, z), ...] loop.

    `vertical` rotates the pair of lobes 90 degrees so the bore stacks in Z,
    matching a vertically arranged screw pair.
    """
    C = R + Ri
    Rb = R + clearance
    d = C * .5
    half = acos(min(1.0, d / Rb))          # half angle of the intersection cut
    pts = []
    steps = samples * 4
    a0 = half
    a1 = TAU - half
    for i in range(steps + 1):             # right lobe (screw 2, +Y)
        a = a0 + (a1 - a0) * (i / steps)
        pts.append((d + Rb * cos(a), Rb * sin(a)))
    for i in range(steps + 1):             # left lobe (screw 1, -Y)
        a = a0 + (a1 - a0) * (i / steps)
        pts.append((-d - Rb * cos(a), -Rb * sin(a)))
    if vertical:
        # rotate +90 deg: (y, z) -> (-z, y); winding order is preserved
        pts = [(-z, y) for (y, z) in pts]
    return pts


def auger_profile(r_core, r_flight, half_deg=26.0, samples=48):
    """Single-flight metering-auger cross-section: core circle plus one lobe.

    Twist-extruding this produces a real solid helical flight around a core,
    which is what the main and side feeders use.
    """
    half = radians(half_deg)
    pts = []
    for i in range(samples):
        a = TAU * i / samples
        d = (a + pi) % TAU - pi
        if abs(d) < half:
            # smooth shoulder into the flight so the crest is not a spike
            k = 0.5 + 0.5 * cos(pi * abs(d) / half)
            r = r_core + (r_flight - r_core) * k
        else:
            r = r_core
        pts.append((r * cos(a), r * sin(a)))
    return pts


def twist_extrude(name, profile, x0, length, phase0=0.0, pitch=None,
                  slices=None, mat=None, target=None, axis_y=0.0, axis_z=0.0,
                  cap0=True, cap1=True, scale_fn=None, slices_per_turn=40,
                  closed_profile=True, flip=False):
    """Sweep a 2-D (y, z) profile along +X while rotating it about the X axis.

    pitch=None gives an untwisted prism (kneading discs).  Right-handed for a
    positive pitch.  Returns (object, end_phase) so element phases chain.
    """
    n = len(profile)
    if pitch:
        turns = abs(length / pitch)
        slices = slices or max(4, int(round(turns * slices_per_turn)))
    else:
        slices = slices or 2
    verts, faces = [], []
    for s in range(slices + 1):
        u = s / slices
        x = x0 + length * u
        ang = phase0 + (TAU * (length * u) / pitch if pitch else 0.0)
        ca, sa = cos(ang), sin(ang)
        sc = scale_fn(u) if scale_fn else 1.0
        for (py, pz) in profile:
            verts.append((x, (py * ca - pz * sa) * sc + axis_y,
                          (py * sa + pz * ca) * sc + axis_z))
    last = n if closed_profile else n - 1
    for s in range(slices):
        for i in range(last):
            i2 = (i + 1) % n
            q = (s * n + i, s * n + i2, (s + 1) * n + i2, (s + 1) * n + i)
            faces.append(q[::-1] if flip else q)
    if closed_profile:
        if cap0:
            faces.append(tuple(range(n - 1, -1, -1)))
        if cap1:
            b = slices * n
            faces.append(tuple(range(b, b + n)))
    ob = mk(name, verts, faces, mat, target, smooth_angle=radians(30),
            merge=0.0 if not closed_profile else 1e-5)
    return ob, phase0 + (TAU * length / pitch if pitch else 0.0)


def prism(name, profile, x0, length, mat=None, target=None, axis_y=0.0,
          axis_z=0.0, phase=0.0, smooth=radians(30)):
    """Straight extrusion of a (y, z) loop along X, rotated by `phase`."""
    ob, _ = twist_extrude(name, profile, x0, length, phase0=phase, pitch=None,
                          slices=1, mat=mat, target=target, axis_y=axis_y,
                          axis_z=axis_z)
    return ob
