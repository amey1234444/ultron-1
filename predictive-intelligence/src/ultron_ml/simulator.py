"""Correlated telemetry simulator (Doc A §15; brief: SIMULATOR).

The simulator is a low-order process model, NOT a physics twin. Signals are coupled the way the
catalogue describes them (P -> torque -> I -> TMOT/TGB with lags; FR/L drive P and I; RPM/SRPM via
the gear ratio; MT follows Z3 plus shear heating). Scenarios inject a *cause* (e.g. restriction)
and let the coupling produce the symptoms, so labels are causes and symptoms are emergent.

All numbers come from the profile configuration (nominals, recipe setpoints) except the coupling
gains, which are documented constants of the simulator itself. Output is clearly synthetic.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum

import numpy as np
import pandas as pd

from ultron_ml.config.models import OperatingState, ProfileConfig, RecipeSpec

CHANNELS = ["RPM", "SRPM", "VM", "VG", "TMOT", "TGB", "Z1", "Z2", "Z3", "MT", "P", "L", "I", "FR"]


class Scenario(StrEnum):
    HEALTHY = "healthy"
    # D1 / family faults (cause injected)
    FEED_STARVATION = "feed_starvation"
    OVERFEED = "overfeed"
    DOWNSTREAM_RESTRICTION = "downstream_restriction"
    MOTOR_OVERLOAD = "motor_overload"
    MOTOR_VIBRATION = "motor_vibration"
    GEARBOX_VIBRATION = "gearbox_vibration"
    THERMAL_CONTROL = "thermal_control"
    MELT_THERMAL = "melt_thermal"
    SPEED_ANOMALY = "speed_anomaly"
    COOLING_DEGRADATION = "cooling_degradation"
    PROCESS_INSTABILITY = "process_instability"
    # sensor / data faults
    FROZEN_SENSOR = "frozen_sensor"
    SENSOR_DROPOUT = "sensor_dropout"
    FALSE_HIGH_PRESSURE = "false_high_pressure"
    FALSE_LOW_LEVEL = "false_low_level"
    CURRENT_SCALING = "current_scaling"
    RPM_PULSE_LOSS = "rpm_pulse_loss"
    # operating-state transitions
    STARTUP = "startup"
    WARMING = "warming"
    RECIPE_CHANGE = "recipe_change"
    PURGING = "purging"
    SHUTDOWN = "shutdown"


# scenario -> (fault family label, D1 fault id or None)   (TSE taxonomy, Doc A §10.1)
SCENARIO_LABEL: dict[Scenario, tuple[str | None, str | None]] = {
    Scenario.HEALTHY: (None, None),
    Scenario.FEED_STARVATION: ("FEED_STARVATION", "TSE_FEED_STARVATION"),
    Scenario.OVERFEED: ("OVERFEED_HIGH_LOAD", "TSE_OVERFEED"),
    Scenario.DOWNSTREAM_RESTRICTION: ("DOWNSTREAM_FLOW_RESTRICTION", None),  # D2: screen/die/viscosity ambiguous
    Scenario.MOTOR_OVERLOAD: ("MOTOR_OVERLOAD", "TSE_MOTOR_OVERLOAD"),
    Scenario.MOTOR_VIBRATION: ("MOTOR_VIBRATION", "TSE_MOTOR_VIBRATION"),
    Scenario.GEARBOX_VIBRATION: ("GEARBOX_VIBRATION", "TSE_GEARBOX_VIBRATION"),
    Scenario.THERMAL_CONTROL: ("THERMAL_CONTROL", "TSE_ZONE_THERMAL_CONTROL"),
    Scenario.MELT_THERMAL: ("MELT_THERMAL", "TSE_MELT_THERMAL"),
    Scenario.SPEED_ANOMALY: ("SPEED_ANOMALY", "TSE_SPEED_ANOMALY"),
    Scenario.COOLING_DEGRADATION: ("COOLING_DEGRADATION", "TSE_COOLING_DEGRADATION"),
    Scenario.PROCESS_INSTABILITY: ("PROCESS_INSTABILITY", "TSE_PROCESS_INSTABILITY"),
    Scenario.FROZEN_SENSOR: ("SENSOR_DATA_FAULT", None),
    Scenario.SENSOR_DROPOUT: ("SENSOR_DATA_FAULT", None),
    Scenario.FALSE_HIGH_PRESSURE: ("SENSOR_DATA_FAULT", None),
    Scenario.FALSE_LOW_LEVEL: ("SENSOR_DATA_FAULT", None),
    Scenario.CURRENT_SCALING: ("SENSOR_DATA_FAULT", None),
    Scenario.RPM_PULSE_LOSS: ("SENSOR_DATA_FAULT", None),
    Scenario.STARTUP: (None, None),
    Scenario.WARMING: (None, None),
    Scenario.RECIPE_CHANGE: (None, None),
    Scenario.PURGING: (None, None),
    Scenario.SHUTDOWN: (None, None),
}
SENSOR_SCENARIOS = {s for s, (fam, _) in SCENARIO_LABEL.items() if fam == "SENSOR_DATA_FAULT"}
STATE_SCENARIOS = {Scenario.STARTUP, Scenario.WARMING, Scenario.RECIPE_CHANGE, Scenario.PURGING, Scenario.SHUTDOWN}
PROCESS_FAULT_SCENARIOS = {s for s, (fam, _) in SCENARIO_LABEL.items() if fam and fam != "SENSOR_DATA_FAULT"}


@dataclass
class SimConfig:
    seed: int = 42
    duration_s: int = 3600
    sample_rate_hz: float = 1.0
    noise_scale: float = 1.0
    fault_onset_s: int | None = None  # None -> 40 % of duration
    degradation_speed: float = 1.0  # multiplies ramp rate (1 = reaches severe ~15 min after onset)
    recipe_id: str | None = None
    initial_state: OperatingState = OperatingState.STEADY_PRODUCTION
    machine_id: str = "SIM-TSE-01"
    machine_profile: str = "tse"
    start_time: datetime = field(default_factory=lambda: datetime(2026, 1, 1, tzinfo=UTC))
    affected_channel: str | None = None  # for sensor scenarios
    machine_bias: float = 0.0  # per-machine offset (fraction of nominal) to create unseen-machine variation


@dataclass
class _Coupling:
    # documented simulator constants (not engineering thresholds)
    p_per_fr: float = 4.0 / 50.0  # MPa per kg/h at nominal viscosity
    i_base: float = 2.0  # A at zero load
    i_per_p: float = 1.25  # A per MPa
    i_per_fr: float = 0.06  # A per kg/h
    tmot_per_i: float = 2.5  # degC steady rise per A above nominal
    tgb_per_i: float = 2.0
    thermal_tau_s: float = 240.0  # first-order lag for TMOT/TGB
    mt_offset: float = -10.0  # MT = Z3 + offset + shear term
    mt_per_i: float = 1.5
    rpm_droop_per_i: float = 6.0  # rpm lost per A above severe
    vib_per_i: float = 0.03


class ExtruderSimulator:
    def __init__(self, profile: ProfileConfig, cfg: SimConfig, scenario: Scenario = Scenario.HEALTHY) -> None:
        self.profile = profile
        self.cfg = cfg
        self.scenario = scenario
        self.rng = np.random.default_rng(cfg.seed)
        self.k = _Coupling()
        recipes = profile.recipes.by_id()
        rid = cfg.recipe_id or next(iter(recipes))
        self.recipe: RecipeSpec = recipes[rid]
        self.alt_recipe: RecipeSpec | None = next((r for r in recipes.values() if r.recipe_id != rid), None)
        self.nominal = {c.code: float(c.nominal) for c in profile.channels.channels if c.nominal is not None}
        self.gear = profile.channels.gear_ratio or 20.0

    # ---- public ------------------------------------------------------------------------
    def run(self) -> pd.DataFrame:
        cfg, rec, k = self.cfg, self.recipe, self.k
        n = int(cfg.duration_s * cfg.sample_rate_hz)
        dt = 1.0 / cfg.sample_rate_hz
        onset = cfg.fault_onset_s if cfg.fault_onset_s is not None else int(0.4 * cfg.duration_s)
        ramp_s = 900.0 / max(cfg.degradation_speed, 1e-3)
        noise = cfg.noise_scale
        rows: list[dict[str, object]] = []

        # slow drifts (AR(1)) to mimic real process wander
        def ar(scale: float) -> np.ndarray:
            x = np.zeros(n)
            for i in range(1, n):
                x[i] = 0.995 * x[i - 1] + self.rng.normal(0, scale)
            return x

        drift_fr, drift_p, drift_l = ar(0.05), ar(0.004), ar(0.05)
        tmot = self.nominal["TMOT"]
        tgb = self.nominal["TGB"]
        zones = dict(rec.zone_setpoints)
        level = self.nominal["L"]
        state = cfg.initial_state
        recipe_id = rec.recipe_id
        aff = cfg.affected_channel or self._default_sensor_channel()
        frozen_val: dict[str, float] = {}
        bias = 1.0 + cfg.machine_bias

        for i in range(n):
            t = i * dt
            ts = cfg.start_time + timedelta(seconds=t)
            sev = 0.0 if t < onset else min(1.0, (t - onset) / ramp_s)  # 0..1 ramp
            fam, _ = SCENARIO_LABEL[self.scenario]
            fault_active = sev > 0 and self.scenario not in STATE_SCENARIOS

            # ---- operating state trajectory --------------------------------------------
            state, recipe_id, s_factor, heat_factor = self._state_profile(t, state, recipe_id)

            # ---- causes -------------------------------------------------------------------
            fr_cmd = rec.feed_setpoint * s_factor
            restriction = 0.0  # multiplies P
            extra_load = 0.0  # A
            cooling_loss = 0.0  # degC
            vib_m = vib_g = 0.0
            zone_err = 0.0
            mt_extra = 0.0
            speed_err = 0.0
            osc = 0.0
            if self.scenario is Scenario.FEED_STARVATION:
                level = max(3.0, self.nominal["L"] - 72.0 * sev)
                fr_cmd *= 1.0 - 0.55 * sev
            elif self.scenario is Scenario.OVERFEED:
                fr_cmd *= 1.0 + 0.45 * sev
            elif self.scenario is Scenario.DOWNSTREAM_RESTRICTION:
                restriction = 0.7 * sev
            elif self.scenario is Scenario.MOTOR_OVERLOAD:
                extra_load = 11.0 * sev
            elif self.scenario is Scenario.MOTOR_VIBRATION:
                vib_m = 1.8 * sev
            elif self.scenario is Scenario.GEARBOX_VIBRATION:
                vib_g = 1.8 * sev
            elif self.scenario is Scenario.THERMAL_CONTROL:
                zone_err = 28.0 * sev
            elif self.scenario is Scenario.MELT_THERMAL:
                mt_extra = 32.0 * sev
            elif self.scenario is Scenario.SPEED_ANOMALY:
                speed_err = -0.12 * sev
            elif self.scenario is Scenario.COOLING_DEGRADATION:
                cooling_loss = 55.0 * sev
            elif self.scenario is Scenario.PROCESS_INSTABILITY:
                osc = 0.9 * sev * np.sin(2 * np.pi * t / 45.0)
            if state is OperatingState.OFF:
                fr_cmd = 0.0

            # ---- process model -------------------------------------------------------------
            fr = max(0.0, fr_cmd + drift_fr[i] + self.rng.normal(0, 0.4 * noise)) * bias
            if state is not OperatingState.OFF and self.scenario is not Scenario.FEED_STARVATION:
                level = float(np.clip(self.nominal["L"] + drift_l[i] * 10 + self.rng.normal(0, 0.6 * noise), 5, 98))
            rpm = rec.motor_speed_setpoint * s_factor
            p = k.p_per_fr * fr * (1.0 + restriction) * (1.0 + 0.4 * osc) + drift_p[i] + self.rng.normal(0, 0.03 * noise)
            if state is OperatingState.OFF:
                p = 0.0
            cur = k.i_base + k.i_per_p * p + k.i_per_fr * fr + extra_load + 0.6 * osc + self.rng.normal(0, 0.12 * noise)
            if state is OperatingState.OFF:
                cur = 0.0
            sev_i = self.profile.channel("I").severe
            over = max(0.0, cur - (sev_i.high if sev_i and sev_i.high else 20.0))
            rpm = max(0.0, rpm - k.rpm_droop_per_i * over + self.rng.normal(0, 2.5 * noise))
            srpm = rpm / self.gear * (1.0 + speed_err) + self.rng.normal(0, 0.15 * noise)
            # thermal first-order lags
            tm_target = self.nominal["TMOT"] + k.tmot_per_i * max(0.0, cur - self.nominal["I"]) + cooling_loss
            tg_target = self.nominal["TGB"] + k.tgb_per_i * max(0.0, cur - self.nominal["I"]) + cooling_loss * 0.6 + 15.0 * vib_g
            if state is OperatingState.OFF:
                tm_target = tg_target = 25.0
            a = dt / k.thermal_tau_s
            tmot += a * (tm_target - tmot) + self.rng.normal(0, 0.05 * noise)
            tgb += a * (tg_target - tgb) + self.rng.normal(0, 0.05 * noise)
            z: dict[str, float] = {}
            for zn, sp in rec.zone_setpoints.items():
                tgt = sp * heat_factor + (zone_err if zn == "Z2" else 0.0)
                zones[zn] += (dt / 90.0) * (tgt - zones[zn])
                z[zn] = zones[zn] + self.rng.normal(0, 0.4 * noise) + 1.5 * osc
            mt = z["Z3"] + k.mt_offset + k.mt_per_i * max(0.0, cur - self.nominal["I"]) + mt_extra + self.rng.normal(0, 0.5 * noise)
            if heat_factor < 0.99:
                mt = z["Z3"] + k.mt_offset * heat_factor
            vm = self.nominal["VM"] + k.vib_per_i * max(0.0, cur - self.nominal["I"]) + vib_m + self.rng.normal(0, 0.06 * noise)
            vg = self.nominal["VG"] + 0.02 * max(0.0, cur - self.nominal["I"]) + vib_g + self.rng.normal(0, 0.06 * noise)
            if state is OperatingState.OFF:
                vm = vg = 0.05

            ch: dict[str, float | None] = {
                "RPM": rpm, "SRPM": srpm, "VM": max(0.0, vm), "VG": max(0.0, vg), "TMOT": tmot, "TGB": tgb,
                "Z1": z["Z1"], "Z2": z["Z2"], "Z3": z["Z3"], "MT": mt, "P": max(0.0, p), "L": level, "I": max(0.0, cur), "FR": fr,
            }

            # ---- sensor / data faults (applied to the *observation*, truth is unchanged) -----
            if sev > 0 and self.scenario in SENSOR_SCENARIOS:
                if self.scenario is Scenario.FROZEN_SENSOR:
                    frozen_val.setdefault(aff, float(ch[aff] or 0.0))
                    ch[aff] = frozen_val[aff]
                elif self.scenario is Scenario.SENSOR_DROPOUT:
                    ch[aff] = None
                elif self.scenario is Scenario.FALSE_HIGH_PRESSURE:
                    ch["P"] = float(ch["P"] or 0.0) + 2.6 * sev
                elif self.scenario is Scenario.FALSE_LOW_LEVEL:
                    ch["L"] = max(0.0, float(ch["L"] or 0.0) - 70.0 * sev)
                elif self.scenario is Scenario.CURRENT_SCALING:
                    ch["I"] = float(ch["I"] or 0.0) * (1.0 + 0.8 * sev)
                elif self.scenario is Scenario.RPM_PULSE_LOSS:
                    ch["RPM"] = float(ch["RPM"] or 0.0) * (1.0 - 0.6 * sev)

            row: dict[str, object] = {
                "timestamp": ts, "machine_id": cfg.machine_id, "machine_profile": cfg.machine_profile,
                "operating_state": state.value, "recipe_id": recipe_id, "scenario": self.scenario.value,
                "fault_family": fam if fault_active else None,
                "fault_id": SCENARIO_LABEL[self.scenario][1] if fault_active else None,
                "fault_active": bool(fault_active), "severity_ramp": sev, "onset_s": onset if self.scenario not in STATE_SCENARIOS and fam else None,
            }
            row.update(ch)
            rows.append(row)
        df = pd.DataFrame(rows)
        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
        return df

    # ---- helpers ------------------------------------------------------------------------
    def _default_sensor_channel(self) -> str:
        return {"frozen_sensor": "P", "sensor_dropout": "I"}.get(self.scenario.value, "P")

    def _state_profile(self, t: float, state: OperatingState, recipe_id: str) -> tuple[OperatingState, str, float, float]:
        """Return (state, recipe_id, speed/feed factor, heater factor) for state scenarios."""
        d = self.cfg.duration_s
        sc = self.scenario
        if sc is Scenario.STARTUP:
            if t < 0.1 * d:
                return OperatingState.OFF, recipe_id, 0.0, 0.15
            if t < 0.35 * d:
                f = (t - 0.1 * d) / (0.25 * d)
                return OperatingState.STARTING, recipe_id, 0.2 + 0.8 * f, 0.6 + 0.4 * f
            return OperatingState.STEADY_PRODUCTION, recipe_id, 1.0, 1.0
        if sc is Scenario.WARMING:
            if t < 0.6 * d:
                f = t / (0.6 * d)
                return OperatingState.WARMING, recipe_id, 0.0, 0.3 + 0.7 * f
            return OperatingState.STEADY_PRODUCTION, recipe_id, 1.0, 1.0
        if sc is Scenario.RECIPE_CHANGE and self.alt_recipe is not None:
            if 0.4 * d <= t < 0.55 * d:
                f = (t - 0.4 * d) / (0.15 * d)
                ratio = self.alt_recipe.feed_setpoint / self.recipe.feed_setpoint
                return OperatingState.RECIPE_CHANGE, self.alt_recipe.recipe_id, 1.0 + (ratio - 1.0) * f, 1.0
            if t >= 0.55 * d:
                return OperatingState.STEADY_PRODUCTION, self.alt_recipe.recipe_id, self.alt_recipe.feed_setpoint / self.recipe.feed_setpoint, 1.0
            return OperatingState.STEADY_PRODUCTION, recipe_id, 1.0, 1.0
        if sc is Scenario.PURGING:
            if 0.4 * d <= t < 0.5 * d:
                return OperatingState.PURGING, recipe_id, 0.55, 1.0
            return OperatingState.STEADY_PRODUCTION, recipe_id, 1.0, 1.0
        if sc is Scenario.SHUTDOWN:
            if t >= 0.85 * d:
                return OperatingState.OFF, recipe_id, 0.0, 0.5
            if t >= 0.6 * d:
                f = (t - 0.6 * d) / (0.25 * d)
                return OperatingState.SHUTDOWN, recipe_id, 1.0 - 0.9 * f, 1.0 - 0.3 * f
            return OperatingState.STEADY_PRODUCTION, recipe_id, 1.0, 1.0
        return self.cfg.initial_state, recipe_id, 1.0, 1.0


def simulate(profile: ProfileConfig, scenario: Scenario | str, cfg: SimConfig | None = None) -> pd.DataFrame:
    return ExtruderSimulator(profile, cfg or SimConfig(), Scenario(scenario)).run()


def simulate_fleet(
    profile: ProfileConfig,
    scenarios: list[Scenario],
    n_machines: int = 3,
    episodes_per_scenario: int = 2,
    duration_s: int = 3600,
    seed: int = 42,
    inter_episode_gap_s: int = 2400,
) -> pd.DataFrame:
    """Sequential episodes per machine (seeded shuffled scenario order, distinct machine bias).

    Episodes are separated by ``inter_episode_gap_s`` (default = max lookback 600 s + max horizon
    1800 s) so chronological partition purging never has to discard whole episodes.
    """
    rng = np.random.default_rng(seed)
    frames: list[pd.DataFrame] = []
    for m in range(n_machines):
        t0 = datetime(2026, 1, 1, tzinfo=UTC) + timedelta(days=30 * m)
        bias = float(rng.normal(0, 0.02))
        order = [s for s in scenarios for _ in range(episodes_per_scenario)]
        rng.shuffle(order)  # type: ignore[arg-type]
        for ep, s in enumerate(order):
            cfg = SimConfig(seed=int(rng.integers(0, 2**31 - 1)), duration_s=duration_s, machine_id=f"SIM-{profile.name.upper()}-{m + 1:02d}",
                            machine_profile=profile.name, start_time=t0 + timedelta(seconds=ep * (duration_s + inter_episode_gap_s)),
                            machine_bias=bias, fault_onset_s=int(rng.integers(int(0.3 * duration_s), int(0.6 * duration_s))))
            df = ExtruderSimulator(profile, cfg, s).run()
            df["episode_id"] = f"{cfg.machine_id}-E{ep:03d}-{s.value}"
            frames.append(df)
    return pd.concat(frames, ignore_index=True)
