"""
pp_machines -- the two hero machines of the plant.

    SSE-001  Single Screw Extruder      (AREA-EXTRUSION-001)
    RAV-001  Rotary Airlock Valve       (AREA-MATERIAL-001)

Both builders accept an `lod`:

    'machine'  full part hierarchy, every component its own selectable node
    'area'     merged proxy, correct silhouette and footprint, ~1/8 the tris
    'overview' block-out silhouette only

The proxies carry the same asset_id + model_path metadata as the detailed
asset, so clicking the proxy in an area tells the frontend exactly which
machine GLB to load -- and because the proxy is authored from the same
dimensions at the same origin, the swap lands pixel-on-pixel.

Local frames
------------
SSE: +X is the direction of melt flow, origin at the base-frame footprint
     centre on the floor. Barrel centreline z = 1.30 m.
RAV: shaft on Y, material falls -Z, conveying line runs on X, origin at the
     support-frame footprint centre on the floor.
"""

import math
from mathutils import Vector, Euler
from pp_core import MB, mat, mats, group, meta, D2R, TAU, add_camera
from pp_equipment import segs, detailed, OVERVIEW

# --------------------------------------------------------------------------
# Single Screw Extruder -- key dimensions (metres)
# --------------------------------------------------------------------------
SSE = dict(
    cl=1.30,                 # barrel centreline height
    barrel_r=0.150,          # barrel OD/2
    bore_r=0.0755,           # bore = screw OD/2 + running clearance
    screw_r=0.0735,          # screw flight OD/2  (147 mm screw)
    feed_x0=-1.15, feed_x1=-0.55,
    barrel_x0=-0.55, barrel_x1=3.95,
    zones=6,
    frame_x0=-4.90, frame_x1=4.70,
    frame_top=0.95,
    motor_x=-4.00,
    gearbox_x=-2.42,
    thrust_x=-1.40,
    hopper_x=-0.85,
    die_x=4.86,
)


# ==========================================================================
# SINGLE SCREW EXTRUDER
# ==========================================================================

def build_sse(parent, loc=(0, 0, 0), rot=0.0, lod='machine', collection=None,
              asset_id='SSE-001', name='SSE_001', area_id='AREA-EXTRUSION-001',
              model_path='machines/single-screw-extruder.glb', add_cam=True):
    S = SSE
    cl = S['cl']
    root = group(name, parent, loc, (0, 0, rot), collection,
                 asset_id=asset_id, area_id=area_id, object_type='machine',
                 machine_type='single_screw_extruder',
                 display_name='Single Screw Extruder',
                 selectable=True, model_path=model_path,
                 lod=lod)
    P = dict(parent=root, collection=collection)

    if lod == OVERVIEW:
        return _sse_overview(root, S, collection, asset_id)
    if lod == 'area':
        return _sse_area(root, S, collection, asset_id)

    sg = 28
    # ---------------------------------------------------------------- frame
    b = MB()
    L = S['frame_x1'] - S['frame_x0']
    cx = (S['frame_x1'] + S['frame_x0']) / 2
    top = S['frame_top']
    for sy in (-1, 1):
        b.ibeam(L, 0.26, 0.16, loc=(cx, sy * 0.55, top - 0.13), axis='X', mi=0)
    nx = 7
    for i in range(nx + 1):
        x = S['frame_x0'] + L * i / nx
        b.ibeam(1.10, 0.22, 0.14, loc=(x, 0, top - 0.13), axis='Y', mi=0)
        for sy in (-1, 1):
            b.cube((0.16, 0.16, top - 0.30), (x, sy * 0.55, (top - 0.30) / 2), mi=0)
            b.cyl(0.10, 0.06, (x, sy * 0.55, 0.03), segs=12, mi=1)          # levelling foot
            b.cyl(0.045, 0.14, (x, sy * 0.55, 0.11), segs=10, mi=1)
    # drive bedplate
    b.cube((3.95, 1.30, 0.09), (-2.90, 0, top + 0.045), mi=0)
    b.cube((3.95, 0.10, 0.16), (-2.90, 0.60, top + 0.13), mi=0)
    b.cube((3.95, 0.10, 0.16), (-2.90, -0.60, top + 0.13), mi=0)
    # barrel support brackets
    for bx in (0.75, 2.15, 3.55):
        b.cube((0.16, 0.55, cl - 0.20 - top), (bx, 0, top + (cl - 0.20 - top) / 2), mi=0)
        b.cube((0.24, 0.62, 0.06), (bx, 0, cl - 0.185), mi=1)
        b.cube((0.20, 0.10, 0.24), (bx, 0.26, cl - 0.06), (D2R(0), 0, 0), mi=1)
        b.cube((0.20, 0.10, 0.24), (bx, -0.26, cl - 0.06), mi=1)
    b.cube((L + 0.1, 1.32, 0.03), (cx, 0, 0.015), mi=2)                     # machine base pad
    frame = b.finish(name + '_SUPPORT_FRAME',
                     mats('MAT_PAINT_BLUE', 'MAT_STEEL_MACHINED', 'MAT_CONCRETE'),
                     **P, object_type='machine_part', display_name='Support Frame')

    # --------------------------------------------------------------- motor
    b = MB()
    mx = S['motor_x']
    b.cyl(0.275, 1.02, (mx, 0, cl), (0, D2R(90), 0), segs=sg, mi=0)
    for i in range(24):                                                      # cooling fins
        a = TAU * i / 24
        b.cube((0.96, 0.024, 0.085), (mx, math.sin(a) * 0.30, cl + math.cos(a) * 0.30),
               (a, 0, 0), mi=0)
    b.cyl(0.235, 0.16, (mx + 0.55, 0, cl), (0, D2R(90), 0), segs=sg, mi=1)   # DE bracket
    b.cyl(0.235, 0.16, (mx - 0.55, 0, cl), (0, D2R(90), 0), segs=sg, mi=1)
    b.cyl(0.30, 0.26, (mx - 0.74, 0, cl), (0, D2R(90), 0), segs=sg, mi=1)    # fan cowl
    for i in range(16):                                                      # cowl grille
        a = TAU * i / 16
        b.cube((0.02, 0.05, 0.24), (mx - 0.87, math.sin(a) * 0.17, cl + math.cos(a) * 0.17),
               (a, 0, 0), mi=2)
    b.cyl(0.28, 0.03, (mx - 0.87, 0, cl), (0, D2R(90), 0), segs=sg, mi=2)
    b.cube((0.38, 0.34, 0.26), (mx + 0.05, 0, cl + 0.40), mi=0)              # terminal box
    b.cube((0.40, 0.36, 0.03), (mx + 0.05, 0, cl + 0.545), mi=1)
    b.cyl(0.035, 0.10, (mx + 0.05, -0.19, cl + 0.40), (D2R(90), 0, 0), segs=10, mi=1)
    for sy in (-1, 1):                                                       # feet
        b.cube((0.70, 0.14, 0.10), (mx, sy * 0.30, cl - 0.31), mi=0)
        b.cube((0.16, 0.30, 0.34), (mx + 0.30, sy * 0.26, cl - 0.44), mi=0)
        b.cube((0.16, 0.30, 0.34), (mx - 0.30, sy * 0.26, cl - 0.44), mi=0)
    b.cyl(0.055, 0.34, (mx + 0.68, 0, cl), (0, D2R(90), 0), segs=16, mi=3)   # shaft
    b.torus(0.10, 0.022, (mx, 0, cl + 0.44), (0, D2R(90), 0), 14, 8, arc=math.pi, mi=1)
    motor = b.finish(name + '_MOTOR',
                     mats('MAT_PAINT_BLUE_DEEP', 'MAT_CAST_IRON', 'MAT_PAINT_DARK',
                          'MAT_STEEL_MACHINED'),
                     **P, object_type='machine_part', display_name='Main Drive Motor',
                     rated_kw=160)

    # ------------------------------------------------------------ coupling
    b = MB()
    for hx in (-3.30, -3.02):
        b.cyl(0.135, 0.13, (hx, 0, cl), (0, D2R(90), 0), segs=sg, mi=0)
        b.cyl(0.155, 0.03, (hx + (0.055 if hx < -3.15 else -0.055), 0, cl),
              (0, D2R(90), 0), segs=sg, mi=0)
    b.cyl(0.115, 0.17, (-3.16, 0, cl), (0, D2R(90), 0), segs=sg, mi=1)       # elastomer element
    for i in range(8):
        a = TAU * i / 8
        b.cyl(0.018, 0.30, (-3.16, math.sin(a) * 0.095, cl + math.cos(a) * 0.095),
              (0, D2R(90), 0), segs=6, mi=0)
    coupling = b.finish(name + '_COUPLING', mats('MAT_STEEL_MACHINED', 'MAT_ACCENT_ORANGE'),
                        **P, object_type='machine_part', display_name='Drive Coupling')

    # ------------------------------------------------------------- gearbox
    b = MB()
    gx = S['gearbox_x']
    b.cube((1.46, 1.05, 1.16), (gx, 0, cl - 0.02), mi=0)
    b.cube((1.52, 1.11, 0.10), (gx, 0, cl - 0.60), mi=1)                     # base flange
    b.cube((1.30, 0.95, 0.09), (gx, 0, cl + 0.60), mi=1)                     # top cover
    for i in range(10):                                                       # cover bolts
        a = TAU * i / 10
        b.cyl(0.016, 0.03, (gx + math.cos(a) * 0.60, math.sin(a) * 0.42, cl + 0.655),
              segs=6, mi=1)
    b.cyl(0.185, 0.30, (gx - 0.86, 0, cl), (0, D2R(90), 0), segs=sg, mi=1)   # input shaft boss
    b.cyl(0.24, 0.60, (gx + 0.90, 0, cl), (0, D2R(90), 0), segs=sg, mi=1)    # output boss
    b.cyl(0.13, 0.34, (gx - 0.28, -0.60, cl - 0.30), (D2R(90), 0, 0), segs=18, mi=2)  # oil sight
    b.cyl(0.07, 0.22, (gx - 0.20, 0, cl + 0.72), segs=14, mi=1)              # breather
    b.cube((0.34, 0.20, 0.44), (gx + 0.45, 0.66, cl + 0.20), mi=3)           # oil cooler
    for i in range(6):
        b.cube((0.30, 0.03, 0.40), (gx + 0.45, 0.60 + i * 0.022, cl + 0.20), mi=3)
    b.cyl(0.045, 0.55, (gx + 0.20, 0.55, cl - 0.35), (0, D2R(90), 0), segs=10, mi=3)  # oil pipe
    b.pipe([(gx - 0.10, 0.62, cl - 0.35), (gx + 0.45, 0.62, cl - 0.35),
            (gx + 0.45, 0.62, cl - 0.02)], 0.035, 8, mi=3)
    for sy in (-1, 1):                                                        # lifting eyes
        b.torus(0.075, 0.020, (gx - 0.45, sy * 0.30, cl + 0.68), (0, D2R(90), 0), 12, 7,
                arc=math.pi, mi=1)
    b.cube((0.28, 0.22, 0.30), (gx - 0.62, -0.62, cl + 0.30), mi=4)          # oil temp switch
    gearbox = b.finish(name + '_GEARBOX',
                       mats('MAT_PAINT_OFFWHITE', 'MAT_CAST_IRON', 'MAT_GLASS',
                            'MAT_COPPER', 'MAT_PAINT_GRAPHITE'),
                       **P, object_type='machine_part', display_name='Reduction Gearbox',
                       ratio='16:1')

    # ------------------------------------------------- thrust bearing block
    b = MB()
    tx = S['thrust_x']
    b.cyl(0.245, 0.52, (tx, 0, cl), (0, D2R(90), 0), segs=sg, mi=0)
    b.flange(0.30, 0.055, (tx - 0.26, 0, cl), (0, D2R(90), 0), segs=sg, mi=1,
             bolts=8, bolt_r=0.020, bolt_circle=0.245, bolt_h=0.03)
    b.flange(0.30, 0.055, (tx + 0.26, 0, cl), (0, D2R(90), 0), segs=sg, mi=1,
             bolts=8, bolt_r=0.020, bolt_circle=0.245, bolt_h=0.03)
    b.cyl(0.05, 0.14, (tx, 0, cl + 0.27), segs=12, mi=1)                     # grease point
    b.cube((0.20, 0.16, 0.18), (tx, -0.26, cl + 0.10), mi=2)                 # vibration probe
    thrust = b.finish(name + '_THRUST_HOUSING',
                      mats('MAT_PAINT_OFFWHITE', 'MAT_STEEL_MACHINED', 'MAT_PAINT_GRAPHITE'),
                      **P, object_type='machine_part', display_name='Thrust Bearing Housing')

    # -------------------------------------------------------------- feeder
    b = MB()
    fx = (S['feed_x0'] + S['feed_x1']) / 2
    b.cube((0.60, 0.46, 0.46), (fx, 0, cl), mi=0)                            # water-cooled throat
    b.cyl(S['barrel_r'], 0.62, (fx, 0, cl), (0, D2R(90), 0), segs=sg, mi=0)
    b.cube((0.44, 0.44, 0.22), (S['hopper_x'], 0, cl + 0.30), mi=1)          # feed opening spool
    b.flange(0.28, 0.035, (S['hopper_x'], 0, cl + 0.42), segs=20, mi=1,
             bolts=8, bolt_r=0.014, bolt_circle=0.22, bolt_h=0.022)
    for i in range(5):                                                        # cooling jacket ribs
        b.tube(0.185, 0.152, 0.035, (fx - 0.24 + i * 0.12, 0, cl), (0, D2R(90), 0), segs=sg, mi=2)
    b.cyl(0.028, 0.30, (fx - 0.20, 0.28, cl + 0.10), (D2R(90), 0, 0), segs=10, mi=3)  # water in
    b.cyl(0.028, 0.30, (fx + 0.20, 0.28, cl + 0.10), (D2R(90), 0, 0), segs=10, mi=3)  # water out
    b.cube((0.30, 0.24, 0.26), (fx - 0.05, -0.42, cl + 0.02), mi=4)          # feed cooling controller
    # slide gate under the hopper
    b.cube((0.46, 0.52, 0.05), (S['hopper_x'], 0.12, cl + 0.46), mi=1)
    b.cyl(0.022, 0.26, (S['hopper_x'], 0.40, cl + 0.46), (D2R(90), 0, 0), segs=8, mi=1)
    feeder = b.finish(name + '_FEEDER',
                      mats('MAT_PAINT_OFFWHITE', 'MAT_STEEL_MACHINED', 'MAT_COPPER',
                           'MAT_ACCENT_BLUE', 'MAT_PAINT_GRAPHITE'),
                      **P, object_type='machine_part', display_name='Feed Section')

    # -------------------------------------------------------------- hopper
    b = MB()
    hx = S['hopper_x']
    z0 = cl + 0.50
    b.cone(0.17, 0.52, 0.85, (hx, 0, z0 + 0.425), segs=sg, mi=0)             # cone
    b.cyl(0.52, 0.80, (hx, 0, z0 + 0.85 + 0.40), segs=sg, mi=0)             # barrel
    b.tube(0.565, 0.52, 0.06, (hx, 0, z0 + 1.65), segs=sg, mi=1)            # top rim
    b.tube(0.545, 0.52, 0.05, (hx, 0, z0 + 0.87), segs=sg, mi=1)
    b.cyl(0.30, 0.06, (hx, 0, z0 + 1.70), segs=sg, mi=1)                    # lid
    b.cube((0.14, 0.06, 0.05), (hx + 0.34, 0, z0 + 1.70), mi=1)
    b.cube((0.16, 0.02, 0.34), (hx + 0.40, 0, z0 + 1.15), mi=2)             # sight glass
    b.cube((0.22, 0.20, 0.24), (hx - 0.46, 0.30, z0 + 1.30), mi=3)          # level sensor
    for sy in (-1, 1):                                                       # hopper support legs
        b.seg(Vector((hx - 0.42, sy * 0.34, cl + 0.44)), Vector((hx - 0.42, sy * 0.30, z0 + 0.55)),
              0.028, 8, 1)
        b.seg(Vector((hx + 0.42, sy * 0.34, cl + 0.44)), Vector((hx + 0.42, sy * 0.30, z0 + 0.55)),
              0.028, 8, 1)
    b.cyl(0.075, 0.30, (hx, -0.50, z0 + 1.35), (D2R(80), 0, 0), segs=14, mi=1)   # loader inlet
    hopper = b.finish(name + '_HOPPER',
                      mats('MAT_STAINLESS', 'MAT_STAINLESS_BRUSHED', 'MAT_GLASS',
                           'MAT_PAINT_GRAPHITE'),
                      **P, object_type='machine_part', display_name='Feed Hopper',
                      capacity_l=380)

    # -------------------------------------------------------------- barrel
    b = MB()
    bx0, bx1 = S['barrel_x0'], S['barrel_x1']
    b.tube(S['barrel_r'], S['bore_r'], bx1 - bx0, ((bx0 + bx1) / 2, 0, cl),
           (0, D2R(90), 0), segs=sg, mi=0)
    b.flange(0.24, 0.06, (bx1 + 0.03, 0, cl), (0, D2R(90), 0), segs=sg, mi=1,
             bolts=12, bolt_r=0.017, bolt_circle=0.195, bolt_h=0.028)
    b.flange(0.24, 0.06, (bx0 - 0.03, 0, cl), (0, D2R(90), 0), segs=sg, mi=1,
             bolts=12, bolt_r=0.017, bolt_circle=0.195, bolt_h=0.028)
    # vent port + rupture disc
    b.cyl(0.055, 0.14, (bx0 + 2.65, 0, cl + 0.16), segs=14, mi=1)
    b.cyl(0.085, 0.05, (bx0 + 2.65, 0, cl + 0.24), segs=14, mi=1)
    barrel = b.finish(name + '_BARREL',
                      mats('MAT_STEEL_MACHINED', 'MAT_STEEL_BRIGHT'),
                      **P, object_type='machine_part', display_name='Barrel',
                      bore_mm=147, l_over_d=30)

    # ------------------------------------------------- heating/cooling zones
    zl = (bx1 - bx0 - 0.25) / S['zones']
    zone_objs = []
    for i in range(S['zones']):
        zx = bx0 + 0.125 + zl * (i + 0.5)
        b = MB()
        b.tube(0.212, 0.152, zl * 0.62, (zx, 0, cl), (0, D2R(90), 0), segs=sg, mi=0)  # heater band
        for k in range(3):                                                             # band clamps
            b.tube(0.222, 0.208, 0.03, (zx - zl * 0.26 + k * zl * 0.26, 0, cl),
                   (0, D2R(90), 0), segs=sg, mi=1)
        # ventilated shroud (octagonal clamshell)
        prof = [(math.cos(TAU * k / 8 + math.pi / 8) * 0.265,
                 math.sin(TAU * k / 8 + math.pi / 8) * 0.265) for k in range(8)]
        profi = [(x * 0.90, y * 0.90) for (x, y) in prof]
        for k in range(8):
            k2 = (k + 1) % 8
            ax, ay = prof[k]
            bx_, by = prof[k2]
            cxp, cyp = (ax + bx_) / 2, (ay + by) / 2
            seglen = math.hypot(bx_ - ax, by - ay)
            ang = math.atan2(by - ay, bx_ - ax)
            b.cube((zl * 0.80, seglen, 0.016), (zx, cyp, cl + cxp),
                   (ang + math.pi / 2, 0, 0), mi=2)
        _ = profi
        b.cube((0.05, 0.50, 0.50), (zx - zl * 0.40, 0, cl), mi=2)
        b.cube((0.05, 0.50, 0.50), (zx + zl * 0.40, 0, cl), mi=2)
        # blower + duct
        b.cyl(0.105, 0.15, (zx, -0.30, cl - 0.33), segs=18, mi=3)
        b.cyl(0.115, 0.03, (zx, -0.30, cl - 0.41), segs=18, mi=1)
        b.cube((0.17, 0.14, 0.28), (zx, -0.26, cl - 0.17), (D2R(-18), 0, 0), mi=2)
        b.cube((0.20, 0.16, 0.05), (zx, -0.30, cl - 0.44), mi=4)             # blue mounting foot
        b.cube((zl * 0.86, 0.34, 0.06), (zx, 0, cl - 0.30), mi=4)
        # thermocouple + junction
        b.cyl(0.014, 0.20, (zx + zl * 0.18, 0.06, cl + 0.26), segs=8, mi=1)
        b.cube((0.10, 0.09, 0.10), (zx + zl * 0.18, 0.06, cl + 0.40), mi=5)
        zn = '%s_BARREL_ZONE_%02d' % (name, i + 1)
        zone_objs.append(b.finish(
            zn, mats('MAT_ALUMINIUM', 'MAT_STEEL_MACHINED', 'MAT_PAINT_LIGHT',
                     'MAT_PAINT_DARK', 'MAT_PAINT_BLUE', 'MAT_PAINT_GRAPHITE'),
            parent=barrel, collection=collection,
            object_type='machine_part', display_name='Barrel Zone %d' % (i + 1),
            zone_index=i + 1, selectable=True,
            asset_id='%s-Z%02d' % (asset_id, i + 1)))

    # --------------------------------------------------------------- screw
    b = MB()
    sx0, sx1 = S['feed_x0'] + 0.02, bx1 - 0.06
    # shank + keyed drive end
    b.cyl(0.058, 0.70, (sx0 - 0.35, 0, cl), (0, D2R(90), 0), segs=20, mi=0)
    b.cyl(0.072, 0.10, (sx0 - 0.04, 0, cl), (0, D2R(90), 0), segs=20, mi=0)
    # root: feed (deep channel) -> compression -> metering (shallow channel)
    r_feed, r_met = 0.0455, 0.0620
    x_c0, x_c1 = sx0 + 1.55, sx0 + 3.10
    b.cyl(r_feed, x_c0 - sx0, ((sx0 + x_c0) / 2, 0, cl), (0, D2R(90), 0), segs=20, mi=0)
    b.cone(r_feed, r_met, x_c1 - x_c0, ((x_c0 + x_c1) / 2, 0, cl), (0, D2R(90), 0), segs=20, mi=0)
    b.cyl(r_met, sx1 - x_c1, ((x_c1 + sx1) / 2, 0, cl), (0, D2R(90), 0), segs=20, mi=0)
    # real helical flight, pitch = 1 x diameter
    pitch = 0.147
    span = sx1 - sx0 - 0.10
    turns = span / pitch

    def root_r(t):
        x = sx0 + 0.05 + span * t
        if x <= x_c0:
            return r_feed
        if x >= x_c1:
            return r_met
        return r_feed + (r_met - r_feed) * (x - x_c0) / (x_c1 - x_c0)

    b.helix_flight(root_r, S['screw_r'], pitch, turns, 0.0165,
                   (sx0 + 0.05, 0, cl), (0, D2R(-90), 0), segs_per_turn=20, mi=1)
    b.cyl(0.030, 0.10, (sx1 + 0.02, 0, cl), (0, D2R(90), 0), segs=14, mi=1)   # screw tip
    b.cone(0.062, 0.012, 0.16, (sx1 + 0.10, 0, cl), (0, D2R(90), 0), segs=18, mi=1)
    screw = b.finish(name + '_SCREW',
                     mats('MAT_STEEL_MACHINED', 'MAT_STEEL_BRIGHT'),
                     **P, object_type='machine_part', display_name='Screw',
                     screw_dia_mm=147, l_over_d=30, note='nitrided compression screw')

    # ------------------------------------------- screen changer + die head
    b = MB()
    scx = bx1 + 0.28
    b.cube((0.38, 0.50, 0.62), (scx, 0, cl), mi=0)                            # screen changer body
    b.cyl(0.10, 0.62, (scx, 0.55, cl), (D2R(90), 0, 0), segs=20, mi=1)        # hydraulic ram
    b.cyl(0.13, 0.16, (scx, 0.84, cl), (D2R(90), 0, 0), segs=20, mi=1)
    b.cube((0.30, 0.14, 0.30), (scx, -0.36, cl), mi=1)                        # slide plate stub
    b.flange(0.235, 0.05, (scx + 0.22, 0, cl), (0, D2R(90), 0), segs=sg, mi=1,
             bolts=8, bolt_r=0.016, bolt_circle=0.19, bolt_h=0.026)
    ax = scx + 0.44
    b.cyl(0.20, 0.42, (ax, 0, cl), (0, D2R(90), 0), segs=sg, mi=0)            # adapter
    b.tube(0.215, 0.185, 0.09, (ax + 0.10, 0, cl), (0, D2R(90), 0), segs=sg, mi=2)  # heater band
    dx = S['die_x']
    b.cyl(0.26, 0.46, (dx, 0, cl), (0, D2R(90), 0), segs=sg, mi=0)            # die body
    b.flange(0.30, 0.07, (dx - 0.25, 0, cl), (0, D2R(90), 0), segs=sg, mi=1,
             bolts=12, bolt_r=0.019, bolt_circle=0.245, bolt_h=0.032)
    b.tube(0.275, 0.26, 0.12, (dx, 0, cl), (0, D2R(90), 0), segs=sg, mi=2)    # die heater
    b.cyl(0.21, 0.16, (dx + 0.30, 0, cl), (0, D2R(90), 0), segs=sg, mi=1)     # die lip retainer
    b.tube(0.205, 0.085, 0.05, (dx + 0.40, 0, cl), (0, D2R(90), 0), segs=sg, mi=3)
    for i in range(6):                                                         # centring bolts
        a = TAU * i / 6
        b.cyl(0.017, 0.09, (dx + 0.30, math.sin(a) * 0.185, cl + math.cos(a) * 0.185),
              (a, D2R(90), 0), segs=6, mi=1)
        b.cyl(0.017, 0.09, (dx + 0.30, math.sin(a) * 0.185, cl + math.cos(a) * 0.185),
              (a, 0, 0), segs=6, mi=1)
    b.cyl(0.028, 0.22, (dx - 0.10, 0, cl + 0.28), segs=10, mi=1)              # melt pressure tx
    b.cube((0.11, 0.10, 0.12), (dx - 0.10, 0, cl + 0.44), mi=4)
    b.cyl(0.026, 0.20, (scx - 0.10, 0, cl + 0.34), segs=10, mi=1)             # melt temp tx
    b.cube((0.10, 0.09, 0.11), (scx - 0.10, 0, cl + 0.48), mi=4)
    die = b.finish(name + '_DIE_HEAD',
                   mats('MAT_PAINT_OFFWHITE', 'MAT_STEEL_MACHINED', 'MAT_ALUMINIUM',
                        'MAT_STEEL_BRIGHT', 'MAT_PAINT_GRAPHITE'),
                   **P, object_type='machine_part', display_name='Die Head & Screen Changer')

    # ------------------------------------------------------- control panel
    b = MB()
    px, py = -3.10, 1.62
    b.cube((1.30, 0.62, 2.00), (px, py, 1.00), mi=0)
    b.cube((1.36, 0.68, 0.08), (px, py, 2.04), mi=1)
    b.cube((0.86, 0.05, 0.52), (px, py - 0.33, 1.52), (D2R(-9), 0, 0), mi=2)    # HMI bezel
    b.cube((0.78, 0.02, 0.44), (px, py - 0.36, 1.52), (D2R(-9), 0, 0), mi=3)    # screen
    for i in range(6):                                                          # zone controllers
        b.cube((0.16, 0.03, 0.11), (px - 0.44 + i * 0.175, py - 0.32, 1.10), mi=3)
    for i in range(4):
        b.cyl(0.024, 0.035, (px - 0.35 + i * 0.19, py - 0.32, 0.86),
              (D2R(90), 0, 0), segs=8, mi=4)
    b.cyl(0.055, 0.05, (px + 0.44, py - 0.32, 0.86), (D2R(90), 0, 0), segs=12, mi=5)  # e-stop
    b.cyl(0.075, 0.03, (px + 0.44, py - 0.34, 0.86), (D2R(90), 0, 0), segs=12, mi=6)
    b.cube((0.34, 0.30, 0.42), (px + 0.82, py, 0.60), mi=1)                     # drive cabinet stub
    b.cube((1.34, 0.66, 0.10), (px, py, 0.05), mi=1)                            # plinth
    panel = b.finish(name + '_CONTROL_PANEL',
                     mats('MAT_PAINT_LIGHT', 'MAT_PAINT_GRAPHITE', 'MAT_PAINT_DARK',
                          'MAT_SCREEN', 'MAT_ACCENT_GREEN', 'MAT_ACCENT_RED',
                          'MAT_ACCENT_YELLOW'),
                     **P, object_type='machine_part', display_name='Control Panel',
                     selectable=True)

    # ------------------------------------------------------------ guarding
    b = MB()
    b.cube((0.86, 0.60, 0.62), (-3.16, 0, cl), mi=0)                            # coupling guard
    b.cube((0.90, 0.64, 0.04), (-3.16, 0, cl + 0.33), mi=1)
    for i in range(7):
        b.cube((0.03, 0.62, 0.60), (-3.50 + i * 0.115, 0, cl), mi=1)
    b.cube((0.06, 0.06, 1.05), (S['frame_x0'] + 0.35, -0.95, 0.95 + 0.52), mi=1)  # e-stop post
    b.cyl(0.055, 0.05, (S['frame_x0'] + 0.35, -1.02, 1.90), (D2R(90), 0, 0), segs=12, mi=2)
    b.cube((0.40, 0.05, 0.30), (0.60, -0.95, 1.90), mi=0)                       # warning plate
    for gx2 in (1.30, 2.70):                                                    # barrel side guards
        b.cube((1.20, 0.03, 0.60), (gx2, -0.46, cl - 0.05), mi=1)
        b.cube((1.20, 0.03, 0.60), (gx2, 0.46, cl - 0.05), mi=1)
    guarding = b.finish(name + '_GUARDING',
                        mats('MAT_ACCENT_YELLOW', 'MAT_STEEL_GALV', 'MAT_ACCENT_RED'),
                        **P, object_type='machine_part', display_name='Safety Guarding')

    # --------------------------------------------------------- connections
    b = MB()
    # cooling water manifold along the operator side, with hoses to each zone
    b.cyl(0.045, 8.6, (0.10, -0.62, 0.72), (0, D2R(90), 0), segs=14, mi=0)
    b.cyl(0.045, 8.6, (0.10, -0.62, 0.58), (0, D2R(90), 0), segs=14, mi=0)
    for i in range(S['zones']):
        zx = bx0 + 0.125 + zl * (i + 0.5)
        b.pipe([(zx, -0.62, 0.72), (zx, -0.52, 0.95), (zx, -0.34, cl - 0.36)], 0.022, 8, mi=1)
        b.pipe([(zx + 0.08, -0.62, 0.58), (zx + 0.08, -0.46, 0.98), (zx + 0.08, -0.30, cl - 0.30)],
               0.022, 8, mi=1)
        b.cyl(0.035, 0.06, (zx, -0.62, 0.78), segs=10, mi=2)                    # isolation valve
        b.cube((0.05, 0.10, 0.02), (zx, -0.62, 0.83), mi=2)
    # cable tray from panel to drive + junction boxes
    b.cube((2.30, 0.34, 0.02), (-3.30, 1.05, 0.62), mi=3)
    for sy in (0.90, 1.20):
        b.cube((2.30, 0.02, 0.10), (-3.30, sy, 0.67), mi=3)
    b.pipe([(-3.10, 1.30, 0.62), (-3.10, 0.55, 0.62), (-3.95, 0.55, 0.62),
            (-3.95, 0.20, 1.15), (-3.95, 0.05, cl + 0.30)], 0.045, 8, mi=4)
    b.pipe([(-2.60, 1.05, 0.62), (-2.60, 0.30, 0.62), (-2.42, 0.30, 0.72)], 0.032, 8, mi=4)
    # thermocouple loom along the top of the barrel
    b.pipe([(bx0, 0.10, cl + 0.42), (bx1 - 0.2, 0.10, cl + 0.42),
            (bx1 - 0.2, 0.60, cl + 0.42), (bx1 - 0.2, 0.90, 0.95)], 0.030, 8, mi=4)
    # melt line to downstream + compressed air drop
    b.pipe([(4.20, 0.75, 0.60), (4.20, 0.75, 1.85), (5.60, 0.75, 1.85)], 0.028, 8, mi=5)
    conns = b.finish(name + '_CONNECTIONS',
                     mats('MAT_STEEL_GALV', 'MAT_ACCENT_RED', 'MAT_ACCENT_BLUE',
                          'MAT_STEEL_GALV', 'MAT_CABLE', 'MAT_ACCENT_BLUE'),
                     **P, object_type='machine_part', display_name='Service Connections')

    _ = (frame, motor, coupling, gearbox, thrust, feeder, hopper, screw, die,
         panel, guarding, conns, zone_objs)

    if add_cam:
        add_camera(name + '_CAM_PRESENT', (0.1, 0.0, 1.45), 13.5, azimuth=54,
                   elevation=17, lens=45, parent=root, collection=collection)
    return root


def _sse_proxy_common(b, S, detail):
    """Silhouette shared by the area and overview proxies."""
    cl = S['cl']
    sg = 14 if detail else 10
    # frame
    L = S['frame_x1'] - S['frame_x0']
    cx = (S['frame_x1'] + S['frame_x0']) / 2
    b.cube((L, 1.26, 0.30), (cx, 0, S['frame_top'] - 0.15), mi=0)
    for i in range(5):
        x = S['frame_x0'] + L * (i + 0.5) / 5
        for sy in (-1, 1):
            b.cube((0.16, 0.16, S['frame_top'] - 0.30), (x, sy * 0.55, (S['frame_top'] - 0.30) / 2), mi=0)
    # drive train
    b.cyl(0.29, 1.30, (S['motor_x'], 0, cl), (0, D2R(90), 0), segs=sg, mi=1)
    b.cube((1.46, 1.05, 1.16), (S['gearbox_x'], 0, cl), mi=2)
    b.cyl(0.25, 0.55, (S['thrust_x'], 0, cl), (0, D2R(90), 0), segs=sg, mi=2)
    # barrel with its zone shrouds as one ribbed tube
    b.cyl(S['barrel_r'], 0.62, ((S['feed_x0'] + S['feed_x1']) / 2, 0, cl), (0, D2R(90), 0),
          segs=sg, mi=3)
    b.cyl(0.255, S['barrel_x1'] - S['barrel_x0'],
          ((S['barrel_x0'] + S['barrel_x1']) / 2, 0, cl), (0, D2R(90), 0), segs=sg, mi=3)
    if detail:
        zl = (S['barrel_x1'] - S['barrel_x0'] - 0.25) / S['zones']
        for i in range(S['zones']):
            zx = S['barrel_x0'] + 0.125 + zl * (i + 0.5)
            b.cyl(0.272, 0.06, (zx - zl * 0.35, 0, cl), (0, D2R(90), 0), segs=sg, mi=3)
            b.cyl(0.11, 0.15, (zx, -0.30, cl - 0.33), segs=10, mi=2)
            b.cube((zl * 0.86, 0.34, 0.06), (zx, 0, cl - 0.30), mi=4)
    # hopper
    hx = S['hopper_x']
    b.cone(0.17, 0.52, 0.85, (hx, 0, cl + 0.93), segs=sg, mi=5)
    b.cyl(0.52, 0.80, (hx, 0, cl + 1.75), segs=sg, mi=5)
    b.cube((0.44, 0.44, 0.30), (hx, 0, cl + 0.30), mi=2)
    # screen changer + die
    b.cube((0.38, 0.50, 0.62), (S['barrel_x1'] + 0.28, 0, cl), mi=2)
    b.cyl(0.26, 0.90, (S['die_x'], 0, cl), (0, D2R(90), 0), segs=sg, mi=2)
    # control panel
    b.cube((1.30, 0.62, 2.00), (-3.10, 1.62, 1.00), mi=6)
    return b


def _sse_area(root, S, collection, asset_id):
    b = MB()
    _sse_proxy_common(b, S, detail=True)
    b.finish(root.name + '_PROXY',
             mats('MAT_PAINT_BLUE', 'MAT_PAINT_BLUE_DEEP', 'MAT_PAINT_OFFWHITE',
                  'MAT_STEEL_MACHINED', 'MAT_PAINT_BLUE', 'MAT_STAINLESS', 'MAT_PAINT_LIGHT'),
             parent=root, collection=collection,
             object_type='machine_proxy', asset_id=asset_id, selectable=True,
             display_name='Single Screw Extruder')
    return root


def _sse_overview(root, S, collection, asset_id):
    b = MB()
    _sse_proxy_common(b, S, detail=False)
    b.finish(root.name + '_PROXY',
             mats('MAT_PAINT_BLUE', 'MAT_PAINT_BLUE_DEEP', 'MAT_PAINT_OFFWHITE',
                  'MAT_STEEL_MACHINED', 'MAT_PAINT_BLUE', 'MAT_STAINLESS', 'MAT_PAINT_LIGHT'),
             parent=root, collection=collection,
             object_type='machine_proxy', asset_id=asset_id, selectable=True,
             display_name='Single Screw Extruder')
    return root


# ==========================================================================
# ROTARY AIRLOCK VALVE
# ==========================================================================
RAV = dict(
    bore_r=0.200,            # rotor bore radius (400 mm airlock)
    housing_r=0.268,
    width=0.400,             # rotor width along the shaft (Y)
    cl=1.30,                 # shaft centreline height
    blades=8,
    inlet_z=1.86,
    outlet_z=0.84,
    frame_w=1.10,
)


def build_rav(parent, loc=(0, 0, 0), rot=0.0, lod='machine', collection=None,
              asset_id='RAV-001', name='RAV_001', area_id='AREA-MATERIAL-001',
              model_path='machines/rotary-airlock-valve.glb', add_cam=True,
              with_convey=True):
    R = RAV
    cl, hr, br, w = R['cl'], R['housing_r'], R['bore_r'], R['width']
    root = group(name, parent, loc, (0, 0, rot), collection,
                 asset_id=asset_id, area_id=area_id, object_type='machine',
                 machine_type='rotary_airlock_valve',
                 display_name='Rotary Airlock Valve',
                 selectable=True, model_path=model_path, lod=lod)
    P = dict(parent=root, collection=collection)

    if lod != 'machine':
        return _rav_proxy(root, R, collection, asset_id, lod, with_convey)

    sg = 32

    # ------------------------------------------------------------- housing
    b = MB()
    b.tube(hr, br, w, (0, 0, cl), (D2R(90), 0, 0), segs=sg, mi=0)
    # cast side walls with the squared-off outline of a real airlock body
    for sy in (-1, 1):
        b.tube(hr + 0.018, br * 0.34, 0.030, (0, sy * (w / 2 + 0.015), cl),
               (D2R(90), 0, 0), segs=sg, mi=0)
        b.prism([(-hr - 0.01, -0.12), (hr + 0.01, -0.12), (hr + 0.01, 0.12), (-hr - 0.01, 0.12)],
                0.030, (0, sy * (w / 2 + 0.015), cl), (D2R(90), 0, 0), mi=0)
    # inlet / outlet transition throats cast into the body
    b.prism([(-0.185, -0.20), (0.185, -0.20), (0.225, 0.20), (-0.225, 0.20)], w,
            (0, 0, cl + 0.30), (D2R(90), 0, 0), mi=0)
    b.prism([(-0.185, 0.20), (0.185, 0.20), (0.225, -0.20), (-0.225, -0.20)], w,
            (0, 0, cl - 0.30), (D2R(90), 0, 0), mi=0)
    # lifting lugs + mounting pads
    for sy in (-1, 1):
        for sx in (-1, 1):
            b.cube((0.10, 0.13, 0.05), (sx * (hr - 0.03), sy * (w / 2 + 0.05), cl + 0.10), mi=1)
    b.cube((0.09, w + 0.10, 0.16), (hr + 0.02, 0, cl + 0.02), mi=0)
    b.cube((0.09, w + 0.10, 0.16), (-hr - 0.02, 0, cl + 0.02), mi=0)
    housing = b.finish(name + '_HOUSING',
                       mats('MAT_STAINLESS_BRUSHED', 'MAT_STEEL_MACHINED'),
                       **P, object_type='machine_part', display_name='Housing',
                       material_spec='cast stainless, hard-chrome bore')

    # --------------------------------------------------------- rotor + shaft
    b = MB()
    b.cyl(0.072, w - 0.02, (0, 0, cl), (D2R(90), 0, 0), segs=24, mi=0)         # rotor hub
    for sy in (-1, 1):
        b.cyl(br - 0.004, 0.016, (0, sy * (w / 2 - 0.02), cl), (D2R(90), 0, 0), segs=sg, mi=0)
    rotor = b.finish(name + '_ROTOR', mats('MAT_STEEL_MACHINED', 'MAT_STAINLESS'),
                     **P, object_type='machine_part', display_name='Rotor',
                     pockets=R['blades'])

    b = MB()
    for i in range(R['blades']):
        a = TAU * i / R['blades']
        rmid = (0.072 + br - 0.006) / 2
        blen = (br - 0.006) - 0.072
        b.cube((blen, w - 0.055, 0.014),
               (math.cos(a) * rmid, 0, cl + math.sin(a) * rmid), (0, 0, 0), mi=0)
        # rotate the blade into place about the shaft axis (Y)
    blades_bm = b
    blades = blades_bm.finish(name + '_ROTOR_BLADES_TMP', mat('MAT_STEEL_MACHINED'),
                              **P)
    # rebuild properly with rotation about Y (cube rot is applied per-primitive)
    import bpy as _bpy
    _bpy.data.objects.remove(blades, do_unlink=True)
    b = MB()
    for i in range(R['blades']):
        a = TAU * i / R['blades']
        rmid = (0.072 + br - 0.008) / 2
        blen = (br - 0.008) - 0.072
        b.cube((blen, w - 0.055, 0.013),
               (math.cos(a) * rmid, 0, cl + math.sin(a) * rmid),
               (0, -a, 0), mi=0)
        # bevelled, replaceable tip strip
        b.cube((0.026, w - 0.055, 0.019),
               (math.cos(a) * (br - 0.012), 0, cl + math.sin(a) * (br - 0.012)),
               (0, -a, 0), mi=1)
    blades = b.finish(name + '_ROTOR_BLADES', mats('MAT_STEEL_MACHINED', 'MAT_STAINLESS'),
                      **P, object_type='machine_part', display_name='Rotor Blades',
                      count=R['blades'])

    b = MB()
    b.cyl(0.042, w + 0.62, (0, 0, cl), (D2R(90), 0, 0), segs=20, mi=0)
    b.cyl(0.036, 0.26, (0, w / 2 + 0.42, cl), (D2R(90), 0, 0), segs=20, mi=0)  # drive end
    b.cube((0.012, 0.12, 0.010), (0, w / 2 + 0.40, cl + 0.036), mi=0)          # key
    shaft = b.finish(name + '_SHAFT', mats('MAT_STEEL_MACHINED',),
                     **P, object_type='machine_part', display_name='Shaft')

    # ---------------------------------------------------- bearings + seals
    b = MB()
    for sy in (-1, 1):
        y = sy * (w / 2 + 0.115)
        b.cyl(0.085, 0.10, (0, y, cl), (D2R(90), 0, 0), segs=24, mi=0)         # pillow block
        b.cube((0.20, 0.09, 0.10), (0, y, cl - 0.085), mi=0)
        for sx in (-1, 1):
            b.cyl(0.013, 0.05, (sx * 0.075, y, cl - 0.115), segs=8, mi=1)
        b.cyl(0.016, 0.04, (0, y, cl + 0.09), segs=8, mi=1)                    # grease nipple
    bearings = b.finish(name + '_BEARINGS', mats('MAT_CAST_IRON', 'MAT_STEEL_MACHINED'),
                        **P, object_type='machine_part', display_name='Outboard Bearings')

    b = MB()
    for sy in (-1, 1):
        y = sy * (w / 2 + 0.045)
        b.cyl(0.068, 0.05, (0, y, cl), (D2R(90), 0, 0), segs=20, mi=0)         # gland follower
        b.cyl(0.058, 0.03, (0, sy * (w / 2 + 0.075), cl), (D2R(90), 0, 0), segs=20, mi=1)
        for sx in (-1, 1):
            b.cyl(0.008, 0.09, (sx * 0.052, y, cl), (D2R(90), 0, 0), segs=6, mi=1)
        b.cyl(0.014, 0.035, (0, y, cl + 0.075), (D2R(20) * sy, 0, 0), segs=8, mi=1)  # purge port
    seals = b.finish(name + '_SEALS', mats('MAT_PLASTIC_GREY', 'MAT_STEEL_MACHINED'),
                     **P, object_type='machine_part', display_name='Shaft Seals',
                     seal_type='air-purged packing gland')

    # ---------------------------------------------------- inlet and outlet
    b = MB()
    b.prism([(-0.185, -0.185), (0.185, -0.185), (0.185, 0.185), (-0.185, 0.185)], 0.22,
            (0, 0, cl + 0.42), mi=0)
    b.cone(0.185 * 1.42, 0.20, 0.14, (0, 0, cl + 0.59), segs=sg, mi=0)
    b.flange(0.275, 0.026, (0, 0, R['inlet_z']), segs=sg, mi=1,
             bolts=12, bolt_r=0.014, bolt_circle=0.235, bolt_h=0.024)
    inlet = b.finish(name + '_INLET', mats('MAT_STAINLESS_BRUSHED', 'MAT_STEEL_MACHINED'),
                     **P, object_type='machine_part', display_name='Inlet Flange',
                     dn='DN 300')

    b = MB()
    b.prism([(-0.185, -0.185), (0.185, -0.185), (0.185, 0.185), (-0.185, 0.185)], 0.20,
            (0, 0, cl - 0.42), mi=0)
    b.cone(0.20, 0.155, 0.14, (0, 0, cl - 0.59), segs=sg, mi=0)
    b.flange(0.235, 0.024, (0, 0, R['outlet_z'] + 0.02), segs=sg, mi=1,
             bolts=12, bolt_r=0.013, bolt_circle=0.198, bolt_h=0.022)
    if with_convey:
        # blow-through tee into the dilute-phase conveying line
        b.cyl(0.115, 0.90, (0, 0, R['outlet_z'] - 0.14), (0, D2R(90), 0), segs=sg, mi=2)
        b.cyl(0.128, 0.20, (0, 0, R['outlet_z'] - 0.08), segs=sg, mi=2)
        for sx in (-1, 1):
            b.flange(0.155, 0.022, (sx * 0.45, 0, R['outlet_z'] - 0.14), (0, D2R(90), 0),
                     segs=sg, mi=1, bolts=8, bolt_r=0.011, bolt_circle=0.128, bolt_h=0.02)
    outlet = b.finish(name + '_OUTLET',
                      mats('MAT_STAINLESS_BRUSHED', 'MAT_STEEL_MACHINED', 'MAT_STEEL_BRIGHT'),
                      **P, object_type='machine_part', display_name='Outlet / Blow-Through',
                      dn='DN 250')

    # --------------------------------------------------- inspection cover
    b = MB()
    y = -(w / 2 + 0.032)
    b.cyl(hr - 0.01, 0.028, (0, y, cl), (D2R(90), 0, 0), segs=sg, mi=0)
    b.cyl(0.10, 0.05, (0, y - 0.02, cl), (D2R(90), 0, 0), segs=24, mi=0)
    for i in range(10):
        a = TAU * i / 10
        b.cyl(0.013, 0.026, (math.cos(a) * (hr - 0.055), y - 0.024, cl + math.sin(a) * (hr - 0.055)),
              (D2R(90), 0, 0), segs=6, mi=1)
    b.cube((0.13, 0.045, 0.08), (0.13, y - 0.03, cl - 0.14), mi=1)             # hinge
    b.cube((0.05, 0.06, 0.10), (-0.17, y - 0.035, cl + 0.02), mi=2)            # latch handle
    cover = b.finish(name + '_INSPECTION_COVER',
                     mats('MAT_STAINLESS_BRUSHED', 'MAT_STEEL_MACHINED', 'MAT_ACCENT_ORANGE'),
                     **P, object_type='machine_part', display_name='Inspection Cover')

    # ------------------------------------------------ gear reducer + motor
    b = MB()
    gy = w / 2 + 0.34
    b.cube((0.36, 0.30, 0.40), (0, gy, cl), mi=0)                              # shaft-mount reducer
    b.cyl(0.115, 0.32, (0, gy, cl), (D2R(90), 0, 0), segs=24, mi=0)
    b.cyl(0.075, 0.06, (0, gy - 0.18, cl), (D2R(90), 0, 0), segs=20, mi=1)
    b.cube((0.05, 0.30, 0.05), (0.0, gy, cl - 0.26), mi=1)                     # torque arm
    b.seg(Vector((0.0, gy, cl - 0.28)), Vector((0.0, gy + 0.05, cl - 0.62)), 0.022, 8, 1)
    b.cyl(0.045, 0.10, (0, gy + 0.16, cl + 0.16), (D2R(90), 0, 0), segs=14, mi=1)  # breather
    b.cube((0.18, 0.16, 0.16), (0.22, gy, cl + 0.18), mi=2)                    # motor adapter
    reducer = b.finish(name + '_GEAR_REDUCER',
                       mats('MAT_PAINT_GREY', 'MAT_STEEL_MACHINED', 'MAT_CAST_IRON'),
                       **P, object_type='machine_part', display_name='Gear Reducer',
                       ratio='29:1')

    b = MB()
    my = gy + 0.40
    b.cyl(0.115, 0.36, (0.22, my, cl + 0.18), (D2R(90), 0, 0), segs=24, mi=0)
    for i in range(16):
        a = TAU * i / 16
        b.cube((0.026, 0.34, 0.030), (0.22 + math.cos(a) * 0.128, my, cl + 0.18 + math.sin(a) * 0.128),
               (0, -a, 0), mi=0)
    b.cyl(0.098, 0.06, (0.22, my - 0.20, cl + 0.18), (D2R(90), 0, 0), segs=20, mi=1)
    b.cyl(0.105, 0.10, (0.22, my + 0.21, cl + 0.18), (D2R(90), 0, 0), segs=20, mi=1)  # fan cowl
    b.cyl(0.112, 0.02, (0.22, my + 0.27, cl + 0.18), (D2R(90), 0, 0), segs=20, mi=2)
    b.cube((0.15, 0.13, 0.10), (0.22, my, cl + 0.35), mi=0)                    # terminal box
    b.cyl(0.018, 0.06, (0.22, my + 0.06, cl + 0.39), (D2R(60), 0, 0), segs=8, mi=2)
    b.cube((0.06, 0.05, 0.10), (0.10, my - 0.12, cl + 0.02), mi=1)             # speed sensor
    motor = b.finish(name + '_MOTOR',
                     mats('MAT_PAINT_BLUE_DEEP', 'MAT_CAST_IRON', 'MAT_PAINT_DARK'),
                     **P, object_type='machine_part', display_name='Drive Motor',
                     rated_kw=2.2)

    b = MB()
    b.cube((0.44, 0.86, 0.50), (0.10, gy + 0.12, cl - 0.02), mi=0)             # guard over drive
    for i in range(9):
        b.cube((0.02, 0.82, 0.46), (-0.10 + i * 0.05, gy + 0.12, cl - 0.02), mi=1)
    drive = b.finish(name + '_DRIVE',
                     mats('MAT_ACCENT_YELLOW', 'MAT_STEEL_GALV'),
                     **P, object_type='machine_part', display_name='Drive Guard')

    # -------------------------------------------------------- support frame
    b = MB()
    fw = R['frame_w']
    ztop = R['outlet_z'] - 0.34
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = Vector((sx * fw / 2, sy * fw / 2, 0))
            b.cube((0.09, 0.09, ztop), (p.x, p.y, ztop / 2), mi=0)
            b.cube((0.20, 0.20, 0.02), (p.x, p.y, 0.01), mi=1)
            for k in range(2):
                a = TAU * k / 2
                b.cyl(0.010, 0.04, (p.x + math.cos(a) * 0.07, p.y + math.sin(a) * 0.07, 0.02),
                      segs=6, mi=1)
    for sx in (-1, 1):
        b.cube((0.09, fw, 0.09), (sx * fw / 2, 0, ztop - 0.045), mi=0)
    for sy in (-1, 1):
        b.cube((fw, 0.09, 0.09), (0, sy * fw / 2, ztop - 0.045), mi=0)
        b.seg(Vector((-fw / 2, sy * fw / 2, 0.10)), Vector((fw / 2, sy * fw / 2, ztop - 0.12)),
              0.028, 8, 0)
    b.cube((fw + 0.12, fw + 0.12, 0.030), (0, 0, ztop + 0.015), mi=1)          # mounting plate
    b.cyl(0.24, 0.034, (0, 0, ztop + 0.03), segs=sg, mi=1)
    # the valve hangs from this plate on four studs
    for i in range(4):
        a = TAU * i / 4 + math.pi / 4
        b.cyl(0.014, R['outlet_z'] - ztop - 0.03,
              (math.cos(a) * 0.30, math.sin(a) * 0.30, ztop + 0.03 + (R['outlet_z'] - ztop - 0.03) / 2),
              segs=8, mi=1)
    frame = b.finish(name + '_SUPPORT_FRAME',
                     mats('MAT_STEEL_CARBON', 'MAT_STEEL_MACHINED'),
                     **P, object_type='machine_part', display_name='Support Frame')

    _ = (housing, rotor, blades, shaft, bearings, seals, inlet, outlet, cover,
         reducer, motor, drive, frame)

    if add_cam:
        add_camera(name + '_CAM_PRESENT', (0.0, 0.05, 1.30), 3.6, azimuth=38,
                   elevation=16, lens=50, parent=root, collection=collection)
    return root


def _rav_proxy(root, R, collection, asset_id, lod, with_convey):
    cl, hr, w = R['cl'], R['housing_r'], R['width']
    sg = 16 if lod == 'area' else 10
    b = MB()
    b.cyl(hr, w, (0, 0, cl), (D2R(90), 0, 0), segs=sg, mi=0)
    b.prism([(-0.19, -0.19), (0.19, -0.19), (0.19, 0.19), (-0.19, 0.19)], w * 0.98,
            (0, 0, cl), (D2R(90), 0, 0), mi=0)
    b.prism([(-0.185, -0.20), (0.185, -0.20), (0.225, 0.20), (-0.225, 0.20)], w,
            (0, 0, cl + 0.30), (D2R(90), 0, 0), mi=0)
    b.prism([(-0.185, 0.20), (0.185, 0.20), (0.225, -0.20), (-0.225, -0.20)], w,
            (0, 0, cl - 0.30), (D2R(90), 0, 0), mi=0)
    b.cyl(0.275, 0.03, (0, 0, R['inlet_z']), segs=sg, mi=1)
    b.cyl(0.235, 0.03, (0, 0, R['outlet_z'] + 0.02), segs=sg, mi=1)
    b.cube((0.40, 0.75, 0.46), (0.08, w / 2 + 0.42, cl), mi=2)                 # drive package
    b.cyl(0.115, 0.36, (0.22, w / 2 + 0.74, cl + 0.18), (D2R(90), 0, 0), segs=sg, mi=3)
    if with_convey:
        b.cyl(0.115, 0.90, (0, 0, R['outlet_z'] - 0.14), (0, D2R(90), 0), segs=sg, mi=1)
    fw = R['frame_w']
    ztop = R['outlet_z'] - 0.34
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.cube((0.09, 0.09, ztop), (sx * fw / 2, sy * fw / 2, ztop / 2), mi=4)
    b.cube((fw + 0.12, fw + 0.12, 0.05), (0, 0, ztop + 0.02), mi=4)
    if lod == 'area':
        for sy in (-1, 1):
            b.cube((fw, 0.08, 0.08), (0, sy * fw / 2, ztop - 0.05), mi=4)
    b.finish(root.name + '_PROXY',
             mats('MAT_STAINLESS_BRUSHED', 'MAT_STEEL_BRIGHT', 'MAT_ACCENT_YELLOW',
                  'MAT_PAINT_BLUE_DEEP', 'MAT_STEEL_CARBON'),
             parent=root, collection=collection,
             object_type='machine_proxy', asset_id=asset_id, selectable=True,
             display_name='Rotary Airlock Valve')
    return root
