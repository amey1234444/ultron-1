# -*- coding: utf-8 -*-
"""The twin-screw processing assembly -- the highest-priority geometry.

Two complete, independent modular screw shafts inside one twin-bore barrel:

    TWIN_SCREW_PROCESSING_ASSEMBLY
      SCREW_1_ASSEMBLY : S1_DRIVE_SPLINE, S1_FEED_ELEMENTS, S1_CONVEYING_A,
                         S1_KNEADING_BLOCK_A, ... S1_METERING_ELEMENTS, S1_TIP
      SCREW_2_ASSEMBLY : the same element train, phased 90 deg

Shaft arrangement is a single config switch, lib_params.SCREW_ARRANGEMENT:

  VERTICAL   (current) the shafts stack one above the other, which is how the
             supplied reference elevation reads. Both screws are fully visible
             from a flat reference camera, and each keeps its own axis, pivot,
             part ids, selection target and RPM binding.
  HORIZONTAL the side-by-side layout of master prompt V2 section 4.

Either way the geometry is identical apart from the axis offsets and the
starting phases: the Erdmenger relation depends only on the centre distance,
not on the orientation of the line joining the axes.

Cross-sections are the exact Erdmenger fully-wiped bilobal profile, so the two
screws genuinely self-wipe: see lib_geo.erdmenger_profile.
"""

import bpy
from math import pi, cos, sin, radians, tau

import lib_params as P
import lib_geo as G
import lib_mat as M


def _profile(root_scale=1.0, samples=None, teeth=None, tooth_depth=0.45):
    """Erdmenger profile with optional deeper channel / distributive teeth."""
    samples = samples or P.Q_PROFILE_SEG
    cl = P.SCREW_INTER_CLEARANCE
    R = P.SCREW_R - cl
    Ri = P.SCREW_RI + cl          # keeps C = R + Ri, so the wiping relation holds
    pts = G.erdmenger_profile(R, Ri, P.SCREW_N_LOBES, samples)

    if root_scale != 1.0 or teeth:
        import math
        k = (R - Ri * root_scale) / (R - Ri)
        out = []
        for (y, z) in pts:
            rho = math.hypot(y, z)
            a = math.atan2(z, y)
            if root_scale != 1.0:
                rho = R - (R - rho) * k
            if teeth:
                # mill axial slots into the crest -> distributive mixing element
                w = (a % (tau / teeth)) / (tau / teeth)
                if 0.30 < w < 0.70 and rho > Ri + (R - Ri) * 0.5:
                    rho = min(rho, Ri + (R - Ri) * tooth_depth)
            out.append((rho * math.cos(a), rho * math.sin(a)))
        pts = out
    return pts


def _spline_profile(r, teeth=20, depth=0.10, samples=6):
    """Splined shaft cross-section, visible at the element seams and ends."""
    import math
    pts = []
    for t in range(teeth):
        base = tau * t / teeth
        for i in range(samples + 1):
            a = base + (tau / teeth) * (i / samples)
            w = i / samples
            rr = r * (1.0 - depth * (0.5 - 0.5 * math.cos(tau * w)))
            pts.append((rr * math.cos(a), rr * math.sin(a)))
    return pts


def _spline(name, x0, length, axis, mat, target, phase):
    """Drive spline / retaining collar group at the gearbox end."""
    ay, az = axis
    rs = P.SCREW_SHAFT_R
    parts = [G.prism(name + "_spl", _spline_profile(rs * 1.34), x0, length,
                     mat, target, axis_y=ay, axis_z=az, phase=phase)]
    for f in (0.13, 0.87):
        parts.append(G.cyl(name + "_collar", rs * 1.52, length * 0.24, 'X',
                           (x0 + length * f, ay, az), P.Q_MED, mat,
                           target, chamfer=0.005))
    return G.join(parts, name, mat, target)


def _tip(name, x0, length, axis, mat, target, phase):
    """Machined shaft tip running into the screen-pack inlet."""
    ay, az = axis
    rs = P.SCREW_SHAFT_R
    parts = [G.lathe(name + "_t",
                     [(0, 0), (P.SCREW_RI * .96, 0),
                      (P.SCREW_RI * .96, length * .34),
                      (rs * 1.30, length * .48), (rs * 1.30, length * .82),
                      (rs * .92, length), (0, length)],
                     P.Q_CYL, 'X', (x0, ay, az), mat=mat, target=target)]
    return G.join(parts, name, mat, target)


def _disc_stack(name, x0, length, axis, n_discs, stagger_deg, phase, mat,
                target, profile, gap_frac=0.055):
    """Staggered bilobal discs on a shared spacer core -- a kneading block."""
    ay, az = axis
    parts = []
    gap = length * gap_frac
    disc = (length - gap * (n_discs - 1)) / n_discs
    ph = phase
    for i in range(n_discs):
        x = x0 + i * (disc + gap)
        parts.append(G.prism("%s_d%d" % (name, i), profile, x, disc, mat,
                             target, axis_y=ay, axis_z=az, phase=ph))
        if i < n_discs - 1:
            parts.append(G.cyl("%s_s%d" % (name, i), P.SCREW_RI * 0.94,
                               gap * 1.6, 'X',
                               (x + disc + gap * .5, ay, az), P.Q_MED,
                               mat, target))
        ph += radians(stagger_deg)
    return G.join(parts, name, mat, target), ph


def build_screw(index, axis, phase0, target, mat):
    """Build one complete screw shaft from the element train."""
    ay, az = axis
    made = []
    x = P.SCREW_X0
    phase = phase0
    total = sum(e[2] for e in P.SCREW_TRAIN)
    scale = (P.SCREW_X1 - P.SCREW_X0) / total      # fit the train exactly
    n_conv = 0

    for kind, elem, length, a, b in P.SCREW_TRAIN:
        L = length * scale
        nm = "S%d_%s" % (index, elem)

        if kind == "conv":
            n_conv += 1
            pitch = a * scale * (b or 1)
            # the first two conveying groups are the deep-channel intake
            deep = 0.84 if n_conv == 1 else (0.92 if n_conv == 2 else 1.0)
            ob, phase = G.twist_extrude(
                nm, _profile(root_scale=deep), x, L, phase0=phase, pitch=pitch,
                mat=mat, target=target, axis_y=ay, axis_z=az,
                slices_per_turn=P.Q_SLICES_TURN)
            made.append(ob)

        elif kind == "knead":
            ob, phase = _disc_stack(nm, x, L, axis, int(a), b, phase, mat,
                                    target, _profile())
            made.append(ob)

        elif kind == "mix":
            ob, phase = _disc_stack(nm, x, L, axis, int(a), b, phase, mat,
                                    target, _profile(teeth=7, tooth_depth=0.42),
                                    gap_frac=0.07)
            made.append(ob)

        elif kind == "spline":
            made.append(_spline(nm, x, L, axis, mat, target, phase))

        elif kind == "tip":
            made.append(_tip(nm, x, L, axis, mat, target, phase))

        x += L
    return made


def build(root):
    mat = M.get("MAT_screw_steel")
    c = G.coll("TWIN_SCREW_PROCESSING_ASSEMBLY", root)
    c1 = G.coll("SCREW_1_ASSEMBLY", c)
    c2 = G.coll("SCREW_2_ASSEMBLY", c)

    objs = []
    # Both screws are the same physical part. Screw 2 is phased pi/n so a tip
    # always faces a root across the intermesh -> genuine co-rotating operation.
    objs += build_screw(1, P.SCREW_1_AXIS, radians(P.SCREW_1_PHASE_DEG), c1, mat)
    objs += build_screw(2, P.SCREW_2_AXIS, radians(P.SCREW_2_PHASE_DEG), c2, mat)

    # drive-end stub shafts running back into the gearbox output bearings
    for i, axis, coll in ((1, P.SCREW_1_AXIS, c1), (2, P.SCREW_2_AXIS, c2)):
        objs.append(G.cyl("S%d_CORE_SHAFT" % i, P.SCREW_SHAFT_R * 1.6, 0.30,
                          'X', (P.SCREW_X0 - 0.13, axis[0], axis[1]), P.Q_CYL,
                          mat, coll, chamfer=0.005))

    # Each screw's origin goes on its own axis so rotation is a clean local
    # spin about X and the neutral transform is trivially restorable.
    for ob in objs:
        axis = P.SCREW_1_AXIS if ob.name.startswith("S1_") else P.SCREW_2_AXIS
        G.apply_mods(ob)
        G.set_origin(ob, (0.0, axis[0], axis[1]))
    return objs
