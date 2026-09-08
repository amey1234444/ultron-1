# -*- coding: utf-8 -*-
"""
Parametric dimension set for the reference twin-screw extruder.

All values are in metres and were derived by normalising the supplied
reference elevation (docs/reference-analysis.md).  Nothing here is a
manufacturer-certified CAD dimension: the longitudinal allocation and the
vertical anchors are measured off the reference image, everything in the
Y (depth) direction is a mechanically plausible inference.

Change a value here and re-run pipeline.py -- no remodelling required.
"""

from math import pi, acos

# ----------------------------------------------------------------------------
# Global envelope
# ----------------------------------------------------------------------------
L = 3.20                 # overall machine length (motor base -> nozzle tip)
H = 1.322                # overall machine height (ground -> hopper lid)
GROUND_Z = 0.0

# Longitudinal allocation, expressed as fractions of L (reference measured)
FR_MOTOR    = (0.000, 0.170)
FR_COUPLING = (0.170, 0.220)
FR_GEARBOX  = (0.220, 0.390)
FR_BARREL   = (0.390, 0.872)
FR_DIE      = (0.872, 1.000)


def xf(f):
    """fraction of overall length -> world X"""
    return f * L


X_MOTOR    = (xf(FR_MOTOR[0]),    xf(FR_MOTOR[1]))
X_COUPLING = (xf(FR_COUPLING[0]), xf(FR_COUPLING[1]))
X_GEARBOX  = (xf(FR_GEARBOX[0]),  xf(FR_GEARBOX[1]))
X_BARREL   = (xf(FR_BARREL[0]),   xf(FR_BARREL[1]))     # 1.248 .. 2.790
X_DIE      = (xf(FR_DIE[0]),      xf(FR_DIE[1]))        # 2.790 .. 3.200

# ----------------------------------------------------------------------------
# Centrelines
# ----------------------------------------------------------------------------
Z_SCREW  = 0.352         # screw / barrel centreline height
Z_MOTOR  = 0.395         # motor + coupling centreline (sits slightly higher)
Y_MID    = 0.0           # machine mid-plane; screws straddle it

# ----------------------------------------------------------------------------
# MANDATORY barrel process topology (master prompt V2 section 6B)
#
# Physical left-to-right order from the main hopper toward the die.  Encoded
# here once; every module, cap, label, sensor anchor and telemetry binding is
# derived from this list.  Do not reorder, and do not distribute the eight
# temperature zones evenly -- the side feeder and the vent are real physical
# breaks in the module rhythm.
#
#   (kind, code, relative width)
#   kind: 'throat' | 'zone' | 'port'
# ----------------------------------------------------------------------------
BARREL_LAYOUT = [
    ("throat", "FEED_THROAT",     0.242),   # under the main hopper
    ("zone",   "TZ_01",           0.125),
    ("zone",   "TZ_02",           0.125),
    ("zone",   "TZ_03",           0.125),
    ("zone",   "TZ_04",           0.125),
    ("port",   "SIDE_FEED_PORT",  0.140),   # between TZ-04 and TZ-05
    ("zone",   "TZ_05",           0.135),
    ("zone",   "TZ_06",           0.135),
    ("zone",   "TZ_07",           0.135),
    ("port",   "VENT_PORT",       0.140),   # between TZ-07 and TZ-08
    ("zone",   "TZ_08",           0.173),
]

BARREL_ZONE_CODES = [c for (k, c, _) in BARREL_LAYOUT if k == "zone"]
assert BARREL_ZONE_CODES == ["TZ_%02d" % i for i in range(1, 9)], \
    "the eight temperature zones must be TZ-01..TZ-08 in order"


def barrel_slots():
    """Resolve BARREL_LAYOUT into absolute (kind, code, x0, x1) spans."""
    x0, x1 = X_BARREL
    total = sum(w for (_, _, w) in BARREL_LAYOUT)
    scale = (x1 - x0) / total
    out = []
    x = x0
    for kind, code, w in BARREL_LAYOUT:
        span = w * scale
        out.append((kind, code, x, x + span))
        x += span
    return out


def slot(code):
    for (kind, c, a, b) in barrel_slots():
        if c == code:
            return (a, b)
    raise KeyError(code)


def slot_center(code):
    a, b = slot(code)
    return (a + b) * 0.5


# ----------------------------------------------------------------------------
# Twin-screw geometry (Erdmenger fully-wiped bilobal, co-rotating)
# ----------------------------------------------------------------------------
SCREW_N_LOBES = 2

# Shaft arrangement across the bore.
#   "VERTICAL"   : the two shafts sit one above the other, which is how the
#                  supplied reference elevation reads and what the client
#                  asked for. Both screws are fully visible in a flat
#                  reference camera with no elevation trickery.
#   "HORIZONTAL" : shafts side by side across the barrel width, the layout
#                  master prompt V2 section 4 specifies. Kept switchable so
#                  the spec-compliant build is one constant away.
SCREW_ARRANGEMENT = "VERTICAL"

SCREW_DO      = 0.160                    # outside diameter
SCREW_DI      = 0.103                    # root diameter (64.4% of Do)
SCREW_R       = SCREW_DO * 0.5           # 0.0800
SCREW_RI      = SCREW_DI * 0.5           # 0.0515
SCREW_CL      = SCREW_R + SCREW_RI       # 0.1315 centre distance (fully wiped)
SCREW_SHAFT_R = SCREW_RI * 0.62          # splined core visible at element seams

# Axis positions as (y, z). SCREW-1 is the upper shaft, matching the annotated
# reference where SCREW-1 RPM and GBOX OUT-1 VIB both sit above their
# SCREW-2 / OUT-2 counterparts.
if SCREW_ARRANGEMENT == "VERTICAL":
    SCREW_1_AXIS = (0.0, Z_SCREW + SCREW_CL * 0.5)
    SCREW_2_AXIS = (0.0, Z_SCREW - SCREW_CL * 0.5)
    # the inter-axis line points along +Z, so screw 1 presents a root to
    # screw 2's tip when screw 1 leads by pi/n
    SCREW_1_PHASE_DEG = 90.0
    SCREW_2_PHASE_DEG = 0.0
else:
    SCREW_1_AXIS = (-SCREW_CL * 0.5, Z_SCREW)
    SCREW_2_AXIS = (+SCREW_CL * 0.5, Z_SCREW)
    SCREW_1_PHASE_DEG = 0.0
    SCREW_2_PHASE_DEG = 90.0

SCREW_AXES = (SCREW_1_AXIS, SCREW_2_AXIS)
SCREW_VERTICAL = SCREW_ARRANGEMENT == "VERTICAL"

# total envelope the bore has to contain, across the stacking direction
SCREW_ENVELOPE = SCREW_CL + SCREW_DO     # 0.2915

# retained for call sites that only need the Y offsets
SCREW_Y1 = SCREW_1_AXIS[0]
SCREW_Y2 = SCREW_2_AXIS[0]

SCREW_INTER_CLEARANCE  = 0.0005          # screw-to-screw radial relief
SCREW_BARREL_CLEARANCE = 0.0022          # screw-to-barrel bore relief
SCREW_HANDEDNESS = +1                    # right-handed
SCREW_ROTATION_MODE = "CO_ROTATING"

# derived Erdmenger angles (sanity-checked by lib_geo.erdmenger_profile)
_A_FLANK = 2.0 * acos(SCREW_CL / (2.0 * SCREW_R))
_A_TIP   = pi / SCREW_N_LOBES - _A_FLANK
assert _A_TIP > 0.0, "screw OD/CL combination is not fully wipeable"

SCREW_X0 = 1.155         # drive-end shaft start (inside the gearbox flange)
SCREW_X1 = 2.860         # die-end shaft finish (inside the screen-pack inlet)

# Modular element train, left -> right.  The names match the hierarchy in
# master prompt V2 section 5.1.
#   conv  : (kind, name, length, pitch, handed)
#   knead : (kind, name, length, n_discs, stagger_deg)
SCREW_TRAIN = [
    ("spline", "DRIVE_SPLINE",       0.055, None,  None),
    ("conv",   "FEED_ELEMENTS",      0.300, 0.150, +1),   # deep, long lead
    ("conv",   "CONVEYING_A",        0.145, 0.122, +1),
    ("knead",  "KNEADING_BLOCK_A",   0.140, 5,     45.0),
    ("conv",   "CONVEYING_B",        0.130, 0.110, +1),
    ("knead",  "KNEADING_BLOCK_B",   0.130, 5,     90.0),
    ("conv",   "CONVEYING_C",        0.155, 0.100, +1),
    ("mix",    "DISTRIBUTIVE_MIXER", 0.090, 3,     60.0),
    ("conv",   "MELTING_ZONE",       0.190, 0.088, +1),
    ("conv",   "METERING_ELEMENTS",  0.240, 0.068, +1),
    ("tip",    "TIP",                0.075, None,  None),
]

# ----------------------------------------------------------------------------
# Barrel
# ----------------------------------------------------------------------------
BARREL_H       = 0.425                     # outer height of the rectangular body
BARREL_W       = 0.420                     # outer depth (Y) - inferred
BARREL_GOLD_H  = 0.010                     # bronze heater/seal strip height
BARREL_SEAM    = 0.005                     # seam gap between modules

# Cutaway window. The screw envelope runs 0.2068..0.4973, so these edges leave
# ~19 mm of shadowed bore above and below the flights. That gap is what makes
# the two shafts read as two: with the old 0.198/0.506 the crests touched the
# rails and the pair had no silhouette to separate them from the housing.
BARREL_WIN_Z0  = 0.188                     # cutaway window, lower edge
BARREL_WIN_Z1  = 0.516                     # cutaway window, upper edge
BARREL_Z0      = Z_SCREW - BARREL_H * 0.5  # 0.1495
BARREL_Z1      = Z_SCREW + BARREL_H * 0.5  # 0.5545
# half-width of the bore across Y, and its half-height across Z
BARREL_BORE_Y  = (SCREW_R if SCREW_VERTICAL
                  else SCREW_CL * 0.5 + SCREW_R) + SCREW_BARREL_CLEARANCE
BARREL_BORE_Z  = (SCREW_CL * 0.5 + SCREW_R if SCREW_VERTICAL
                  else SCREW_R) + SCREW_BARREL_CLEARANCE
BARREL_WALL    = 0.030                     # visible cutaway wall thickness

TOPBLOCK_H   = 0.058     # heater block on top of each zone
TOPBLOCK_W   = 0.196
TOPCAP_R     = 0.030     # raised circular cap on each top block
TOPCAP_H     = 0.030

BOTBOX_H     = 0.066     # lower heater / cooling control housing
BOTBOX_W     = 0.238

# intermediate melt-pressure tappings on the barrel underside (P-INT-01/02)
P_INT_CODES  = ["P_INT_01", "P_INT_02"]
P_INT_ZONES  = ["TZ_02", "TZ_06"]          # which module carries each tapping
P_INT_FACE_Z = 0.212                       # tapping height on the barrel front face

# ----------------------------------------------------------------------------
# Motor
# ----------------------------------------------------------------------------
MOTOR_BODY_R    = 0.207
MOTOR_BODY_L    = 0.290
MOTOR_FIN_N     = 26
MOTOR_FIN_D     = 0.038   # radial fin depth
MOTOR_FIN_T     = 0.0105  # fin thickness
MOTOR_SHROUD_R  = 0.176
MOTOR_SHROUD_L  = 0.098
MOTOR_ENDBELL_R = 0.150
MOTOR_TBOX      = (0.150, 0.190, 0.075)   # terminal box L,W,H
MOTOR_FOOT_H    = 0.052
MOTOR_BASE      = (0.360, 0.330, 0.048)   # foundation plate L,W,H
MOTOR_SHAFT_R   = 0.035

# ----------------------------------------------------------------------------
# Gearbox
# ----------------------------------------------------------------------------
GB_BODY_H     = 0.592
GB_BODY_W     = 0.430
GB_TOP_Z      = 0.725          # top face height (below the hopper)
GB_BOT_Z      = 0.128          # underside of the cast body
GB_X0         = 0.680          # cast body, measured off the reference
GB_X1         = 1.150
GB_FLANGE_R   = 0.202          # output flange / bearing housing radius
GB_INPUT_R    = 0.098
GB_BASE       = (0.545, 0.470, 0.055)

# ----------------------------------------------------------------------------
# Main feed system
# ----------------------------------------------------------------------------
HOP_X        = None            # resolved from the FEED_THROAT slot below
HOP_TOP_Z    = 1.322
HOP_R        = 0.2305         # upper vessel radius
HOP_CYL_H    = 0.152
HOP_CONE_H   = 0.330
HOP_NECK_R   = 0.074
HOP_NECK_H   = 0.115
HOP_WALL     = 0.008
THROAT_Z     = 0.572          # top of the barrel feed throat

# ----------------------------------------------------------------------------
# Side feed system
# ----------------------------------------------------------------------------
SF_TOP_Z   = 0.878
SF_R       = 0.084
SF_CONE_H  = 0.078
SF_BODY_W  = 0.104
SF_BODY_H  = 0.120

# ----------------------------------------------------------------------------
# Vent / devolatilisation stack
# ----------------------------------------------------------------------------
VENT_TOP_Z  = 0.740
VENT_R      = 0.054
VENT_MESH_H = 0.090
VENT_MESH_HOLES = (26, 7)     # circumferential, axial

# ----------------------------------------------------------------------------
# Die end chain (master prompt V2 section 6B tail + 6C)
#   melt adapter -> screen inlet -> screen pack -> screen outlet -> die -> nozzle
# ----------------------------------------------------------------------------
DIE_CHAIN = [
    ("MELT_ADAPTER",  0.062),
    ("SCREEN_INLET",  0.044),
    ("SCREEN_PACK",   0.078),
    ("SCREEN_OUTLET", 0.044),
    ("DIE_BODY",      0.152),
    ("NOZZLE",        0.040),
]

SCREEN_R     = 0.156
DIE_H        = 0.334
NOZZLE_R     = 0.026


def die_slots():
    x0, x1 = X_DIE
    total = sum(w for (_, w) in DIE_CHAIN)
    scale = (x1 - x0) / total
    out = []
    x = x0
    for code, w in DIE_CHAIN:
        span = w * scale
        out.append((code, x, x + span))
        x += span
    return out


def die_slot(code):
    for (c, a, b) in die_slots():
        if c == code:
            return (a, b)
    raise KeyError(code)


# Pressure-boss geometry, shared by P-INT-01/02, P-SCR-IN, P-SCR-OUT
BOSS_R      = 0.026        # machined boss outer radius
BOSS_H      = 0.030        # boss standoff from the parent surface
BOSS_BODY_R = 0.019        # transducer body radius
BOSS_BODY_H = 0.046

# ----------------------------------------------------------------------------
# Resolved positions that depend on the topology
# ----------------------------------------------------------------------------
HOP_X   = slot_center("FEED_THROAT")
SF_X    = slot_center("SIDE_FEED_PORT")
VENT_X  = slot_center("VENT_PORT")

# ----------------------------------------------------------------------------
# Tessellation quality (master prompt V2 section 6A.1)
#   64-96 radial segments on the hopper, motor body, large flanges, screw
#   cores and large round housings; 40-64 on medium pipes; 24-40 on small
#   instanced fasteners.
# ----------------------------------------------------------------------------
Q_PROFILE_SEG = 24      # samples per Erdmenger profile segment (x4 segments)
Q_SLICES_TURN = 48      # axial slices per full screw turn
Q_LARGE       = 80      # hopper, motor body, big flanges
Q_CYL         = 64      # default radial segments
Q_MED         = 48      # medium pipes, couplings
Q_CYL_LOW     = 32      # small fasteners
