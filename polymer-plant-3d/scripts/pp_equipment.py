"""
pp_equipment -- reusable industrial equipment for the polymer plant.

Every builder takes an `lod` of 'overview' | 'area' | 'machine':

    overview : one merged mesh, silhouette only -- enough to say "that is a silo"
    area     : several named parts, real nozzles / platforms / supports
    machine  : full detail (used by pp_machines for the two hero assets)

All builders return their root object and place their origin at the centre of
the footprint, on the ground, so plant / area / machine coordinates agree.
"""

import math
from mathutils import Vector, Euler
from pp_core import (MB, mat, mats, group, meta, dup, D2R, TAU,
                     pad, platform, stair, ladder, handrail_run, grating,
                     building, cable_tray, pipe_rack, road)

OVERVIEW = 'overview'


def segs(lod, base=24):
    return {'machine': base, 'area': max(10, base * 2 // 3), 'overview': max(8, base // 3)}[lod]


def detailed(lod):
    return lod != OVERVIEW


# ==========================================================================
# storage & material handling
# ==========================================================================

def silo(name, parent, loc, r=3.2, cyl_h=11.0, cone_h=3.4, leg_h=5.0, lod='area',
         collection=None, material='MAT_STAINLESS_BRUSHED', asset_id=None, rot=0.0):
    """Bulk polymer silo: skirt legs, conical discharge, shell, roof, ladder."""
    sg = segs(lod, 28)
    z_cone = leg_h
    z_cyl = leg_h + cone_h
    top = z_cyl + cyl_h

    b = MB()
    b.cone(0.32, r * 0.98, cone_h, (0, 0, z_cone + cone_h / 2), segs=sg, mi=0)   # hopper
    b.cyl(r, cyl_h, (0, 0, z_cyl + cyl_h / 2), segs=sg, mi=0)                    # shell
    b.cone(r * 0.99, r * 0.28, 1.15, (0, 0, top + 0.575), segs=sg, mi=0)         # roof
    b.cyl(r * 0.30, 0.35, (0, 0, top + 1.30), segs=sg, mi=1)                     # roof vent
    b.cyl(r * 0.34, 0.10, (0, 0, top + 1.50), segs=sg, mi=1)
    b.cyl(0.34, 0.55, (0, 0, z_cone - 0.05), segs=max(8, sg // 2), mi=1)         # outlet spool
    # legs
    nlegs = 4 if lod == OVERVIEW else 6
    for i in range(nlegs):
        a = TAU * i / nlegs + math.pi / nlegs
        p = Vector((r * 0.86 * math.cos(a), r * 0.86 * math.sin(a), 0))
        b.seg(p, p + Vector((0, 0, z_cyl + 0.4)), 0.14, max(6, sg // 3), 1)
        if detailed(lod):
            b.cube((0.5, 0.5, 0.06), (p.x, p.y, 0.03), mi=1)
    if detailed(lod):
        # ring bracing + shell stiffeners
        for zz in (leg_h * 0.42, leg_h * 0.86):
            pts = []
            for i in range(nlegs + 1):
                a = TAU * (i % nlegs) / nlegs + math.pi / nlegs
                pts.append((r * 0.86 * math.cos(a), r * 0.86 * math.sin(a), zz))
            for i in range(nlegs):
                b.seg(pts[i], pts[i + 1], 0.05, 6, 1)
        for k in range(3):
            b.tube(r + 0.05, r, 0.14, (0, 0, z_cyl + cyl_h * (k + 1) / 4.0), segs=sg, mi=1)
        b.cube((0.7, 0.5, 0.9), (r * 0.55, -r * 0.75, z_cyl + cyl_h * 0.55), mi=2)  # level sensor box
    obj = b.finish(name, mats(material, 'MAT_STEEL_CARBON', 'MAT_PAINT_GRAPHITE'),
                   parent, collection, loc, (0, 0, rot))
    if asset_id:
        meta(obj, asset_id=asset_id, object_type='equipment', display_name=name.replace('_', ' ').title())
    if detailed(lod):
        ladder(name + '_LADDER', top - 0.5,
               (loc[0] + (r + 0.35) * math.cos(rot + 2.6), loc[1] + (r + 0.35) * math.sin(rot + 2.6), 0),
               (0, 0, rot + 2.6 + math.pi), parent, collection=collection)
    return obj


def surge_hopper(name, parent, loc, w=2.2, h_cone=1.8, h_body=1.4, leg_h=3.6,
                 lod='area', collection=None, rot=0.0, material='MAT_STAINLESS'):
    """Square-to-round surge hopper on legs -- what a rotary airlock hangs off."""
    sg = segs(lod, 20)
    b = MB()
    zc = leg_h
    b.prism([(-w / 2, -w / 2), (w / 2, -w / 2), (w / 2, w / 2), (-w / 2, w / 2)],
            h_body, (0, 0, zc + h_cone + h_body / 2), mi=0)
    # pyramidal cone: stacked frusta keep it cheap and read correctly
    n = 4 if detailed(lod) else 2
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        s0 = w * (1 - t0) + 0.42 * t0
        s1 = w * (1 - t1) + 0.42 * t1
        zz = zc + h_cone * (1 - t1)
        hh = h_cone / n
        b.prism([(-s1 / 2, -s1 / 2), (s1 / 2, -s1 / 2), (s1 / 2, s1 / 2), (-s1 / 2, s1 / 2)],
                hh * 1.02, (0, 0, zz + hh / 2), mi=0)
        _ = s0
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = Vector((sx * w * 0.52, sy * w * 0.52, 0))
            b.seg(p, p + Vector((0, 0, zc + h_cone + h_body)), 0.075, 8, 1)
            if detailed(lod):
                b.cube((0.32, 0.32, 0.04), (p.x, p.y, 0.02), mi=1)
    if detailed(lod):
        for zz in (leg_h * 0.45,):
            c = [Vector((sx * w * 0.52, sy * w * 0.52, zz)) for sx, sy in
                 ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            for i in range(4):
                b.seg(c[i], c[(i + 1) % 4], 0.04, 6, 1)
    return b.finish(name, mats(material, 'MAT_STEEL_CARBON'), parent, collection, loc, (0, 0, rot))


def blower_package(name, parent, loc, lod='area', collection=None, rot=0.0):
    """Positive-displacement blower + motor + silencer on a skid."""
    sg = segs(lod, 18)
    b = MB()
    b.cube((2.6, 1.4, 0.18), (0, 0, 0.09), mi=1)                       # skid
    b.cube((0.95, 0.9, 0.85), (-0.6, 0, 0.62), mi=0)                   # blower body
    b.cyl(0.30, 1.05, (0.65, 0, 0.66), (0, D2R(90), 0), segs=sg, mi=2)  # motor
    if detailed(lod):
        b.cyl(0.33, 0.10, (0.18, 0, 0.66), (0, D2R(90), 0), segs=sg, mi=2)
        b.cube((0.26, 0.24, 0.20), (0.65, 0.26, 0.95), mi=2)           # terminal box
        b.cyl(0.22, 0.9, (-0.6, 0.85, 0.62), segs=sg, mi=1)            # inlet silencer
        b.cyl(0.22, 0.9, (-0.6, -0.85, 0.62), segs=sg, mi=1)           # outlet silencer
        b.pipe([(-0.6, 0.85, 1.07), (-0.6, 0.85, 1.5)], 0.09, 10, mi=1)
        b.cube((2.7, 1.5, 0.06), (0, 0, 0.0), mi=3)                    # anti-vib mat
        for sx in (-1, 1):
            for sy in (-1, 1):
                b.cube((0.18, 0.18, 0.10), (sx * 1.15, sy * 0.6, 0.05), mi=3)
    return b.finish(name, mats('MAT_PAINT_GREY', 'MAT_STEEL_CARBON', 'MAT_PAINT_BLUE', 'MAT_RUBBER'),
                    parent, collection, loc, (0, 0, rot))


def dust_collector(name, parent, loc, r=1.5, lod='area', collection=None, rot=0.0):
    """Cartridge dust collector: filter housing, hopper, fan, stack."""
    sg = segs(lod, 22)
    b = MB()
    leg = 2.6
    b.cone(0.35, r, 1.5, (0, 0, leg + 0.75), segs=sg, mi=0)
    b.cyl(r, 3.2, (0, 0, leg + 1.5 + 1.6), segs=sg, mi=0)
    b.cone(r, r * 0.45, 0.6, (0, 0, leg + 4.7 + 0.3), segs=sg, mi=0)
    b.cyl(0.45, 2.2, (0, 0, leg + 5.0 + 1.1), segs=sg, mi=1)          # stack
    b.cyl(0.52, 0.12, (0, 0, leg + 7.2), segs=sg, mi=1)
    for i in range(4):
        a = TAU * i / 4 + 0.78
        p = Vector((r * 0.8 * math.cos(a), r * 0.8 * math.sin(a), 0))
        b.seg(p, p + Vector((0, 0, leg + 1.5)), 0.09, 8, 1)
    if detailed(lod):
        b.cube((0.9, 0.5, 1.0), (r + 0.35, 0, leg + 3.0), mi=2)        # pulse manifold
        b.cyl(0.28, 0.7, (r + 0.35, 0, leg + 3.9), segs=12, mi=1)
        b.cube((0.6, 0.9, 0.9), (-r - 0.3, 0, leg + 2.2), mi=2)        # inlet plenum
        b.cyl(0.5, 0.5, (0, 0, leg - 0.25), segs=sg, mi=1)             # discharge airlock
        b.cyl(0.22, 0.45, (0.55, 0, leg - 0.25), (0, D2R(90), 0), segs=12, mi=2)
    return b.finish(name, mats('MAT_PAINT_LIGHT', 'MAT_STEEL_GALV', 'MAT_PAINT_GRAPHITE'),
                    parent, collection, loc, (0, 0, rot))


def drying_hopper(name, parent, loc, r=1.1, lod='area', collection=None, rot=0.0):
    """Insulated resin drying hopper with its dryer cabinet."""
    sg = segs(lod, 20)
    b = MB()
    leg = 2.4
    b.cone(0.24, r, 1.3, (0, 0, leg + 0.65), segs=sg, mi=0)
    b.cyl(r, 2.4, (0, 0, leg + 1.3 + 1.2), segs=sg, mi=0)
    b.cone(r, 0.3, 0.55, (0, 0, leg + 3.7 + 0.28), segs=sg, mi=0)
    b.cyl(0.26, 0.5, (0, 0, leg + 4.2), segs=sg, mi=1)
    for i in range(3):
        a = TAU * i / 3 + 0.5
        p = Vector((r * 0.8 * math.cos(a), r * 0.8 * math.sin(a), 0))
        b.seg(p, p + Vector((0, 0, leg + 1.3)), 0.08, 8, 1)
    b.cube((1.3, 1.0, 1.9), (r + 1.1, 0, 0.95), mi=2)                  # dryer cabinet
    if detailed(lod):
        b.cube((0.5, 0.06, 0.4), (r + 1.1, -0.53, 1.45), mi=3)         # HMI
        b.pipe([(r + 0.9, 0, 1.9), (r + 0.9, 0, leg + 0.3), (r * 0.4, 0, leg + 0.3)], 0.10, 10, mi=1)
        b.pipe([(r + 1.3, 0, 1.9), (r + 1.3, 0, leg + 2.4), (r * 0.9, 0, leg + 2.4)], 0.10, 10, mi=1)
    return b.finish(name, mats('MAT_INSULATION', 'MAT_STEEL_CARBON', 'MAT_PAINT_GRAPHITE', 'MAT_SCREEN'),
                    parent, collection, loc, (0, 0, rot))


def vacuum_receiver(name, parent, loc, r=0.42, lod='area', collection=None, rot=0.0):
    """Small vacuum take-off receiver that sits on a machine throat."""
    sg = segs(lod, 16)
    b = MB()
    b.cyl(r, 0.5, (0, 0, 0.25), segs=sg, mi=0)
    b.cone(r, r * 0.55, 0.3, (0, 0, 0.65), segs=sg, mi=0)
    b.cyl(r * 0.5, 0.22, (0, 0, 0.9), segs=sg, mi=1)
    if detailed(lod):
        b.cyl(r * 0.28, 0.3, (r * 0.6, 0, 0.62), (0, D2R(35), 0), segs=10, mi=1)
        b.cube((0.2, 0.16, 0.22), (0, r + 0.08, 0.62), mi=2)
    return b.finish(name, mats('MAT_STAINLESS', 'MAT_ALUMINIUM', 'MAT_PAINT_GRAPHITE'),
                    parent, collection, loc, (0, 0, rot))


def blender_unit(name, parent, loc, lod='area', collection=None, rot=0.0):
    """Gravimetric dosing blender: 4 hoppers, weigh chamber, mixer, controller."""
    sg = segs(lod, 14)
    b = MB()
    z = 1.9
    for i, (dx, dy, rr) in enumerate([(-0.42, -0.42, 0.34), (0.42, -0.42, 0.34),
                                      (-0.42, 0.42, 0.26), (0.42, 0.42, 0.26)]):
        b.cyl(rr, 0.75, (dx, dy, z + 1.0), segs=sg, mi=0)
        b.cone(rr, 0.08, 0.42, (dx, dy, z + 0.41), segs=sg, mi=0)
        if detailed(lod):
            b.cyl(rr * 0.7, 0.14, (dx, dy, z + 1.44), segs=sg, mi=1)
    b.cube((1.3, 1.3, 0.5), (0, 0, z + 0.05), mi=1)                    # weigh chamber
    b.cone(0.6, 0.16, 0.55, (0, 0, z - 0.47), segs=sg, mi=1)
    b.cyl(0.22, 0.55, (0, 0, z - 1.0), segs=sg, mi=1)                  # mixer
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = Vector((sx * 0.62, sy * 0.62, 0))
            b.seg(p, p + Vector((0, 0, z - 0.1)), 0.055, 6, 2)
    if detailed(lod):
        b.cube((0.42, 0.28, 0.55), (0.75, -0.62, z + 0.3), mi=3)       # controller
        b.cube((0.30, 0.04, 0.34), (0.75, -0.78, z + 0.36), mi=4)
    return b.finish(name, mats('MAT_STAINLESS', 'MAT_STAINLESS_BRUSHED', 'MAT_STEEL_CARBON',
                               'MAT_PAINT_GRAPHITE', 'MAT_SCREEN'),
                    parent, collection, loc, (0, 0, rot))


def bag_dump_station(name, parent, loc, lod='area', collection=None, rot=0.0):
    """Manual bag tip station with dust hood and platform."""
    b = MB()
    b.cube((2.0, 1.6, 1.1), (0, 0, 1.35), mi=0)                        # hood
    b.cube((1.9, 0.1, 1.0), (0, 0.75, 1.4), mi=1)
    b.cone(1.0, 0.22, 0.9, (0, 0, 0.45), segs=segs(lod, 14), mi=0)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = Vector((sx * 0.85, sy * 0.7, 0))
            b.seg(p, p + Vector((0, 0, 0.9)), 0.06, 6, 1)
    if detailed(lod):
        b.pipe([(0, 0.8, 2.0), (0, 1.8, 2.0), (0, 1.8, 3.2)], 0.14, 10, mi=1)
        b.cube((1.6, 0.9, 0.06), (0, -1.3, 0.45), mi=2)                # step platform
    return b.finish(name, mats('MAT_STAINLESS', 'MAT_STEEL_GALV', 'MAT_GRATING'),
                    parent, collection, loc, (0, 0, rot))


# ==========================================================================
# extrusion downstream
# ==========================================================================

def downstream_line(name, parent, loc, length=14.0, lod='area', collection=None, rot=0.0):
    """Vacuum calibration tank + spray cooling baths + haul-off + cutter."""
    sg = segs(lod, 16)
    b = MB()
    z = 1.02
    # vacuum calibration tank
    tl = length * 0.34
    b.cube((tl, 1.0, 0.85), (-length / 2 + tl / 2, 0, z + 0.42), mi=0)
    if detailed(lod):
        b.cube((tl * 0.8, 0.02, 0.42), (-length / 2 + tl / 2, -0.51, z + 0.5), mi=4)   # sight window
        for i in range(3):
            b.cyl(0.10, 0.55, (-length / 2 + tl * (i + 0.5) / 3, 0, z + 1.1), segs=10, mi=1)
        b.cube((0.9, 0.8, 1.0), (-length / 2 + tl / 2, 1.1, 0.5), mi=2)                # vacuum pump
    # cooling bath
    bl = length * 0.36
    bx = -length / 2 + tl + 0.35 + bl / 2
    b.cube((bl, 1.0, 0.8), (bx, 0, z + 0.40), mi=0)
    if detailed(lod):
        b.cube((bl * 0.86, 0.02, 0.38), (bx, -0.51, z + 0.48), mi=4)
        b.pipe([(bx - bl / 2, 0.62, z + 0.85), (bx + bl / 2, 0.62, z + 0.85)], 0.06, 8, mi=1)
    # haul-off (caterpillar)
    hx = length / 2 - 2.6
    b.cube((1.9, 1.0, 1.0), (hx, 0, z + 0.5), mi=2)
    if detailed(lod):
        for sy in (-1, 1):
            b.cyl(0.22, 0.5, (hx - 0.6, sy * 0.28, z + 0.5), (D2R(90), 0, 0), segs=12, mi=1)
            b.cyl(0.22, 0.5, (hx + 0.6, sy * 0.28, z + 0.5), (D2R(90), 0, 0), segs=12, mi=1)
    # cutter
    cx = length / 2 - 0.9
    b.cube((1.3, 1.1, 1.2), (cx, 0, z + 0.6), mi=2)
    if detailed(lod):
        b.cyl(0.35, 0.06, (cx, -0.58, z + 0.75), (D2R(90), 0, 0), segs=18, mi=1)
        b.cube((0.4, 0.06, 0.5), (cx, -0.6, z + 1.5), mi=5)            # small HMI
    # common base frame + legs
    b.cube((length, 1.25, 0.16), (0, 0, z - 0.08), mi=1)
    nleg = 4 if lod == OVERVIEW else int(length / 2.2)
    for i in range(nleg + 1):
        x = -length / 2 + length * i / nleg
        for sy in (-1, 1):
            b.seg(Vector((x, sy * 0.5, 0)), Vector((x, sy * 0.5, z - 0.16)), 0.055, 6, 1)
    return b.finish(name, mats('MAT_STAINLESS_BRUSHED', 'MAT_STEEL_CARBON', 'MAT_PAINT_LIGHT',
                               'MAT_PAINT_BLUE', 'MAT_GLASS', 'MAT_SCREEN'),
                    parent, collection, loc, (0, 0, rot))


def pelletizer(name, parent, loc, lod='area', collection=None, rot=0.0):
    """Strand pelletizer + classifier."""
    sg = segs(lod, 16)
    b = MB()
    b.cube((1.6, 1.3, 1.1), (0, 0, 1.35), mi=0)
    b.cyl(0.34, 1.1, (-0.2, 0, 1.35), (D2R(90), 0, 0), segs=sg, mi=1)
    b.cube((1.7, 1.4, 0.14), (0, 0, 0.75), mi=2)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = Vector((sx * 0.72, sy * 0.58, 0))
            b.seg(p, p + Vector((0, 0, 0.72)), 0.06, 6, 2)
    if detailed(lod):
        b.cube((1.0, 1.0, 0.6), (1.55, 0, 1.6), mi=0)                  # classifier
        b.pipe([(1.55, 0, 1.3), (1.55, 0, 0.4)], 0.12, 10, mi=1)
        b.cube((0.4, 0.05, 0.5), (0, -0.7, 1.9), mi=3)
    return b.finish(name, mats('MAT_PAINT_LIGHT', 'MAT_STAINLESS', 'MAT_STEEL_CARBON', 'MAT_SCREEN'),
                    parent, collection, loc, (0, 0, rot))


def winder(name, parent, loc, lod='area', collection=None, rot=0.0):
    """Dual-station take-up winder."""
    sg = segs(lod, 16)
    b = MB()
    b.cube((1.6, 1.8, 0.16), (0, 0, 0.08), mi=2)
    for sy in (-1, 1):
        b.cube((0.18, 1.7, 2.0), (sy * 0.6, 0, 1.1), mi=0)
    b.cyl(0.55, 1.1, (0, 0, 1.55), (0, D2R(90), 0), segs=sg, mi=1)
    if detailed(lod):
        b.cyl(0.55, 1.1, (0, 0, 0.75), (0, D2R(90), 0), segs=sg, mi=1)
        b.cube((0.45, 0.3, 0.6), (0, -1.0, 1.3), mi=3)
    return b.finish(name, mats('MAT_PAINT_LIGHT', 'MAT_STEEL_MACHINED', 'MAT_STEEL_CARBON', 'MAT_PAINT_GRAPHITE'),
                    parent, collection, loc, (0, 0, rot))


# ==========================================================================
# utilities
# ==========================================================================

def cooling_tower(name, parent, loc, w=4.2, d=4.2, h=5.0, cells=2, lod='area',
                  collection=None, rot=0.0):
    """Induced-draught cooling tower bank."""
    sg = segs(lod, 18)
    b = MB()
    total_w = w * cells
    b.cube((total_w, d, 0.35), (0, 0, 0.17), mi=2)                     # basin plinth
    b.cube((total_w, d, 1.5), (0, 0, 0.9), mi=1)                       # basin
    for c in range(cells):
        cx = -total_w / 2 + w * (c + 0.5)
        b.cube((w - 0.12, d - 0.12, h - 2.2), (cx, 0, 1.65 + (h - 2.2) / 2), mi=0)
        b.cyl(w * 0.42, 0.9, (cx, 0, h - 0.55 + 0.45), segs=sg, mi=0)  # fan stack
        b.tube(w * 0.44, w * 0.40, 0.35, (cx, 0, h + 0.05), segs=sg, mi=1)
        if detailed(lod):
            for i in range(4):
                a = TAU * i / 4
                b.cube((w * 0.36, 0.16, 0.04), (cx + math.cos(a) * w * 0.19,
                                                math.sin(a) * w * 0.19, h - 0.15),
                       (0, D2R(12), a), mi=3)                          # fan blades
            b.cyl(0.16, 0.4, (cx, 0, h - 0.2), segs=10, mi=3)
            for i in range(5):
                zz = 2.1 + i * 0.55
                b.cube((w - 0.2, 0.05, 0.30), (cx, d / 2 + 0.02, zz), (D2R(18), 0, 0), mi=1)  # louvres
    if detailed(lod):
        b.pipe([(-total_w / 2 - 0.9, 0, 0.7), (-total_w / 2 - 0.9, 0, h - 0.6),
                (-total_w / 2 + 0.4, 0, h - 0.6)], 0.16, 12, mi=4)     # hot water riser
        b.pipe([(total_w / 2 + 0.8, 0, 0.6), (total_w / 2 + 0.8, -d, 0.6)], 0.20, 12, mi=4)
    return b.finish(name, mats('MAT_PAINT_LIGHT', 'MAT_STEEL_GALV', 'MAT_CONCRETE',
                               'MAT_ALUMINIUM', 'MAT_ACCENT_BLUE'),
                    parent, collection, loc, (0, 0, rot))


def chiller(name, parent, loc, w=4.6, d=2.2, h=2.3, lod='area', collection=None, rot=0.0):
    """Packaged air-cooled process chiller."""
    sg = segs(lod, 16)
    b = MB()
    b.cube((w, d, 0.2), (0, 0, 0.1), mi=2)
    b.cube((w, d, h - 0.5), (0, 0, 0.2 + (h - 0.5) / 2), mi=0)
    for i in range(2):
        cx = -w / 4 + i * w / 2
        b.cyl(d * 0.42, 0.28, (cx, 0, h + 0.05), segs=sg, mi=1)
        if detailed(lod):
            for k in range(3):
                a = TAU * k / 3
                b.cube((d * 0.36, 0.14, 0.03), (cx + math.cos(a) * d * 0.19,
                                                math.sin(a) * d * 0.19, h + 0.06),
                       (0, D2R(14), a), mi=3)
    if detailed(lod):
        b.cube((w * 0.3, 0.06, h * 0.5), (-w * 0.32, -d / 2 - 0.04, h * 0.55), mi=4)  # panel
        b.cyl(0.10, 0.6, (w / 2 + 0.3, 0.4, 0.7), (0, D2R(90), 0), segs=10, mi=1)
        b.cyl(0.10, 0.6, (w / 2 + 0.3, -0.4, 0.7), (0, D2R(90), 0), segs=10, mi=1)
        for sy in (-1, 1):
            b.cube((w - 0.3, 0.04, h - 1.1), (0, sy * (d / 2 + 0.02), 0.35 + (h - 1.1) / 2), mi=1)
    return b.finish(name, mats('MAT_PAINT_LIGHT', 'MAT_STEEL_GALV', 'MAT_CONCRETE',
                               'MAT_PAINT_GRAPHITE', 'MAT_SCREEN'),
                    parent, collection, loc, (0, 0, rot))


def pump_skid(name, parent, loc, lod='area', collection=None, rot=0.0, size=1.0):
    """Centrifugal pump + motor on a plinth."""
    sg = segs(lod, 16)
    s = size
    b = MB()
    b.cube((2.0 * s, 0.95 * s, 0.28), (0, 0, 0.14), mi=2)
    b.cube((1.85 * s, 0.8 * s, 0.1), (0, 0, 0.33), mi=1)
    b.cyl(0.26 * s, 0.95 * s, (0.5 * s, 0, 0.66 * s), (0, D2R(90), 0), segs=sg, mi=0)  # motor
    if detailed(lod):
        for i in range(7):
            b.cube((0.04, 0.55 * s, 0.55 * s), (0.5 * s - 0.4 * s + i * 0.13 * s, 0, 0.66 * s), mi=0)
        b.cube((0.22, 0.2, 0.18), (0.5 * s, 0.25 * s, 0.95 * s), mi=0)
    b.cyl(0.30 * s, 0.34 * s, (-0.55 * s, 0, 0.66 * s), (0, D2R(90), 0), segs=sg, mi=3)  # volute
    b.sphere(0.32 * s, (-0.62 * s, 0, 0.66 * s), sg, mi=3)
    b.cyl(0.12 * s, 0.35 * s, (-0.62 * s, 0, 1.0 * s), segs=sg, mi=1)                    # discharge
    b.flange(0.19 * s, 0.04, (-0.62 * s, 0, 1.18 * s), segs=sg, mi=1, bolts=0)
    b.cyl(0.14 * s, 0.4 * s, (-1.0 * s, 0, 0.66 * s), (0, D2R(90), 0), segs=sg, mi=1)    # suction
    b.flange(0.21 * s, 0.04, (-1.2 * s, 0, 0.66 * s), (0, D2R(90), 0), segs=sg, mi=1, bolts=0)
    if detailed(lod):
        b.cube((0.3 * s, 0.35 * s, 0.30 * s), (0.0, 0, 0.78 * s), mi=4)   # coupling guard
    return b.finish(name, mats('MAT_PAINT_BLUE', 'MAT_STEEL_CARBON', 'MAT_CONCRETE',
                               'MAT_CAST_IRON', 'MAT_ACCENT_YELLOW'),
                    parent, collection, loc, (0, 0, rot))


def air_compressor(name, parent, loc, lod='area', collection=None, rot=0.0):
    """Packaged rotary-screw compressor cabinet."""
    b = MB()
    b.cube((2.6, 1.7, 0.18), (0, 0, 0.09), mi=2)
    b.cube((2.4, 1.55, 1.9), (0, 0, 0.18 + 0.95), mi=0)
    b.cube((2.5, 1.65, 0.12), (0, 0, 2.14), mi=1)
    if detailed(lod):
        b.cube((0.55, 0.05, 0.45), (-0.75, -0.8, 1.55), mi=3)          # controller
        for i in range(6):
            b.cube((0.05, 1.4, 0.10), (0.35 + i * 0.16, 0, 1.0), mi=1)  # louvres
        b.cyl(0.09, 0.5, (1.3, 0.5, 0.6), (0, D2R(90), 0), segs=10, mi=1)
    return b.finish(name, mats('MAT_PAINT_GREY', 'MAT_PAINT_GRAPHITE', 'MAT_CONCRETE', 'MAT_SCREEN'),
                    parent, collection, loc, (0, 0, rot))


def vessel(name, parent, loc, r=0.9, h=4.0, lod='area', collection=None, rot=0.0,
           material='MAT_STEEL_BRIGHT', legs=True, nozzles=True):
    """Vertical pressure vessel (air receiver / surge drum) with dished heads."""
    sg = segs(lod, 20)
    b = MB()
    z0 = 0.9 if legs else 0.0
    b.cyl(r, h, (0, 0, z0 + h / 2), segs=sg, mi=0)
    b.sphere(r, (0, 0, z0 + h), sg, mi=0)
    b.sphere(r, (0, 0, z0), sg, mi=0)
    if legs:
        for i in range(3):
            a = TAU * i / 3 + 0.4
            p = Vector((r * 0.8 * math.cos(a), r * 0.8 * math.sin(a), 0))
            b.seg(p, p + Vector((0, 0, z0 + 0.3)), 0.07, 8, 1)
            if detailed(lod):
                b.cube((0.3, 0.3, 0.04), (p.x, p.y, 0.02), mi=1)
    if nozzles and detailed(lod):
        b.cyl(0.12, 0.4, (r * 0.9, 0, z0 + h * 0.85), (0, D2R(90), 0), segs=12, mi=1)
        b.flange(0.18, 0.04, (r + 0.18, 0, z0 + h * 0.85), (0, D2R(90), 0), segs=12, mi=1)
        b.cyl(0.12, 0.4, (r * 0.9, 0, z0 + h * 0.12), (0, D2R(90), 0), segs=12, mi=1)
        b.flange(0.18, 0.04, (r + 0.18, 0, z0 + h * 0.12), (0, D2R(90), 0), segs=12, mi=1)
        b.cyl(0.05, 0.35, (0, 0, z0 + h + r + 0.1), segs=8, mi=1)      # relief valve
        b.cube((0.16, 0.16, 0.2), (0, 0, z0 + h + r + 0.3), mi=2)
    return b.finish(name, mats(material, 'MAT_STEEL_CARBON', 'MAT_ACCENT_RED'),
                    parent, collection, loc, (0, 0, rot))


def heat_exchanger(name, parent, loc, r=0.55, L=3.4, lod='area', collection=None, rot=0.0):
    """Shell-and-tube exchanger on saddles."""
    sg = segs(lod, 18)
    b = MB()
    z = 1.1
    b.cyl(r, L, (0, 0, z), (0, D2R(90), 0), segs=sg, mi=0)
    b.flange(r * 1.15, 0.08, (-L / 2, 0, z), (0, D2R(90), 0), segs=sg, mi=1,
             bolts=0 if lod == OVERVIEW else 10, bolt_r=0.022, bolt_circle=r)
    b.flange(r * 1.15, 0.08, (L / 2, 0, z), (0, D2R(90), 0), segs=sg, mi=1,
             bolts=0 if lod == OVERVIEW else 10, bolt_r=0.022, bolt_circle=r)
    b.cyl(r * 0.95, 0.5, (-L / 2 - 0.28, 0, z), (0, D2R(90), 0), segs=sg, mi=1)
    for sx in (-1, 1):
        b.cube((0.35, r * 1.9, 0.12), (sx * L * 0.3, 0, z - r - 0.06), mi=2)
        b.cube((0.35, r * 1.6, z - r - 0.12), (sx * L * 0.3, 0, (z - r - 0.12) / 2), mi=2)
    if detailed(lod):
        for (px, pz) in ((-L * 0.36, r), (L * 0.36, r)):
            b.cyl(0.09, 0.3, (px, 0, z + pz + 0.1), segs=10, mi=1)
            b.flange(0.14, 0.03, (px, 0, z + pz + 0.26), segs=10, mi=1)
    return b.finish(name, mats('MAT_STEEL_BRIGHT', 'MAT_STEEL_CARBON', 'MAT_CONCRETE'),
                    parent, collection, loc, (0, 0, rot))


# ==========================================================================
# electrical
# ==========================================================================

def transformer(name, parent, loc, w=2.6, d=1.9, h=2.4, lod='area', collection=None, rot=0.0):
    """Oil-filled distribution transformer with radiators and bushings."""
    sg = segs(lod, 14)
    b = MB()
    b.cube((w + 1.2, d + 1.4, 0.3), (0, 0, 0.15), mi=2)                # bund plinth
    b.cube((w, d, h), (0, 0, 0.3 + h / 2), mi=0)
    b.cube((w * 0.92, d * 0.92, 0.18), (0, 0, 0.3 + h + 0.09), mi=1)   # tank cover
    b.cyl(0.22, 0.9, (-w * 0.28, 0, 0.3 + h + 0.6), segs=sg, mi=1)     # conservator
    for s, n, hh in ((-1, 3, 1.05), (1, 3, 0.75)):
        for i in range(n):
            x = -w * 0.28 + i * w * 0.28
            b.cyl(0.075, hh, (x, s * (d / 2 + 0.05), 0.3 + h + hh / 2), segs=10, mi=3)
            b.cyl(0.16, 0.10, (x, s * (d / 2 + 0.05), 0.3 + h + hh * 0.35), segs=10, mi=3)
            b.cyl(0.16, 0.10, (x, s * (d / 2 + 0.05), 0.3 + h + hh * 0.70), segs=10, mi=3)
    if detailed(lod):
        for sx in (-1, 1):                                             # radiator banks
            for i in range(7):
                b.cube((0.05, 0.55, h * 0.72), (sx * (w / 2 + 0.06), -d * 0.3 + i * 0.1 + 0.02,
                                                0.3 + h * 0.45), mi=1)
        b.cube((0.5, 0.1, 0.6), (w * 0.3, -d / 2 - 0.06, 0.3 + h * 0.5), mi=4)   # marshalling box
    return b.finish(name, mats('MAT_PAINT_GREY', 'MAT_STEEL_CARBON', 'MAT_CONCRETE',
                               'MAT_PLASTIC_GREY', 'MAT_PAINT_GRAPHITE'),
                    parent, collection, loc, (0, 0, rot))


def mcc_lineup(name, parent, loc, cubicles=6, lod='area', collection=None, rot=0.0,
               w=0.9, d=1.0, h=2.3):
    """Row of MCC / switchgear cubicles."""
    b = MB()
    W = w * cubicles
    b.cube((W + 0.2, d + 0.2, 0.12), (0, 0, 0.06), mi=2)
    b.cube((W, d, h), (0, 0, 0.12 + h / 2), mi=0)
    if detailed(lod):
        for i in range(cubicles):
            x = -W / 2 + w * (i + 0.5)
            b.cube((0.02, 0.02, h - 0.2), (x + w / 2, -d / 2 - 0.01, 0.12 + h / 2), mi=1)
            b.cube((w * 0.5, 0.03, 0.28), (x, -d / 2 - 0.02, 0.12 + h * 0.78), mi=3)
            for k in range(3):
                b.cyl(0.018, 0.03, (x - 0.1 + k * 0.1, -d / 2 - 0.03, 0.12 + h * 0.62),
                      (0, D2R(90), 0), segs=6, mi=4)
    return b.finish(name, mats('MAT_PAINT_LIGHT', 'MAT_PAINT_GRAPHITE', 'MAT_CONCRETE',
                               'MAT_SCREEN', 'MAT_ACCENT_GREEN'),
                    parent, collection, loc, (0, 0, rot))


def control_panel(name, parent, loc, w=0.9, d=0.55, h=2.0, lod='area', collection=None,
                  rot=0.0, hmi=True):
    """Free-standing machine control cabinet with HMI."""
    b = MB()
    b.cube((w, d, h), (0, 0, h / 2), mi=0)
    b.cube((w + 0.06, d + 0.06, 0.08), (0, 0, h + 0.04), mi=1)
    b.cube((w * 0.4, 0.06, 0.06), (0, 0, h + 0.12), mi=1)
    if hmi and detailed(lod):
        b.cube((w * 0.62, 0.05, 0.44), (0, -d / 2 - 0.03, h * 0.72), (D2R(-8), 0, 0), mi=2)
        b.cube((w * 0.54, 0.02, 0.34), (0, -d / 2 - 0.06, h * 0.72), (D2R(-8), 0, 0), mi=3)
        for i in range(4):
            b.cyl(0.022, 0.03, (-w * 0.28 + i * w * 0.18, -d / 2 - 0.02, h * 0.45),
                  (D2R(90), 0, 0), segs=8, mi=4)
        b.cyl(0.035, 0.04, (w * 0.32, -d / 2 - 0.02, h * 0.45), (D2R(90), 0, 0), segs=10, mi=5)
    return b.finish(name, mats('MAT_PAINT_LIGHT', 'MAT_PAINT_GRAPHITE', 'MAT_PAINT_DARK',
                               'MAT_SCREEN', 'MAT_ACCENT_GREEN', 'MAT_ACCENT_RED'),
                    parent, collection, loc, (0, 0, rot))


def light_mast(name, parent, loc, h=9.0, lod='area', collection=None, heads=2, rot=0.0):
    b = MB()
    b.cyl(0.30, 0.35, (0, 0, 0.17), segs=10, mi=1)
    b.cone(0.16, 0.10, h, (0, 0, h / 2), segs=8, mi=0)
    for i in range(heads):
        s = -1 if i % 2 else 1
        b.cube((0.45, 0.22, 0.10), (s * 0.35, 0, h - 0.1), (0, D2R(18) * s, 0), mi=0)
    return b.finish(name, mats('MAT_STEEL_GALV', 'MAT_CONCRETE'), parent, collection, loc, (0, 0, rot))


def fence(name, pts, parent, collection=None, h=2.4, material='MAT_STEEL_GALV'):
    b = MB()
    pts = [Vector((p[0], p[1], 0)) for p in pts]
    for i in range(len(pts) - 1):
        a, c = pts[i], pts[i + 1]
        d = c - a
        L = d.length
        if L < 1e-6:
            continue
        ang = math.atan2(d.y, d.x)
        mid = (a + c) / 2
        b.cube((L, 0.03, h - 0.35), mid + Vector((0, 0, 0.35 + (h - 0.35) / 2)), (0, 0, ang), mi=0)
        n = max(1, int(L / 2.6))
        for j in range(n + 1):
            p = a + d * (j / float(n))
            b.seg(p, p + Vector((0, 0, h)), 0.035, 6, 0)
    return b.finish(name, mat(material), parent, collection)


# ==========================================================================
# recycling / product handling
# ==========================================================================

def granulator(name, parent, loc, lod='area', collection=None, rot=0.0):
    """Beside-the-press granulator: feed hopper, cutting chamber, drive, bin."""
    sg = segs(lod, 16)
    b = MB()
    b.cube((1.9, 1.5, 0.16), (0, 0, 0.08), mi=2)
    b.cube((1.5, 1.3, 1.0), (0, 0, 1.25), mi=0)                        # cutting chamber
    b.prism([(-0.75, -0.65), (0.75, -0.65), (0.55, 0.65), (-0.55, 0.65)], 0.9,
            (0, 0, 2.2), mi=0)                                          # feed hopper
    b.cyl(0.34, 0.9, (1.35, 0, 1.15), (0, D2R(90), 0), segs=sg, mi=3)   # motor
    if detailed(lod):
        b.cube((0.5, 1.35, 0.9), (-1.0, 0, 1.25), mi=1)                # flywheel guard
        b.cyl(0.42, 0.14, (-1.15, 0, 1.25), (0, D2R(90), 0), segs=sg, mi=1)
        b.cube((1.0, 1.0, 0.75), (0, 0, 0.55), mi=1)                   # collection bin
        b.cube((0.35, 0.05, 0.4), (0.6, -0.7, 1.6), mi=4)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.seg(Vector((sx * 0.7, sy * 0.6, 0.16)), Vector((sx * 0.7, sy * 0.6, 0.75)), 0.06, 6, 2)
    return b.finish(name, mats('MAT_PAINT_GREY', 'MAT_STEEL_CARBON', 'MAT_CONCRETE',
                               'MAT_PAINT_BLUE', 'MAT_SCREEN'),
                    parent, collection, loc, (0, 0, rot))


def belt_conveyor(name, parent, loc, length=8.0, w=0.8, z0=0.9, z1=2.6, lod='area',
                  collection=None, rot=0.0):
    """Inclined belt conveyor running along local +X."""
    b = MB()
    ang = math.atan2(z1 - z0, length)
    L = math.hypot(z1 - z0, length)
    mid = Vector((length / 2, 0, (z0 + z1) / 2))
    b.cube((L, w + 0.16, 0.10), mid, (0, -ang, 0), mi=0)
    for s in (-1, 1):
        b.cube((L, 0.05, 0.22), mid + Vector((0, s * (w / 2 + 0.08), 0.13)), (0, -ang, 0), mi=1)
    b.cyl(w * 0.16, w + 0.1, (0, 0, z0), (D2R(90), 0, 0), segs=segs(lod, 14), mi=2)
    b.cyl(w * 0.16, w + 0.1, (length, 0, z1), (D2R(90), 0, 0), segs=segs(lod, 14), mi=2)
    nleg = 2 if lod == OVERVIEW else max(2, int(length / 3.0))
    for i in range(1, nleg + 1):
        x = length * i / (nleg + 1)
        zz = z0 + (z1 - z0) * i / (nleg + 1)
        for s in (-1, 1):
            b.seg(Vector((x, s * (w / 2 + 0.1), 0)), Vector((x, s * (w / 2 + 0.1), zz - 0.05)), 0.05, 6, 1)
    return b.finish(name, mats('MAT_RUBBER', 'MAT_STEEL_GALV', 'MAT_STEEL_MACHINED'),
                    parent, collection, loc, (0, 0, rot))


def palletiser(name, parent, loc, lod='area', collection=None, rot=0.0):
    """Robotic palletising cell: pedestal robot, infeed, pallet stations."""
    sg = segs(lod, 14)
    b = MB()
    b.cube((3.6, 3.0, 0.12), (0, 0, 0.06), mi=2)
    b.cyl(0.42, 0.7, (0, 0, 0.47), segs=sg, mi=0)                      # robot base
    b.cyl(0.34, 0.55, (0, 0, 1.05), segs=sg, mi=0)
    b.cube((0.34, 0.5, 1.5), (0.25, 0, 1.85), (0, D2R(22), 0), mi=0)   # lower arm
    b.cube((0.28, 0.4, 1.2), (0.95, 0, 2.55), (0, D2R(78), 0), mi=0)   # upper arm
    b.cube((0.7, 0.7, 0.16), (1.5, 0, 2.05), mi=1)                     # gripper
    if detailed(lod):
        b.cube((1.4, 1.0, 0.16), (-1.4, 1.1, 0.7), mi=1)               # infeed conveyor
        for i in range(4):
            b.cyl(0.08, 0.95, (-1.9 + i * 0.36, 1.1, 0.78), (D2R(90), 0, 0), segs=10, mi=3)
    return b.finish(name, mats('MAT_PAINT_GREY', 'MAT_PAINT_GRAPHITE', 'MAT_CONCRETE', 'MAT_STEEL_MACHINED'),
                    parent, collection, loc, (0, 0, rot))


def pallet_stack(name, parent, loc, nx=1, ny=1, layers=4, lod='area', collection=None, rot=0.0):
    """Stacked bagged product on pallets."""
    b = MB()
    for ix in range(nx):
        for iy in range(ny):
            ox, oy = ix * 1.3, iy * 1.15
            b.cube((1.2, 1.0, 0.14), (ox, oy, 0.07), mi=1)
            for k in range(layers):
                b.cube((1.16, 0.96, 0.22), (ox, oy, 0.14 + 0.115 + k * 0.23), mi=0)
    return b.finish(name, mats('MAT_PELLET', 'MAT_PAINT_GREY'), parent, collection, loc, (0, 0, rot))


def racking(name, parent, loc, bays=4, levels=3, lod='area', collection=None, rot=0.0,
            bay_w=2.7, depth=1.1, level_h=1.9):
    """Pallet racking run with stored product."""
    b = MB()
    W = bays * bay_w
    H = levels * level_h
    for i in range(bays + 1):
        x = -W / 2 + i * bay_w
        for sy in (-1, 1):
            b.cube((0.10, 0.10, H), (x, sy * depth / 2, H / 2), mi=0)
    for lv in range(1, levels + 1):
        z = lv * level_h
        for sy in (-1, 1):
            b.cube((W, 0.08, 0.14), (0, sy * depth / 2, z), mi=1)
    if detailed(lod):
        for lv in range(levels):
            for i in range(bays):
                x = -W / 2 + bay_w * (i + 0.5)
                b.cube((1.05, 0.95, 0.9), (x, 0, lv * level_h + 0.55), mi=2)
    return b.finish(name, mats('MAT_ACCENT_ORANGE', 'MAT_ACCENT_BLUE', 'MAT_PELLET'),
                    parent, collection, loc, (0, 0, rot))


def truck(name, parent, loc, lod='area', collection=None, rot=0.0, kind='tanker'):
    """Bulk tanker or box trailer -- gives the yard human scale."""
    sg = segs(lod, 14)
    b = MB()
    b.cube((2.4, 2.3, 1.3), (-3.4, 0, 1.5), mi=0)                      # cab
    b.cube((2.2, 2.2, 0.6), (-3.4, 0, 0.75), mi=1)
    b.cube((9.0, 2.4, 0.35), (1.2, 0, 1.0), mi=1)                      # chassis
    if kind == 'tanker':
        b.cyl(1.15, 7.6, (1.4, 0, 2.0), (0, D2R(90), 0), segs=sg, mi=2)
        b.sphere(1.15, (5.2, 0, 2.0), sg, mi=2)
        b.sphere(1.15, (-2.4, 0, 2.0), sg, mi=2)
        if detailed(lod):
            for i in range(3):
                b.cyl(0.28, 0.22, (-0.8 + i * 2.2, 0, 3.2), segs=10, mi=1)
    else:
        b.cube((8.6, 2.5, 2.7), (1.4, 0, 2.55), mi=2)
    for wx in (-3.4, 0.4, 1.9, 3.4):
        for sy in (-1, 1):
            b.cyl(0.52, 0.34, (wx, sy * 1.1, 0.52), (D2R(90), 0, 0), segs=sg, mi=3)
    return b.finish(name, mats('MAT_PAINT_LIGHT', 'MAT_PAINT_GRAPHITE',
                               'MAT_STAINLESS_BRUSHED' if kind == 'tanker' else 'MAT_PAINT_GREY',
                               'MAT_RUBBER'),
                    parent, collection, loc, (0, 0, rot))


def gantry_crane(name, parent, loc, span=12.0, height=6.0, lod='area', collection=None, rot=0.0):
    """Workshop gantry / overhead crane."""
    b = MB()
    for sx in (-1, 1):
        b.ibeam(height, 0.30, 0.20, loc=(sx * span / 2, 0, height / 2), axis='Z', mi=0)
    b.ibeam(span, 0.45, 0.26, loc=(0, 0, height), axis='X', mi=0)
    b.cube((1.4, 1.0, 0.7), (span * 0.12, 0, height - 0.55), mi=1)     # trolley + hoist
    b.seg(Vector((span * 0.12, 0, height - 0.9)), Vector((span * 0.12, 0, height - 3.2)), 0.03, 6, 2)
    b.cube((0.4, 0.25, 0.3), (span * 0.12, 0, height - 3.4), mi=2)
    return b.finish(name, mats('MAT_ACCENT_YELLOW', 'MAT_PAINT_GRAPHITE', 'MAT_STEEL_CARBON'),
                    parent, collection, loc, (0, 0, rot))
