# -*- coding: utf-8 -*-
"""PBR material palette.

Values follow the master prompt V2 section 6D.1 table so the machine reads as
several distinct finishes rather than one flat silver mass. Brushing direction
follows the manufacturing form: vertical on cylindrical hopper walls, axial on
machined shafts, isotropic sand-cast grain on painted housings.
"""

import bpy
from math import pi

# name: (hex, metalness, roughness, extra)
#   brush: axis the surface grain runs along ('X' | 'Z')
#   cast:  isotropic cast-metal grain
PALETTE = {
    # polished hopper stainless -- long controlled brushed highlights
    "MAT_stainless":    ("#C1C5C7", 0.95, 0.24, {"brush": "Z", "aniso": 0.55}),
    "MAT_stainless_b":  ("#C7CBCD", 0.95, 0.20, {"brush": "Z", "aniso": 0.72}),
    # Machined screw steel -- crisp flight edges, darker roots. Deliberately
    # several stops below the barrel: the screws are the subject of this
    # machine and they sit inside a pale housing, so value, not hue, is what
    # separates them. The bore behind them is darker again, which is what gives
    # each flight an edge to be seen against.
    #
    # Metalness is 0.62, not 1.0. A full metal takes its value almost entirely
    # from what it reflects, so against the console's bright environment the
    # screws rendered near-white however dark their base colour was set -- the
    # colour simply had nowhere to act. Backing off metalness lets the base
    # colour carry, and the flights read as machined steel instead of chrome.
    "MAT_screw_steel":  ("#5F686E", 0.62, 0.30, {"brush": "X", "aniso": 0.40}),
    # barrel / heater steel -- modular readable surfaces
    "MAT_barrel_steel": ("#B7BCBE", 0.85, 0.31, {"brush": "X", "aniso": 0.25}),
    # painted cast gearbox -- warmer, softer cast reflection
    "MAT_cast_gray":    ("#B4B5B2", 0.60, 0.48, {"cast": True}),
    "MAT_cast_light":   ("#BEBFBB", 0.58, 0.51, {"cast": True}),
    # painted motor -- dark blue-gray with strong fin contrast
    "MAT_motor_body":   ("#3B515E", 0.65, 0.40, {}),
    "MAT_motor_fin":    ("#283A46", 0.65, 0.46, {}),
    # cavities / gaskets -- deep separation, not pure black
    "MAT_dark":         ("#2A3238", 0.10, 0.72, {}),
    "MAT_cavity":       ("#161B1F", 0.08, 0.80, {}),
    "MAT_bore":         ("#23292E", 0.30, 0.66, {"brush": "X"}),
    # restrained thin bronze heater accent
    "MAT_bronze":       ("#816B3D", 0.72, 0.39, {}),
    # small warm focal accent at the outlet
    "MAT_brass":        ("#B18B43", 0.82, 0.32, {}),
    "MAT_bolt":         ("#A8ACAE", 0.94, 0.30, {}),
    "MAT_mesh":         ("#7C8184", 0.90, 0.40, {}),
    "MAT_pellet_cool":  ("#D9DCD4", 0.00, 0.62, {}),
    "MAT_pellet_melt":  ("#C86A22", 0.00, 0.44, {}),
}


def _rgb(h):
    h = h.lstrip("#")
    lin = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        lin.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (lin[0], lin[1], lin[2], 1.0)


def _set(bsdf, key, value):
    if key in bsdf.inputs:
        bsdf.inputs[key].default_value = value


def build_materials():
    made = {}
    for name, (hexcol, metal, rough, extra) in PALETTE.items():
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        out.location = (320, 0)
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs[0], out.inputs[0])

        _set(bsdf, "Base Color", _rgb(hexcol))
        _set(bsdf, "Metallic", metal)
        _set(bsdf, "Roughness", rough)
        _set(bsdf, "IOR", 2.2 if metal > 0.5 else 1.45)
        if extra.get("aniso"):
            _set(bsdf, "Anisotropic", extra["aniso"])
            _set(bsdf, "Anisotropic Rotation", 0.25)

        if extra.get("brush"):
            _brushed(nt, bsdf, axis=extra["brush"], base=rough,
                     strength=0.055 if metal > 0.9 else 0.075)
        elif extra.get("cast"):
            _cast_grain(nt, bsdf, base=rough)

        m.use_backface_culling = False
        m.diffuse_color = _rgb(hexcol)
        m.metallic = metal
        m.roughness = rough
        made[name] = m
    return made


def _coords(nt):
    tex = nt.nodes.new("ShaderNodeTexCoord")
    tex.location = (-1000, -140)
    return tex


def _brushed(nt, bsdf, axis="Z", base=0.25, strength=0.06):
    """Directional grain: noise stretched along the manufacturing direction.

    Object coordinates are squashed hard along the brush axis and stretched
    across it, so the streaks follow the form -- vertical on a hopper wall,
    axial on a shaft -- instead of one world-space direction for every mesh.
    """
    tex = _coords(nt)
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.location = (-800, -140)
    if axis == "Z":
        mapping.inputs["Scale"].default_value = (46.0, 46.0, 1.4)
    else:
        mapping.inputs["Scale"].default_value = (1.4, 46.0, 46.0)
    nt.links.new(tex.outputs["Object"], mapping.inputs["Vector"])

    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.location = (-600, -140)
    noise.inputs["Scale"].default_value = 6.0
    noise.inputs["Detail"].default_value = 4.0
    if "Roughness" in noise.inputs:
        noise.inputs["Roughness"].default_value = 0.55
    nt.links.new(mapping.outputs["Vector"], noise.inputs["Vector"])

    rng = nt.nodes.new("ShaderNodeMapRange")
    rng.location = (-400, -140)
    rng.inputs["From Min"].default_value = 0.30
    rng.inputs["From Max"].default_value = 0.70
    rng.inputs["To Min"].default_value = max(0.03, base - strength)
    rng.inputs["To Max"].default_value = min(0.95, base + strength)
    nt.links.new(noise.outputs["Fac"], rng.inputs["Value"])
    nt.links.new(rng.outputs["Result"], bsdf.inputs["Roughness"])

    # very shallow bump: catches light without reading as scratches
    bump = nt.nodes.new("ShaderNodeBump")
    bump.location = (-200, -320)
    bump.inputs["Strength"].default_value = 0.045
    bump.inputs["Distance"].default_value = 0.002
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    if "Normal" in bsdf.inputs:
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def _cast_grain(nt, bsdf, base=0.48):
    """Isotropic sand-cast texture for painted housings."""
    tex = _coords(nt)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.location = (-620, -140)
    noise.inputs["Scale"].default_value = 58.0
    noise.inputs["Detail"].default_value = 7.0
    if "Roughness" in noise.inputs:
        noise.inputs["Roughness"].default_value = 0.62
    nt.links.new(tex.outputs["Object"], noise.inputs["Vector"])

    rng = nt.nodes.new("ShaderNodeMapRange")
    rng.location = (-400, -140)
    rng.inputs["From Min"].default_value = 0.32
    rng.inputs["From Max"].default_value = 0.68
    rng.inputs["To Min"].default_value = max(0.05, base - 0.06)
    rng.inputs["To Max"].default_value = min(0.95, base + 0.06)
    nt.links.new(noise.outputs["Fac"], rng.inputs["Value"])
    nt.links.new(rng.outputs["Result"], bsdf.inputs["Roughness"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.location = (-200, -320)
    bump.inputs["Strength"].default_value = 0.10
    bump.inputs["Distance"].default_value = 0.0016
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    if "Normal" in bsdf.inputs:
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def get(name):
    return bpy.data.materials[name]
