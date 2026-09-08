# -*- coding: utf-8 -*-
"""Studio lighting rig and the locked camera presets.

`Reference` is a near-orthographic elevation tuned to overlay the supplied
still.  The remaining presets are the interaction cameras.
"""

import bpy
from math import radians, sin, cos, tan

import lib_params as P
import lib_geo as G

# Reference framing, derived in docs/reference-analysis.md.
# The annotated reference is 1672 x 939 (master prompt V2 section 2).
REF_RES = (1672, 939)
REF_ASPECT = REF_RES[0] / float(REF_RES[1])
REF_ORTHO = P.L / 0.98                     # machine fills 98% of frame width
REF_CAM_DIST = 9.0

# With lib_params.SCREW_ARRANGEMENT == 'VERTICAL' the two shafts are already
# stacked in world space, so the locked Reference camera stays essentially
# flat -- matching the reference elevation -- and both screws read without
# any camera trickery. The small residual yaw/elevation only keeps the top
# caps and lower housings from projecting as perfectly flat bands.
# Studio exposure. Master prompt V2 section 6D.2 requires filmic tone mapping,
# which compresses highlights; the camera-ray background is therefore driven
# well above 1.0 so the sweep still lands on #F5F6F5 after the transform.
BG_STRENGTH = 12.5
KEY_W, FILL_W, RIM_W, BOUNCE_W = 250.0, 82.0, 125.0, 30.0
DRIVE_FILL_W = 56.0
SCREW_FILL_W, HOPPER_FILL_W = 105.0, 15.0
ENV_STRENGTH = 0.44

REF_ELEV = 3.0
REF_YAW = -2.5
REF_TARGET = (P.L * 0.5, 0.0, 0.560)

def orbit(target, azimuth, elevation, distance):
    """Camera placement on an orbit around `target`.

    azimuth 0 looks along +Y from the front (the reference elevation);
    positive azimuth swings toward the die end, positive elevation lifts.
    Blender cameras look down local -Z, so the matching euler is
    (90 - elevation, 0, azimuth).
    """
    a, e = radians(azimuth), radians(elevation)
    loc = (target[0] + distance * sin(a) * cos(e),
           target[1] - distance * cos(a) * cos(e),
           target[2] + distance * sin(e))
    return loc, (90.0 - elevation, 0.0, azimuth)


_MID = (P.L * 0.5, 0.0, 0.62)
_P_LOC, _P_ROT = orbit(_MID, -33.0, 19.0, 5.35)
_D_LOC, _D_ROT = orbit((0.80, 0.0, 0.52), -68.0, 15.0, 2.55)
_E_LOC, _E_ROT = orbit((2.86, 0.0, 0.44), 68.0, 13.0, 2.20)

PRESETS = {
    # name: (type, location, rotation_euler_deg, ortho_scale | lens_mm)
    "Reference":   ("ORTHO",) + orbit(REF_TARGET, REF_YAW, REF_ELEV,
                                      REF_CAM_DIST) + (REF_ORTHO,),
    "Perspective": ("PERSP", _P_LOC, _P_ROT, 40.0),
    # dedicated close-up proving SCREW-1 and SCREW-2 are two separate shafts
    "Twin Screw":  ("PERSP",) + orbit((1.78, 0.0, P.Z_SCREW), -30.0, 13.0, 1.05)
                   + (50.0,),
    "Side":        ("ORTHO", (P.L * 0.5, -REF_CAM_DIST, 0.62),
                    (90.0, 0.0, 0.0), P.L * 1.10),
    "Top":         ("ORTHO", (P.L * 0.5, 0.0, 8.0), (0.0, 0.0, 0.0), P.L * 1.10),
    "Drive End":   ("PERSP", _D_LOC, _D_ROT, 42.0),
    "Die End":     ("PERSP", _E_LOC, _E_ROT, 42.0),
}


def _cam(name, spec, target):
    kind, loc, rot, val = spec
    cd = bpy.data.cameras.new(name)
    cd.type = 'ORTHO' if kind == 'ORTHO' else 'PERSP'
    if kind == 'ORTHO':
        cd.ortho_scale = val
    else:
        cd.lens = val
    cd.clip_start = 0.05
    cd.clip_end = 60.0
    ob = bpy.data.objects.new("CAM_" + name.replace(" ", "_"), cd)
    ob.location = loc
    ob.rotation_euler = [radians(a) for a in rot]
    target.objects.link(ob)
    return ob


def _area(name, loc, rot, size, energy, target, color=(1, 1, 1)):
    d = bpy.data.lights.new(name, 'AREA')
    d.shape = 'RECTANGLE'
    d.size = size[0]
    d.size_y = size[1]
    d.energy = energy
    d.color = color
    ob = bpy.data.objects.new(name, d)
    ob.location = loc
    ob.rotation_euler = [radians(a) for a in rot]
    target.objects.link(ob)
    return ob


def build(root):
    c = G.coll("SCENE_RIG", root)
    scene = bpy.context.scene

    # ---- world -------------------------------------------------------------
    # The camera sees a flat #F7F7F5 sweep; reflections and ambient still get a
    # shaped dome, so metals keep vertical highlights instead of going milky.
    w = bpy.data.worlds.get("StudioMatch") or bpy.data.worlds.new("StudioMatch")
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    mix = nt.nodes.new("ShaderNodeMixShader")
    lp = nt.nodes.new("ShaderNodeLightPath")

    seen = nt.nodes.new("ShaderNodeBackground")          # what the camera sees
    seen.inputs["Color"].default_value = (0.945, 0.951, 0.945, 1)   # #F5F6F5
    seen.inputs["Strength"].default_value = BG_STRENGTH

    env = nt.nodes.new("ShaderNodeBackground")           # what the metal sees
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = 'EASING'
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.055, 0.058, 0.065, 1)
    ramp.color_ramp.elements[1].color = (1.00, 1.00, 0.99, 1)
    tex = nt.nodes.new("ShaderNodeTexCoord")
    map_ = nt.nodes.new("ShaderNodeMapping")
    map_.inputs["Rotation"].default_value[1] = radians(90)
    nt.links.new(tex.outputs["Generated"], map_.inputs["Vector"])
    nt.links.new(map_.outputs["Vector"], grad.inputs["Vector"])
    nt.links.new(grad.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], env.inputs["Color"])
    env.inputs["Strength"].default_value = ENV_STRENGTH

    nt.links.new(env.outputs[0], mix.inputs[1])
    nt.links.new(seen.outputs[0], mix.inputs[2])
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
    nt.links.new(mix.outputs[0], out.inputs[0])
    scene.world = w

    # ---- key / fill / rim (photographic levels, not blown out) -------------
    _area("KEY", (-1.6, -4.2, 4.6), (42, 0, -22), (6.0, 4.0), KEY_W, c)
    _area("FILL", (5.4, -3.9, 1.9), (76, 0, 34), (4.5, 3.5), FILL_W, c)
    _area("RIM", (1.6, 3.6, 3.4), (-52, 0, 0), (6.5, 2.2), RIM_W, c)
    _area("BOUNCE", (1.6, -2.2, -0.6), (180, 0, 0), (7.0, 3.0), BOUNCE_W, c)
    # narrow strip aimed into the open barrel window and the hopper mouth, so
    # the screws read as bright machined steel instead of sitting in shadow
    _area("SCREW_FILL", ((P.X_BARREL[0] + P.X_BARREL[1]) * .5, -1.05,
                         P.Z_SCREW + 0.10), (80, 0, 0), (2.10, 0.46), SCREW_FILL_W, c)
    _area("HOPPER_FILL", (P.HOP_X, -1.30, 1.28), (56, 0, 0), (0.85, 0.55), HOPPER_FILL_W, c)
    # dedicated soft fill on the dark painted motor so the fins stay readable
    # after the filmic transform crushes the shadow end
    _area("DRIVE_FILL", (0.10, -1.55, 0.95), (62, 0, -14), (1.30, 0.90),
          DRIVE_FILL_W, c)

    # ---- backdrop + shadow catcher ----------------------------------------
    bd = G.box("STUDIO_backdrop", (P.L * 0.5, 6.0, 1.6), (26.0, 0.06, 10.0),
               None, c, bev=0)
    m = bpy.data.materials.get("MAT_backdrop") or bpy.data.materials.new("MAT_backdrop")
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    if b:
        b.inputs["Base Color"].default_value = (0.90, 0.90, 0.885, 1)
        b.inputs["Roughness"].default_value = 0.62
        b.inputs["Metallic"].default_value = 0.0
    bd.data.materials.append(m)

    fl = G.box("STUDIO_floor", (P.L * 0.5, 0.0, -0.011), (26.0, 14.0, 0.02),
               m, c, bev=0)

    # ---- cameras -----------------------------------------------------------
    cams = {}
    for name, spec in PRESETS.items():
        cams[name] = _cam(name, spec, c)
    scene.camera = cams["Reference"]

    # ---- render settings ---------------------------------------------------
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in {
        i.identifier for i in
        bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items
    } else 'BLENDER_EEVEE'
    scene.render.resolution_x = REF_RES[0]
    scene.render.resolution_y = REF_RES[1]
    scene.render.film_transparent = False
    # Filmic tone mapping (master prompt V2 section 6D.2): holds the specular
    # highlights on polished metal instead of clipping them to flat white.
    for tf in ('AgX', 'Filmic', 'Standard'):
        try:
            scene.view_settings.view_transform = tf
            break
        except Exception:
            continue
    for look in ('AgX - Punchy', 'Punchy', 'None'):
        try:
            scene.view_settings.look = look
            break
        except Exception:
            continue
    scene.view_settings.exposure = 0.0
    scene.display_settings.display_device = 'sRGB'
    ee = getattr(scene, "eevee", None)
    if ee:
        for attr, val in (("use_gtao", True), ("gtao_distance", 0.22),
                          ("gtao_factor", 1.0), ("gtao_quality", 0.5),
                          ("use_bloom", False), ("taa_render_samples", 96),
                          ("use_raytracing", True), ("use_shadows", True),
                          ("shadow_ray_count", 2), ("use_volumetric_lights", False)):
            if hasattr(ee, attr):
                try:
                    setattr(ee, attr, val)
                except Exception:
                    pass
    return cams


def set_cutaway(on=True):
    """Hide/show the removable front barrel panels."""
    n = 0
    for ob in bpy.data.objects:
        if ob.name.startswith("BARREL_") and ob.name.endswith("_front"):
            ob.hide_render = on
            ob.hide_viewport = on
            n += 1
    return n


def set_studio_ground(on=False):
    for name in ("STUDIO_floor", "STUDIO_backdrop"):
        ob = bpy.data.objects.get(name)
        if ob:
            ob.hide_render = not on
            ob.hide_viewport = not on


def use(name):
    ob = bpy.data.objects.get("CAM_" + name.replace(" ", "_"))
    if ob:
        bpy.context.scene.camera = ob
    return ob


def render(path, cam="Reference", res=REF_RES, samples=None):
    s = bpy.context.scene
    use(cam)
    s.render.resolution_x, s.render.resolution_y = res
    s.render.image_settings.file_format = 'PNG'
    s.render.filepath = path
    if samples and hasattr(s, "eevee") and hasattr(s.eevee, "taa_render_samples"):
        s.eevee.taa_render_samples = samples
    bpy.ops.render.render(write_still=True)
    return path
