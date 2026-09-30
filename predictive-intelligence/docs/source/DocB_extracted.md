ULTRON
Single-Screw Extruder
MASTER FAULT ANALYSIS CATALOGUE
Machine Part -> Frequent -> Sometimes -> Rare -> Sensor Min / Nominal / Max -> Fault Value Vector
| Document | Master Fault Analysis Catalogue & Sensor Value Matrix |
| Project | ULTRON - Single-Screw Extruder |
| Version | 1.0 |
| Date | 01 September 2026 |
| Purpose | Single source of truth for simulation, Diagnosis, Advance Diagnosis and fault-library implementation |
|  | IMPORTANT STATUS   All numeric limits in this document are ULTRON development/diagnostic screening values unless explicitly identified as OEM, statutory or safety limits. They are not a replacement for machine protection trips, OEM limits, risk assessment or commissioning calibration. |

## 1. Document Purpose and Governance
This document consolidates the accepted ULTRON single-screw-extruder fault hierarchy into a systematic engineering catalogue. It extends beyond the historical 61 validation scenarios and the existing diagnostic register so that foreseeable mechanical, thermal, process, material, instrumentation, electrical, communication and operating-state conditions are represented in one controlled structure.
Each machine/process part is organized by qualitative occurrence class: Frequent, Sometimes and Rare. These are maintenance-priority classes, not measured statistical failure probabilities. Field frequency classes should be recalibrated when enough operating history is available.
The catalogue is designed to serve four downstream uses: (1) simulation fault injection, (2) operator/maintenance Diagnosis, (3) analyst-level Advance Diagnosis, and (4) implementation of a controlled fault knowledge base.
## 2. Interpretation Rules
|  | Rule 1 - Use the sensor vector, not one threshold   A physical fault should be diagnosed from a coherent pattern such as pressure up + current up + RPM stable + hopper healthy, not from a single sensor crossing alone. |

|  | Rule 2 - Separate machine faults from data faults   Missing, frozen, stale, mis-scaled or wrongly mapped measurements must reduce diagnostic confidence and must never be interpreted as a physical zero. |

|  | Rule 3 - Preserve ambiguity   Where the present sensor package cannot separate screen restriction, die restriction and material viscosity, the system should report a family-level conclusion such as Downstream Flow Restriction rather than inventing a unique root cause. |

|  | Rule 4 - Development threshold vs protection limit   Detection threshold != safety trip != field-calibrated failure threshold. Safety action remains under the machine/VFD/protection system. |

## 3. Occurrence and Detectability Legend
| Class | Meaning | Typical UI treatment | Color |
| Frequent | Expected to be encountered during routine production or normal maintenance life. | Prioritize in Diagnosis and simulation. | Green |
| Sometimes | Recurring but less common; often needs multivariable or signal analysis. | Show with supporting evidence and confidence. | Amber |
| Rare | Unusual, catastrophic, configuration-specific or requiring major deterioration. | Retain in master library; often needs confirmation. | Red |
| D1 | Detectable with current ULTRON measurements/logic. | Can be implemented now. |  |
| D2 | Detectable only at family level or with ambiguity. | Do not over-localize. |  |
| D3 | Additional sensor, inspection, OEM/VFD data or quality evidence required. | Represent as possible cause / future capability. |  |

## 4. Master Sensor Reference Values
| Code | Measurement | Unit | Min / Low | Nominal | Normal | Warning / Developed | Severe / Max |
| RPM | Motor RPM | rpm | 1800 | 2000 | 1950-2050 | 1900 / 2100 | 1800 / 2250 |
| SRPM | Derived screw RPM (20:1) | rpm | 90 | 100 | 97.5-102.5 | 95 / 105 | 90 / 112.5 |
| VM | Motor vibration | mm/s RMS | 0.20 plausibility | 1.67 | 0-2.00 | >=2.50 | >=3.00 |
| VG | Gearbox vibration | mm/s RMS | 0.20 plausibility | 1.67 | 0-2.00 | >=2.50 | >=3.00 |
| TMOT | Motor temperature | C | 30 | 40 | 30-70 | >=80 | >=90 |
| TGB | Gearbox temperature | C | 30 | 40 | 30-70 | >=80 | >=90 |
| Z1 | Barrel Zone 1 | C | 150 | 180 | 170-190 | <=160 / >=200 | <=150 / >=210 |
| Z2 | Barrel Zone 2 | C | 170 | 210 | 195-215 | <=180 / >=220 | <=170 / >=230 |
| Z3 | Barrel Zone 3 | C | 190 | 220 | 210-230 | <=200 / >=240 | <=190 / >=250 |
| MT | Melt temperature | C | 180 | 210 | 200-220 | <=190 / >=230 | <=180 / >=240 |
| P | Melt pressure | MPa | 1.0 | 4.0 | 3.5-4.5 | <=2.0 / >=5.4 | <=1.0 / >=6.0 |
| L | Hopper level | % | 5 near-empty | 75 | 40-90 | <=25 / >=95 | <=10 low-critical |
| I | Motor current | A | 3 | 10 | 8-12 | <=6 / >=15 | <=3 / >=20 diagnostic |
| FR | Recipe feed rate | kg/h | 10 | 50 | recipe/context | - | 80 |

## 5. Derived Feature Reference Values
| Feature | Calculation / Basis | Reference / Threshold | Use |
| Motor 1x order | RPM/60 | 33.33 Hz @ 2000 rpm | Imbalance/supporting rotating fault evidence |
| Motor 2x order | 2 x RPM/60 | 66.67 Hz @ 2000 rpm | Misalignment support |
| Motor 3x order | 3 x RPM/60 | 100 Hz @ 2000 rpm | Looseness/harmonic support |
| Screw 1x order | SRPM/60 | 1.667 Hz @ 100 rpm | Screw eccentricity/load modulation |
| Pressure sigma | std(P) | >=0.40 MPa warning; >=0.80 severe | Pressure/process instability |
| Pressure P-P | max-min | >=0.50 MPa; >=1.50 severe | Surging/pulsation |
| Pressure slope | dP/dt | >= +/-0.005 MPa/s | Increasing/decreasing pressure trend |
| RPM sigma | std(RPM) | >=50 rpm; >=100 severe | Speed instability |
| Temperature sigma | std(T) | >=3 C; >=6 severe | Thermal instability |
| Thermal runaway slope | dT/dt | >=8 C/min plus over-temperature | Runaway candidate |
| Hopper depletion slope | dL/dt | <=-3%/min for >=60 s | Rapid depletion/starvation |
| Current sigma | std(I) | >=1.5 A; >=3 A severe | Load instability |
| Vibration crest factor | Peak/RMS | >=4 supporting | Impulsive bearing/rub/impact evidence |
| Vibration kurtosis | 4th moment | >=3.5 supporting | Impulsive bearing/gear evidence |
| Barrel profile | Z1/Z2/Z3 | 180/210/220 C | Use zone residuals; >12-15 C local/spatial deviation is significant |

## 6. Master Fault Catalogue - Document Map
| Section | Machine / Process Part | Catalogue Scope |
| 1 | Hopper & Raw-Material Feed System | Solids storage, material availability, feed-throat delivery and feed stability. Primary present signals: L, P, I, RPM; recipe feed reference FR=50 kg/h. |
| 2 | Main Motor | Electrical-to-mechanical drive source. Primary signals: RPM, VM, TMOT, I; FFT/order evidence used for rotating faults. |
| 3 | Gearbox | Reduction train and bearings. Primary signals: VG, TGB, I, RPM; exact gear defects require tooth counts and order analysis. |
| 4 | Coupling & Drive Transmission | Mechanical connection between motor, gearbox and screw. Uses VM/VG correlation, orders, RPM and process load response. |
| 5 | Screw | Primary conveying/melting element. Current system observes derived SRPM, P, I and temperature; direct screw torque/axial vibration would improve diagnosis. |
| 6 | Barrel - Mechanical | Barrel bore, liner, support and mechanical integrity. P/I efficiency trends are indirect; inspection is important. |
| 7 | Barrel Heating & Thermal Profile | Three controlled barrel zones plus melt temperature. The healthy profile is Z1/Z2/Z3 = 180/210/220 C; each zone must use its own limits. |
| 8 | Melt & Polymer Process | Melt pressure, melt temperature, current/load and speed interactions. Many process faults are multivariable rather than single-sensor threshold events. |
| 9 | Screen Pack & Breaker Plate | Downstream restriction component. Current P sensor is upstream, so screen vs die vs viscosity may be ambiguous without downstream pressure localization. |
| 10 | Die & Extrusion Head | Final flow restriction and shaping system. Current upstream pressure can detect restriction but not uniquely localize screen vs die. |
| 11 | Raw Material / Polymer Condition | Recipe reference: PA6 grade 6201, nominal feed 50 kg/h, melt 210 C, melt pressure 4 MPa. Material faults often alter the MT-P-I relationship. |
| 12 | Cooling System | Barrel, motor and gearbox cooling performance. Current temperatures provide consequence detection; flow/valve measurements would improve cause identification. |
| 13 | Lubrication System | Mainly gearbox/bearing lubrication. Present detection is consequence-based using TGB/VG; oil level, pressure and condition sensing would improve specificity. |
| 14 | Electrical Supply & VFD | Drive electronics and incoming power. Current ULTRON has aggregate motor current and speed; exact phase/winding faults require phase voltage/current and VFD status. |
| 15 | Instrumentation & Sensors | Sensor integrity faults must be diagnosed separately from machine faults. Missing data is never interpreted as a physical zero. |
| 16 | Data, Telemetry & Communication | Digital integrity conditions. These are not physical machine faults but must block or reduce diagnostic confidence. |
| 17 | Configuration & Software | Configuration faults change the meaning of otherwise valid sensor values. Versioning and tag mapping are therefore part of diagnosis. |
| 18 | Extrudate / Product Quality | These are product symptoms or outcomes. Present ULTRON can often identify process precursors, but direct product-quality confirmation needs camera, thickness, dimensional or laboratory measurements. |
| 19 | Machine Frame, Foundation & Supports | Structural conditions can amplify motor/gearbox vibration and create alignment problems. Current diagnosis is mostly vibration-family plus inspection. |
| 20 | Seals, Flanges & Leakage | Leakage faults often have weak unique signatures in current sensors; pressure trends plus visual/leak/oil sensors are recommended. |
| 21 | Startup, Shutdown & Operating-State Abnormalities | State-aware diagnosis prevents normal transitions from being misclassified as faults. |

## 1. Hopper & Raw-Material Feed System
Solids storage, material availability, feed-throat delivery and feed stability. Primary present signals: L, P, I, RPM; recipe feed reference FR=50 kg/h.
Catalogue entries in this section: 29   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 1.1  FREQUENT
| 12 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| HF-001 | Low hopper material | L | L: 5% | L: 75% | L: 95% | L <40%; warning <=25%; critical <=10%; near-empty <=5%. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| HF-002 | Feed starvation | L, P, I, RPM | L: 5% P: 1.0 MPa I: 3 A RPM: 1800 rpm | L: 75% P: 4.0 MPa I: 10 A RPM: 2000 rpm | L: 95% P: 6.0 MPa I: 20 A RPM: 2250 rpm | Typical: L<=25%, P<=2.0 MPa, I<=6 A while RPM ~1950-2050. Severe: L<=10%, P<=1 MPa, I<=3 A. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| HF-003 | Gradual feed starvation | L, P, I | L: 5% P: 1.0 MPa I: 3 A | L: 75% P: 4.0 MPa I: 10 A | L: 95% P: 6.0 MPa I: 20 A | L slope <=-3%/min; P and I decline progressively; developed P<=2 MPa, I<=6 A. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| HF-004 | Abrupt feed starvation | L, P, I | L: 5% P: 1.0 MPa I: 3 A | L: 75% P: 4.0 MPa I: 10 A | L: 95% P: 6.0 MPa I: 20 A | Sudden P/I drop; typical P 1-2 MPa, I 3-6 A; L may be <=25% or remain healthy if throat blocked. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| HF-005 | Feed rate too low | FR, P, I | FR: 10 kg/h P: 1.0 MPa I: 3 A | FR: 50 kg/h P: 4.0 MPa I: 10 A | FR: 80 kg/h P: 6.0 MPa I: 20 A | FR below recipe; typical P 2.0-3.2 MPa, I 5-7.5 A at stable RPM. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| HF-006 | Overfeed / excessive feed rate | FR, P, I | FR: 10 kg/h P: 1.0 MPa I: 3 A | FR: 50 kg/h P: 4.0 MPa I: 10 A | FR: 80 kg/h P: 6.0 MPa I: 20 A | Developing P>=4.8 MPa, I>=12.5 A; warning P>=5.4, I>=15; severe P~6, I 18-20 A. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| HF-007 | Feed surging | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | P peak-to-peak >=0.5 MPa; severe >=1.5 MPa. I commonly cycles by >=2 A P-P. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| HF-008 | Feed instability | L, P, I | L: 5% P: 1.0 MPa I: 3 A | L: 75% P: 4.0 MPa I: 10 A | L: 95% P: 6.0 MPa I: 20 A | L sigma >=8% and/or P sigma >=0.40 MPa; I sigma >=1.5 A supporting. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| HF-009 | Hopper rapid depletion | L | L: 5% | L: 75% | L: 95% | Trend <=-3%/min for >=60 s; alert before L reaches <=25%. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| HF-010 | Feed-throat bridging | L, P, I | L: 5% P: 1.0 MPa I: 3 A | L: 75% P: 4.0 MPa I: 10 A | L: 95% P: 6.0 MPa I: 20 A | L remains 40-90% but P<=2.0-2.5 MPa and I<=6-7 A; RPM stable. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| HF-011 | Rat-holing / channel flow | L, P, I | L: 5% P: 1.0 MPa I: 3 A | L: 75% P: 4.0 MPa I: 10 A | L: 95% P: 6.0 MPa I: 20 A | L appears adequate while P/I repeatedly collapse and recover; cyclic pattern. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| HF-012 | Intermittent pellet flow | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Repeated P 2-4 MPa and I 5-10 A cycles at stable RPM. | D1 - Detectable now | Use persistence, correlation and operating-state context. |

## 1.2  SOMETIMES
| 10 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| HS-001 | Hopper overfill | L | L: 5% | L: 75% | L: 95% | L>=95% warning; overflow switch recommended for hard protection. | D2 - Family-level / extra sensor helpful | Use persistence, correlation and operating-state context. |
| HS-002 | Poor hopper discharge | L, P, I | L: 5% P: 1.0 MPa I: 3 A | L: 75% P: 4.0 MPa I: 10 A | L: 95% P: 6.0 MPa I: 20 A | L 50-90% with P<=3 MPa, I<=7 A; suggests material not reaching screw. | D2 - Family-level / extra sensor helpful | Use persistence, correlation and operating-state context. |
| HS-003 | Feed-throat restriction | L, P, I | L: 5% P: 1.0 MPa I: 3 A | L: 75% P: 4.0 MPa I: 10 A | L: 95% P: 6.0 MPa I: 20 A | Adequate L but P/I low or unstable; family-level without throat differential measurement. | D2 - Family-level / extra sensor helpful | Use persistence, correlation and operating-state context. |
| HS-004 | Pellet compaction | L, P, I | L: 5% P: 1.0 MPa I: 3 A | L: 75% P: 4.0 MPa I: 10 A | L: 95% P: 6.0 MPa I: 20 A | L may remain high; P/I oscillatory or persistently low. | D2 - Family-level / extra sensor helpful | Use persistence, correlation and operating-state context. |
| HS-005 | Hopper wall build-up | L | L: 5% | L: 75% | L: 95% | Level becomes biased/noisy/frozen while feed signature becomes unstable. | D2 - Family-level / extra sensor helpful | Use persistence, correlation and operating-state context. |
| HS-006 | Feeder calibration error - low | FR, P, I | FR: 10 kg/h P: 1.0 MPa I: 3 A | FR: 50 kg/h P: 4.0 MPa I: 10 A | FR: 80 kg/h P: 6.0 MPa I: 20 A | Command 50 kg/h but process resembles ~low feed: P 2.5-3.2 MPa, I 6-8 A. | D2 - Family-level / extra sensor helpful | Use persistence, correlation and operating-state context. |
| HS-007 | Feeder calibration error - high | FR, P, I | FR: 10 kg/h P: 1.0 MPa I: 3 A | FR: 50 kg/h P: 4.0 MPa I: 10 A | FR: 80 kg/h P: 6.0 MPa I: 20 A | Command 50 kg/h but process resembles overfeed: P 4.8-5.5 MPa, I 12.5-16 A. | D2 - Family-level / extra sensor helpful | Use persistence, correlation and operating-state context. |
| HS-008 | Feeder drive slipping | L, P, I | L: 5% P: 1.0 MPa I: 3 A | L: 75% P: 4.0 MPa I: 10 A | L: 95% P: 6.0 MPa I: 20 A | L adequate; P and I slowly decline while main RPM remains stable. | D2 - Family-level / extra sensor helpful | Use persistence, correlation and operating-state context. |
| HS-009 | Excess feeder pulsation | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | P sigma >=0.40 MPa; I sigma >=1.5 A. | D2 - Family-level / extra sensor helpful | Use persistence, correlation and operating-state context. |
| HS-010 | Feed throat temperature abnormal | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Process instability; add feed-throat temperature sensor for unique diagnosis. | D2 - Family-level / extra sensor helpful | Use persistence, correlation and operating-state context. |

## 1.3  RARE
| 7 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| HR-001 | Feeder motor complete failure | L, P, I | L: 5% P: 1.0 MPa I: 3 A | L: 75% P: 4.0 MPa I: 10 A | L: 95% P: 6.0 MPa I: 20 A | L>40% but P<=1-2 MPa and process I<=3-5 A; feeder current/status needed for confirmation. | D2 - Family-level / inspection required | Use persistence, correlation and operating-state context. |
| HR-002 | Feeder shaft/coupling break | L, P, I | L: 5% P: 1.0 MPa I: 3 A | L: 75% P: 4.0 MPa I: 10 A | L: 95% P: 6.0 MPa I: 20 A | Same external vector as feeder motor failure; physical inspection/feeder encoder required. | D2 - Family-level / inspection required | Use persistence, correlation and operating-state context. |
| HR-003 | Hopper gate stuck closed | L, P, I | L: 5% P: 1.0 MPa I: 3 A | L: 75% P: 4.0 MPa I: 10 A | L: 95% P: 6.0 MPa I: 20 A | L 60-95%, P<=2 MPa, I<=6 A. | D2 - Family-level / inspection required | Use persistence, correlation and operating-state context. |
| HR-004 | Hopper gate stuck open | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Uncontrolled overfeed: P>=5.4 MPa, I>=15 A. | D2 - Family-level / inspection required | Use persistence, correlation and operating-state context. |
| HR-005 | Foreign object blocking throat | L, P, I | L: 5% P: 1.0 MPa I: 3 A | L: 75% P: 4.0 MPa I: 10 A | L: 95% P: 6.0 MPa I: 20 A | Abrupt starvation vector despite healthy L; inspection required. | D2 - Family-level / inspection required | Use persistence, correlation and operating-state context. |
| HR-006 | Complete throat blockage | L, P, I | L: 5% P: 1.0 MPa I: 3 A | L: 75% P: 4.0 MPa I: 10 A | L: 95% P: 6.0 MPa I: 20 A | L high, P near 1-2 MPa, I near 3-6 A; no output. | D2 - Family-level / inspection required | Use persistence, correlation and operating-state context. |
| HR-007 | Major level-sensor obstruction | L | L: 5% | L: 75% | L: 95% | Implausibly frozen/noisy level; diagnose as instrumentation before process fault. | D2 - Family-level / inspection required | Use persistence, correlation and operating-state context. |

## 2. Main Motor
Electrical-to-mechanical drive source. Primary signals: RPM, VM, TMOT, I; FFT/order evidence used for rotating faults.
Catalogue entries in this section: 37   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 2.1  FREQUENT
| 8 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| MF-001 | Motor overload | RPM, I, TMOT | RPM: 1800 rpm I: 3 A TMOT: 30 C | RPM: 2000 rpm I: 10 A TMOT: 40 C | RPM: 2250 rpm I: 20 A TMOT: 90 C | I>=15 A warning; >=20 A severe. TMOT often >=80 C; RPM may fall <=1900. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| MF-002 | High motor temperature | TMOT | TMOT: 30 C | TMOT: 40 C | TMOT: 90 C | TMOT>70 developing; >=80 C warning; >=90 C severe. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| MF-003 | High motor vibration | VM | VM: 0.20 mm/s | VM: 1.67 mm/s | VM: 3.00 mm/s | VM>2.0 developing; >=2.5 mm/s warning; >=3.0 severe. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| MF-004 | Motor load increasing | I | I: 3 A | I: 10 A | I: 20 A | I>12.5 A baseline deviation or trend >=0.6 A/min; warning >=15 A. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| MF-005 | Motor speed low | RPM | RPM: 1800 rpm | RPM: 2000 rpm | RPM: 2250 rpm | <1950 developing; <=1900 warning; <=1800 severe. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| MF-006 | Motor speed high | RPM | RPM: 1800 rpm | RPM: 2000 rpm | RPM: 2250 rpm | >2050 developing; >=2100 warning; >=2250 severe. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| MF-007 | Motor speed  instability | RPM | RPM: 1800  rpm | RPM: 2000  rpm | RPM: 2250 rpm | RPM sigma >=50 rpm warning; >=100 rpm  severe. | D1 - Detectable  now | Use persistence, correlation and operating-state  context. |
| MF-008 | Motor hunting | RPM, I | RPM: 1800 rpm I: 3 A | RPM: 2000 rpm I: 10 A | RPM: 2250 rpm I: 20 A | RPM P-P >=100 rpm with cyclic current response. | D1 - Detectable now | Use persistence, correlation and operating-state context. |

## 2.2  SOMETIMES
| 15 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| MS-001 | Motor bearing degradation | VM, TMOT, I | VM: 0.20 mm/s TMOT: 30 C I: 3 A | VM: 1.67 mm/s TMOT: 40 C I: 10 A | VM: 3.00 mm/s TMOT: 90 C I: 20 A | VM 2.0-2.3 developing; >=2.5 warning; >=3 severe. Supporting TMOT 50-80 C, crest factor >=4, kurtosis >=3.5. | D2 - Detectable at family level | Use persistence, correlation and operating-state context. |
| MS-002 | Rotor imbalance | VM, RPM, 1X | VM: 0.20 mm/s RPM: 1800 rpm 1X: N/A | VM: 1.67 mm/s RPM: 2000 rpm 1X: 33.33 Hz @ 2000 rpm | VM: 3.00 mm/s RPM: 2250 rpm 1X: speed-dependent | VM commonly 2.3-3+ mm/s; dominant 1x = 33.33 Hz at 2000 rpm. | D2 - Detectable at family level | Use persistence, correlation and operating-state context. |
| MS-003 | Motor/coupling misalignment | VM, VG, RPM | VM: 0.20 mm/s VG: 0.20 mm/s RPM: 1800 rpm | VM: 1.67 mm/s VG: 1.67 mm/s RPM: 2000 rpm | VM: 3.00 mm/s VG: 3.00 mm/s RPM: 2250 rpm | VM/VG >2 mm/s; 1x and 2x (33.33/66.67 Hz) elevated; axial measurement improves certainty. | D2 - Detectable at family level | Use persistence, correlation and operating-state context. |
| MS-004 | Mechanical looseness | VM, RPM | VM: 0.20 mm/s RPM: 1800 rpm | VM: 1.67 mm/s RPM: 2000 rpm | VM: 3.00 mm/s RPM: 2250 rpm | VM>=2.5 with 1x/2x/3x (~33.33/66.67/100 Hz) harmonics and impacts. | D2 - Detectable at family level | Use persistence, correlation and operating-state context. |
| MS-005 | Motor rubbing/contact | VM, TMOT, I | VM: 0.20 mm/s TMOT: 30 C I: 3 A | VM: 1.67 mm/s TMOT: 40 C I: 10 A | VM: 3.00 mm/s TMOT: 90 C I: 20 A | VM>2-2.5, TMOT>70-80 C, I>12.5-15 A; broadband/harmonic energy. | D2 - Detectable at family level | Use persistence, correlation and operating-state context. |
| MS-006 | Motor mechanical friction increase | TMOT, I, VM | TMOT: 30 C I: 3 A VM: 0.20 mm/s | TMOT: 40 C I: 10 A VM: 1.67 mm/s | TMOT: 90 C I: 20 A VM: 3.00 mm/s | I>12.5-15 A + TMOT>70-80 C + VM increasing. | D2 - Detectable at family level | Use persistence, correlation and operating-state context. |
| MS-007 | Motor cooling degradation | TMOT, I, VM | TMOT: 30 C I: 3 A VM: 0.20 mm/s | TMOT: 40 C I: 10 A VM: 1.67 mm/s | TMOT: 90 C I: 20 A VM: 3.00 mm/s | TMOT>=80 C while I approx 8-12 A and VM<=2 mm/s; poor cooling slope. | D2 - Detectable at family level | Use persistence, correlation and operating-state context. |
| MS-008 | Cooling fan degraded | TMOT, I | TMOT: 30 C I: 3 A | TMOT: 40 C I: 10 A | TMOT: 90 C I: 20 A | TMOT trend >1 C/min or persistent >70-80 C with near-normal load. | D2 - Detectable at family level | Use persistence, correlation and operating-state context. |
| MS-009 | Motor soft-foot | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Elevated 1x/2x vibration; phase/structural test required. | D2 - Detectable at family level | Use persistence, correlation and operating-state context. |
| MS-010 | Mechanical resonance | VM, RPM | VM: 0.20 mm/s RPM: 1800 rpm | VM: 1.67 mm/s RPM: 2000 rpm | VM: 3.00 mm/s RPM: 2250 rpm | Sharp VM increase only in a narrow RPM band; speed sweep required. | D2 - Detectable at family level | Use persistence, correlation and operating-state context. |
| MS-011 | Shaft misalignment | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Correlated motor/gearbox vibration, often 1x/2x; phase evidence helpful. | D2 - Detectable at family level | Use persistence, correlation and operating-state context. |
| MS-012 | Coupling wear | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Progressive VM/VG increase over  weeks/months; spectrum changes. | D2 - Detectable at  family level | Use persistence, correlation and operating-state  context. |
| MS-013 | Motor mounting looseness | VM | VM: 0.20 mm/s | VM: 1.67 mm/s | VM: 3.00 mm/s | Harmonic-rich structural vibration; bolts/base inspection. | D2 - Detectable at family level | Use persistence, correlation and operating-state context. |
| MS-014 | Rotor eccentricity | VM, I | VM: 0.20 mm/s I: 3 A | VM: 1.67 mm/s I: 10 A | VM: 3.00 mm/s I: 20 A | Order/current modulation; needs motor-current spectrum or air-gap evidence. | D2 - Detectable at family level | Use persistence, correlation and operating-state context. |
| MS-015 | Motor electrical abnormality - broad | I, RPM, TMOT | I: 3 A RPM: 1800 rpm TMOT: 30 C | I: 10 A RPM: 2000 rpm TMOT: 40 C | I: 20 A RPM: 2250 rpm TMOT: 90 C | I unstable/high with RPM and/or TMOT abnormal; do not claim specific phase/winding fault. | D2 - Detectable at family level | Use persistence, correlation and operating-state context. |

## 2.3  RARE
| 14 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| MR-001 | Motor stall | RPM, I | RPM: 1800 rpm I: 3 A | RPM: 2000 rpm I: 10 A | RPM: 2250 rpm I: 20 A | RPM<=200 rpm while commanded running; I typically >=15-20 A. | D2 - Extra electrical/inspection evidence often required | Use persistence, correlation and operating-state context. |
| MR-002 | Complete motor stop | RPM | RPM: 1800 rpm | RPM: 2000 rpm | RPM: 2250 rpm | RPM approx 0 with run command active; distinguish sensor dropout. | D2 - Extra electrical/inspection evidence often required | Use persistence, correlation and operating-state context. |
| MR-003 | Catastrophic motor bearing failure | VM, TMOT, I | VM: 0.20 mm/s TMOT: 30 C I: 3 A | VM: 1.67 mm/s TMOT: 40 C I: 10 A | VM: 3.00 mm/s TMOT: 90 C I: 20 A | VM>>3 mm/s, impacts, TMOT>=90 C, current rise. | D2 - Extra electrical/inspection evidence often required | Use persistence, correlation and operating-state context. |
| MR-004 | Motor shaft crack | VM, RPM | VM: 0.20 mm/s RPM: 1800 rpm | VM: 1.67 mm/s RPM: 2000 rpm | VM: 3.00 mm/s RPM: 2250 rpm | Progressive 1x/2x/order changes; confirmation requires advanced vibration/inspection. | D2 - Extra electrical/inspection evidence often required | Use persistence, correlation and operating-state context. |
| MR-005 | Motor shaft fracture | RPM, P, I | RPM: 1800 rpm P: 1.0 MPa I: 3 A | RPM: 2000 rpm P: 4.0 MPa I: 10 A | RPM: 2250 rpm P: 6.0 MPa I: 20 A | Abrupt loss of transmitted output; process P/I collapse. | D2 - Extra electrical/inspection evidence often required | Use persistence, correlation and operating-state context. |
| MR-006 | Broken rotor bar | I, RPM | I: 3 A RPM: 1800 rpm | I: 10 A RPM: 2000 rpm | I: 20 A RPM: 2250 rpm | Requires motor-current signature analysis; aggregate I alone insufficient. | D2 - Extra electrical/inspection evidence often required | Use persistence, correlation and operating-state context. |
| MR-007 | Stator winding fault | PHASE, TMOT | PHASE: N/A TMOT: 30 C | PHASE: balanced 3-phase TMOT: 40 C | PHASE: OEM/site limits TMOT: 90 C | Phase currents/voltages + winding temperature required. | D2 - Extra electrical/inspection evidence often required | Use persistence, correlation and operating-state context. |
| MR-008 | Turn-to-turn short | PHASE, TMOT | PHASE: N/A TMOT: 30 C | PHASE: balanced 3- phase TMOT: 40 C | PHASE: OEM/site limits TMOT: 90 C | Phase imbalance/current distortion + thermal rise; extra measurements required. | D2 - Extra electrical/inspection  evidence often required | Use persistence, correlation and operating-state context. |
| MR-009 | Insulation breakdown | PHASE | PHASE: N/A | PHASE: balanced 3-phase | PHASE: OEM/site limits | Insulation resistance/earth leakage measurement required. | D2 - Extra electrical/inspection evidence often required | Use persistence, correlation and operating-state context. |
| MR-010 | Phase loss | PHASE, RPM, I | PHASE: N/A RPM: 1800 rpm I: 3 A | PHASE: balanced 3-phase RPM: 2000 rpm I: 10 A | PHASE: OEM/site limits RPM: 2250 rpm I: 20 A | Individual phase sensing required; aggregate current may show secondary effect. | D2 - Extra electrical/inspection evidence often required | Use persistence, correlation and operating-state context. |
| MR-011 | Phase imbalance | PHASE | PHASE: N/A | PHASE: balanced 3-phase | PHASE: OEM/site limits | Use site/OEM current/voltage imbalance limits; not identifiable from one I value. | D2 - Extra electrical/inspection evidence often required | Use persistence, correlation and operating-state context. |
| MR-012 | Bearing seizure | RPM, I, VM, TMOT | RPM: 1800 rpm I: 3 A VM: 0.20 mm/s TMOT: 30 C | RPM: 2000 rpm I: 10 A VM: 1.67 mm/s TMOT: 40 C | RPM: 2250 rpm I: 20 A VM: 3.00 mm/s TMOT: 90 C | RPM falling sharply, I>=20 A, VM>=3, TMOT>=90 C. | D2 - Extra electrical/inspection evidence often required | Use persistence, correlation and operating-state context. |
| MR-013 | Catastrophic rotor rub | VM, I, TMOT | VM: 0.20 mm/s I: 3 A TMOT: 30 C | VM: 1.67 mm/s I: 10 A TMOT: 40 C | VM: 3.00 mm/s I: 20 A TMOT: 90 C | VM/I/TMOT all severe; immediate shutdown per protection philosophy. | D2 - Extra electrical/inspection evidence often required | Use persistence, correlation and operating-state context. |
| MR-014 | Motor cooling fan failure | TMOT, I | TMOT: 30 C I: 3 A | TMOT: 40 C I: 10 A | TMOT: 90 C I: 20 A | Rapid TMOT rise, eventually >=90 C; fan status/current recommended. | D2 - Extra electrical/inspection evidence often required | Use persistence, correlation and operating-state context. |

## 3. Gearbox
Reduction train and bearings. Primary signals: VG, TGB, I, RPM; exact gear defects require tooth counts and order analysis.
Catalogue entries in this section: 29   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 3.1  FREQUENT
| 4 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| GF-001 | Gearbox vibration elevated | VG | VG: 0.20 mm/s | VG: 1.67 mm/s | VG: 3.00 mm/s | VG>2.0 developing; >=2.5 warning; >=3.0 severe. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| GF-002 | Gearbox temperature elevated | TGB | TGB: 30 C | TGB: 40 C | TGB: 90 C | TGB>70 developing; >=80 C warning; >=90 C severe. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| GF-003 | Gearbox load  increase | I, TGB | I: 3 A TGB: 30 C | I: 10 A TGB: 40 C | I: 20 A TGB: 90 C | I>12.5-15 A with TGB rising above ~60-80 C. | D1 - Detectable  now | Use persistence, correlation and operating-state  context. |
| GF-004 | Progressive mechanical degradation | VG | VG: 0.20 mm/s | VG: 1.67 mm/s | VG: 3.00 mm/s | Long-term VG baseline increase or short-term slope >=0.20 mm/s/min. | D1 - Detectable now | Use persistence, correlation and operating-state context. |

## 3.2  SOMETIMES
| 15 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| GS-001 | Gearbox bearing degradation | VG, TGB | VG: 0.20 mm/s TGB: 30 C | VG: 1.67 mm/s TGB: 40 C | VG: 3.00 mm/s TGB: 90 C | VG 2.0-2.5 developing; >=2.5 warning; >=3 severe. TGB often 55-80 C; envelope/impulsive features. | D2 - Family-level unless advanced evidence available | Use persistence, correlation and operating-state context. |
| GS-002 | Gear mesh degradation | VG, RPM | VG: 0.20 mm/s RPM: 1800 rpm | VG: 1.67 mm/s RPM: 2000 rpm | VG: 3.00 mm/s RPM: 2250 rpm | VG>2 mm/s and gear-mesh-frequency/sideband growth. Exact GMF requires gear tooth counts. | D2 - Family-level unless advanced evidence available | Use persistence, correlation and operating-state context. |
| GS-003 | Distributed gear tooth wear | VG | VG: 0.20 mm/s | VG: 1.67 mm/s | VG: 3.00 mm/s | Progressive GMF and sideband growth over time; VG may remain <2.5 early. | D2 - Family-level unless advanced evidence available | Use persistence, correlation and operating-state context. |
| GS-004 | Gearbox misalignment | VG, VM | VG: 0.20 mm/s VM: 0.20 mm/s | VG: 1.67 mm/s VM: 1.67 mm/s | VG: 3.00 mm/s VM: 3.00 mm/s | VG/VM >2 with 1x/2x correlation. | D2 - Family-level unless advanced evidence available | Use persistence, correlation and operating-state context. |
| GS-005 | Gearbox looseness | VG | VG: 0.20 mm/s | VG: 1.67 mm/s | VG: 3.00 mm/s | VG>=2.5 plus harmonic/impact structure. | D2 - Family-level unless advanced evidence available | Use persistence, correlation and operating-state context. |
| GS-006 | Poor lubrication | TGB, VG | TGB: 30 C VG: 0.20 mm/s | TGB: 40 C VG: 1.67 mm/s | TGB: 90 C VG: 3.00 mm/s | Early TGB 55-70 C, VG 1.8-2.3; warning TGB>=80, VG>=2.5. | D2 - Family-level unless advanced evidence available | Use persistence, correlation and operating-state context. |
| GS-007 | Low oil level | TGB, VG, OIL | TGB: 30 C VG: 0.20 mm/s OIL: N/A | TGB: 40 C VG: 1.67 mm/s OIL: OEM oil condition | TGB: 90 C VG: 3.00 mm/s OIL: OEM/site limits | TGB/VG rise; oil-level sensing required for unique diagnosis. | D2 - Family-level unless advanced evidence available | Use persistence, correlation and operating-state context. |
| GS-008 | Oil degradation | TGB, VG, OIL | TGB: 30 C VG: 0.20 mm/s OIL: N/A | TGB: 40 C VG: 1.67 mm/s OIL: OEM oil condition | TGB: 90 C VG: 3.00 mm/s OIL: OEM/site limits | Progressive TGB and VG increase; oil condition sensor/sample required. | D2 - Family-level unless advanced evidence available | Use persistence, correlation and operating-state context. |
| GS-009 | Oil contamination | TGB, VG, OIL | TGB: 30 C VG: 0.20 mm/s OIL: N/A | TGB: 40 C VG: 1.67 mm/s OIL: OEM oil condition | TGB: 90 C VG: 3.00 mm/s OIL: OEM/site limits | Mechanical temperature/vibration growth; unique ID needs oil analysis. | D2 - Family-level unless advanced evidence available | Use persistence, correlation and operating-state context. |
| GS-010 | Gearbox cooling degradation | TGB, I, VG | TGB: 30 C I: 3 A VG: 0.20 mm/s | TGB: 40 C I: 10 A VG: 1.67 mm/s | TGB: 90 C I: 20 A VG: 3.00 mm/s | TGB>=80 C with I near 8-12 A and VG<=2 when cooling is primary cause. | D2 - Family-level unless advanced evidence available | Use persistence, correlation and operating-state context. |
| GS-011 | Excessive bearing  clearance | VG | VG: 0.20 mm/s | VG: 1.67 mm/s | VG: 3.00 mm/s | Impacts/order changes; VG often >2-2.5. | D2 - Family-level  unless advanced evidence available | Use persistence, correlation and operating-state  context. |
| GS-012 | Bearing preload abnormality | TGB, VG | TGB: 30 C VG: 0.20 mm/s | TGB: 40 C VG: 1.67 mm/s | TGB: 90 C VG: 3.00 mm/s | TGB and VG trend upward together. | D2 - Family-level unless advanced evidence available | Use persistence, correlation and operating-state context. |
| GS-013 | Gearbox foundation looseness | VG | VG: 0.20 mm/s | VG: 1.67 mm/s | VG: 3.00 mm/s | Structural harmonic-rich vibration; base inspection. | D2 - Family-level unless advanced evidence available | Use persistence, correlation and operating-state context. |
| GS-014 | Input-shaft misalignment | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Both sensors elevated; 1x/2x evidence. | D2 - Family-level unless advanced evidence available | Use persistence, correlation and operating-state context. |
| GS-015 | Output-shaft misalignment | VG, S1X | VG: 0.20 mm/s S1X: N/A | VG: 1.67 mm/s S1X: 1.667 Hz @ 100 rpm | VG: 3.00 mm/s S1X: speed-dependent | VG dominant; screw-side vibration sensor improves localization. | D2 - Family-level unless advanced evidence available | Use persistence, correlation and operating-state context. |

## 3.3  RARE
| 10 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| GR-001 | Gear tooth fracture | VG | VG: 0.20 mm/s | VG: 1.67 mm/s | VG: 3.00 mm/s | Sudden VG >3 mm/s, impacts and GMF/sideband change. | D2 - Inspection/additional sensor usually required | Use persistence, correlation and operating-state context. |
| GR-002 | Broken gear | VG, RPM, I | VG: 0.20 mm/s RPM: 1800 rpm I: 3 A | VG: 1.67 mm/s RPM: 2000 rpm I: 10 A | VG: 3.00 mm/s RPM: 2250 rpm I: 20 A | Major vibration/load/speed disturbance; likely severe. | D2 - Inspection/additional sensor usually required | Use persistence, correlation and operating-state context. |
| GR-003 | Input shaft fracture | RPM, P, I | RPM: 1800 rpm P: 1.0 MPa I: 3 A | RPM: 2000 rpm P: 4.0 MPa I: 10 A | RPM: 2250 rpm P: 6.0 MPa I: 20 A | Motor may run but transmitted process load/output collapses. | D2 - Inspection/additional sensor usually required | Use persistence, correlation and operating-state context. |
| GR-004 | Output shaft fracture | RPM, P, I | RPM: 1800 rpm P: 1.0 MPa I: 3 A | RPM: 2000 rpm P: 4.0 MPa I: 10 A | RPM: 2250 rpm P: 6.0 MPa I: 20 A | Motor RPM may remain normal; P falls toward 1-2 MPa and process load drops. | D2 - Inspection/additional sensor usually required | Use persistence, correlation and operating-state context. |
| GR-005 | Gearbox bearing seizure | VG, TGB, I, RPM | VG: 0.20 mm/s TGB: 30 C I: 3 A RPM: 1800 rpm | VG: 1.67 mm/s TGB: 40 C I: 10 A RPM: 2000 rpm | VG: 3.00 mm/s TGB: 90 C I: 20 A RPM: 2250 rpm | VG>=3, TGB>=90, I>=15-20, RPM falling. | D2 - Inspection/additional sensor usually required | Use persistence, correlation and operating-state context. |
| GR-006 | Gearbox oil pump failure | TGB, OIL | TGB: 30 C OIL: N/A | TGB: 40 C OIL: OEM oil condition | TGB: 90 C OIL: OEM/site limits | Oil pressure/flow sensor required; TGB eventually rises. | D2 - Inspection/additional sensor usually required | Use persistence, correlation and operating-state context. |
| GR-007 | Major oil leak | TGB, VG, OIL | TGB: 30 C VG: 0.20 mm/s OIL: N/A | TGB: 40 C VG: 1.67 mm/s OIL: OEM oil condition | TGB: 90 C VG: 3.00 mm/s OIL: OEM/site limits | TGB/VG secondary effects; oil level/leak detection required. | D2 - Inspection/additional sensor usually required | Use persistence, correlation and operating-state context. |
| GR-008 | Gearbox housing crack | VG | VG: 0.20 mm/s | VG: 1.67 mm/s | VG: 3.00 mm/s | Structural vibration/inspection; no unique scalar threshold. | D2 - Inspection/additional sensor usually required | Use persistence, correlation and operating-state context. |
| GR-009 | Catastrophic pitting/spalling | VG | VG: 0.20 mm/s | VG: 1.67 mm/s | VG: 3.00 mm/s | Strong impulsive/envelope and GMF features; VG may exceed 3. | D2 - Inspection/additional sensor usually required | Use persistence, correlation and operating-state context. |
| GR-010 | Backstop/internal locking failure | VG, RPM | VG: 0.20 mm/s RPM: 1800 rpm | VG: 1.67 mm/s RPM: 2000 rpm | VG: 3.00 mm/s RPM: 2250 rpm | Drive/mechanical evidence required; no unique current sensor signature. | D2 - Inspection/additional sensor usually required | Use persistence, correlation and operating-state context. |

## 4. Coupling & Drive Transmission
Mechanical connection between motor, gearbox and screw. Uses VM/VG correlation, orders, RPM and process load response.
Catalogue entries in this section: 13   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 4.1  FREQUENT
| 3 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| CF-001 | Coupling vibration increase | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | VM/VG >2 mm/s; warning around >=2.5. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| CF-002 | Small coupling misalignment | VM, VG, RPM | VM: 0.20 mm/s VG: 0.20 mm/s RPM: 1800 rpm | VM: 1.67 mm/s VG: 1.67 mm/s RPM: 2000 rpm | VM: 3.00 mm/s VG: 3.00 mm/s RPM: 2250 rpm | 1x/2x rise; VM/VG commonly 2-2.7 mm/s. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| CF-003 | Coupling/fastener looseness | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Harmonic-rich vibration, often >=2.5 mm/s. | D1 - Detectable now | Use persistence, correlation and operating-state context. |

## 4.2  SOMETIMES
| 6 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| CS-001 | Flexible-element wear | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Progressive vibration rise toward 2.5 mm/s. | D2 - Family-level | Use persistence, correlation and operating-state context. |
| CS-002 | Angular misalignment | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | 1x/2x plus axial vibration; axial sensor recommended. | D2 - Family-level | Use persistence, correlation and operating-state context. |
| CS-003 | Parallel misalignment | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Both sensors elevated, 1x/2x. | D2 - Family-level | Use persistence, correlation and operating-state context. |
| CS-004 | Coupling eccentricity | VM, VG, 1X | VM: 0.20 mm/s VG: 0.20 mm/s 1X: N/A | VM: 1.67 mm/s VG: 1.67 mm/s 1X: 33.33 Hz @ 2000 rpm | VM: 3.00 mm/s VG: 3.00 mm/s 1X: speed-dependent | Strong 1x component at 33.33 Hz for 2000 rpm. | D2 - Family-level | Use persistence, correlation and operating-state context. |
| CS-005 | Coupling overheating/friction | I, VM | I: 3 A VM: 0.20 mm/s | I: 10 A VM: 1.67 mm/s | I: 20 A VM: 3.00 mm/s | I>12.5 A + vibration rise; coupling temperature sensor helpful. | D2 - Family-level | Use persistence, correlation and operating-state context. |
| CS-006 | Key/keyway looseness | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Impacts/backlash-like vibration; inspection required. | D2 - Family-level | Use persistence, correlation and operating-state context. |

## 4.3  RARE
| 4 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| CR-001 | Coupling element rupture | RPM, P, I | RPM: 1800 rpm P: 1.0 MPa I: 3 A | RPM: 2000 rpm P: 4.0 MPa I: 10 A | RPM: 2250 rpm P: 6.0 MPa I: 20 A | Abrupt process-drive disconnect; motor RPM may remain but P/I collapse. | D2 - Mechanical inspection required | Use persistence, correlation and operating-state context. |
| CR-002 | Coupling hub fracture | RPM, P, I | RPM: 1800 rpm P: 1.0 MPa I: 3 A | RPM: 2000 rpm P: 4.0 MPa I: 10 A | RPM: 2250 rpm P: 6.0 MPa I: 20 A | Torque transmission lost; process pressure falls. | D2 - Mechanical inspection required | Use persistence, correlation and operating-state context. |
| CR-003 | Key/keyway failure | RPM, P, I | RPM: 1800 rpm P: 1.0 MPa I: 3 A | RPM: 2000 rpm P: 4.0 MPa I: 10 A | RPM: 2250 rpm P: 6.0 MPa I: 20 A | Intermittent or total torque loss; inspection. | D2 - Mechanical inspection required | Use persistence, correlation and operating-state context. |
| CR-004 | Sheared key | RPM, P, I | RPM: 1800 rpm P: 1.0 MPa I: 3 A | RPM: 2000 rpm P: 4.0 MPa I: 10 A | RPM: 2250 rpm P: 6.0 MPa I: 20 A | Motor runs near 2000 rpm but process P approaches 1-2 MPa and I falls. | D2 - Mechanical inspection required | Use persistence, correlation and operating-state context. |

## 5. Screw
Primary conveying/melting element. Current system observes derived SRPM, P, I and temperature; direct screw torque/axial vibration would improve diagnosis.
Catalogue entries in this section: 25   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 5.1  FREQUENT
| 4 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| SF-001 | High screw load | SRPM, P, I | SRPM: 90 rpm P: 1.0 MPa I: 3 A | SRPM: 100 rpm P: 4.0 MPa I: 10 A | SRPM: 112.5 rpm P: 6.0 MPa I: 20 A | SRPM~100, P>=5.4 MPa, I>=15 A; severe P~6, I~20. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| SF-002 | Screw speed deviation | SRPM, RPM | SRPM: 90 rpm RPM: 1800 rpm | SRPM: 100 rpm RPM: 2000 rpm | SRPM: 112.5 rpm RPM: 2250 rpm | SRPM <97.5 or >102.5 developing; <=95/>=105 warning; <=90/>=112.5 severe. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| SF-003 | Screw output instability | P, I, SRPM | P: 1.0 MPa I: 3 A SRPM: 90 rpm | P: 4.0 MPa I: 10 A SRPM: 100 rpm | P: 6.0 MPa I: 20 A SRPM: 112.5 rpm | P sigma>=0.40 MPa and/or I sigma>=1.5 A with stable SRPM. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| SF-004 | Melt conveying inefficiency | P, I, SRPM, L | P: 1.0 MPa I: 3 A SRPM: 90 rpm L: 5% | P: 4.0 MPa I: 10 A SRPM: 100 rpm L: 75% | P: 6.0 MPa I: 20 A SRPM: 112.5 rpm L: 95% | P<3.2 MPa and I<7.5 A at SRPM~100 with L>40%. | D1 - Detectable now | Use persistence, correlation and operating-state context. |

## 5.2  SOMETIMES
| 13 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| SS-001 | Screw flight wear | P, I, SRPM | P: 1.0 MPa I: 3 A SRPM: 90 rpm | P: 4.0 MPa I: 10 A SRPM: 100 rpm | P: 6.0 MPa I: 20 A SRPM: 112.5 rpm | At same SRPM/feed: P 4.0->3.6->3.2-><3.0 MPa; I 10->9->8->~7 A. | D2 - Often ambiguous with material/feed condition | Use persistence, correlation and operating-state context. |
| SS-002 | Screw diameter/surface wear | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Progressive pressure/output loss; P often <=3.2 with I <=7.5-9. | D2 - Often ambiguous with material/feed condition | Use persistence, correlation and operating-state context. |
| SS-003 | Excess screw-barrel clearance | P, I, L | P: 1.0 MPa I: 3 A L: 5% | P: 4.0 MPa I: 10 A L: 75% | P: 6.0 MPa I: 20 A L: 95% | P<=3.2 and I below baseline despite adequate L; distinguish low viscosity. | D2 - Often ambiguous with material/feed condition | Use persistence, correlation and operating-state context. |
| SS-004 | Abrasive screw wear | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Long-term pressure/output deterioration; inspection confirms. | D2 - Often ambiguous with material/feed condition | Use persistence, correlation and operating-state context. |
| SS-005 | Adhesive/galling wear | I, VM, VG | I: 3 A VM: 0.20 mm/s VG: 0.20 mm/s | I: 10 A VM: 1.67 mm/s VG: 1.67 mm/s | I: 20 A VM: 3.00 mm/s VG: 3.00 mm/s | I and vibration may rise before performance decreases. | D2 - Often ambiguous with material/feed condition | Use persistence, correlation and operating-state context. |
| SS-006 | Screw misalignment | VM, VG, I | VM: 0.20 mm/s VG: 0.20 mm/s I: 3 A | VM: 1.67 mm/s VG: 1.67 mm/s I: 10 A | VM: 3.00 mm/s VG: 3.00 mm/s I: 20 A | Mechanical vibration/order + load fluctuation; screw-side sensor preferred. | D2 - Often ambiguous with material/feed condition | Use persistence, correlation and operating-state context. |
| SS-007 | Screw eccentricity | P, I, S1X | P: 1.0 MPa I: 3 A S1X: N/A | P: 4.0 MPa I: 10 A S1X: 1.667 Hz @ 100 rpm | P: 6.0 MPa I: 20 A S1X: speed-dependent | Periodic P/I modulation around screw 1x = 1.667  Hz at 100 rpm. | D2 - Often  ambiguous with material/feed condition | Use persistence, correlation and operating-state  context. |
| SS-008 | Screw-to-barrel rubbing | I, VM, VG, Z1, Z2, Z3 | I: 3 A VM: 0.20 mm/s VG: 0.20 mm/s Z1: 150 C Z2: 170 C Z3: 190 C | I: 10 A VM: 1.67 mm/s VG: 1.67 mm/s Z1: 180 C Z2: 210 C Z3: 220 C | I: 20 A VM: 3.00 mm/s VG: 3.00 mm/s Z1: 210 C Z2: 230 C Z3: 250 C | I>=15 A + vibration>2-2.5; local zone >~12 C above expected. | D2 - Often ambiguous with material/feed condition | Use persistence, correlation and operating-state context. |
| SS-009 | Material build-up on screw | P, I, MT | P: 1.0 MPa I: 3 A MT: 180 C | P: 4.0 MPa I: 10 A MT: 210 C | P: 6.0 MPa I: 20 A MT: 240 C | P/I relationship shifts; periodic instability; inspection/purge history helpful. | D2 - Often ambiguous with material/feed condition | Use persistence, correlation and operating-state context. |
| SS-010 | Degraded mixing performance | MT, P | MT: 180 C P: 1.0 MPa | MT: 210 C P: 4.0 MPa | MT: 240 C P: 6.0 MPa | MT/P variability; product quality evidence needed. | D2 - Often ambiguous with material/feed condition | Use persistence, correlation and operating-state context. |
| SS-011 | Metering-section wear | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Reduced pressure generation, often P<=3.2 at stable SRPM. | D2 - Often ambiguous with material/feed condition | Use persistence, correlation and operating-state context. |
| SS-012 | Compression-section wear | MT, P, I | MT: 180 C P: 1.0 MPa I: 3 A | MT: 210 C P: 4.0 MPa I: 10 A | MT: 240 C P: 6.0 MPa I: 20 A | Melting/pressure performance shifts; MT/P instability. | D2 - Often ambiguous with material/feed condition | Use persistence, correlation and operating-state context. |
| SS-013 | Feed-section wear | P, I, L | P: 1.0 MPa I: 3 A L: 5% | P: 4.0 MPa I: 10 A L: 75% | P: 6.0 MPa I: 20 A L: 95% | Solids-conveying instability with adequate hopper level. | D2 - Often ambiguous with material/feed condition | Use persistence, correlation and operating-state context. |

## 5.3  RARE
| 8 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| SR-001 | Screw fracture | P, I, RPM | P: 1.0 MPa I: 3 A RPM: 1800 rpm | P: 4.0 MPa I: 10 A RPM: 2000 rpm | P: 6.0 MPa I: 20 A RPM: 2250 rpm | Abrupt P 4-><=1-2 MPa with load transition; motor may continue near 2000 rpm. | D2 - Inspection / additional measurement required | Use persistence, correlation and operating-state context. |
| SR-002 | Screw flight fracture | P, I, VM | P: 1.0 MPa I: 3 A VM: 0.20 mm/s | P: 4.0 MPa I: 10 A VM: 1.67 mm/s | P: 6.0 MPa I: 20 A VM: 3.00 mm/s | Sudden P/I/output disturbance; inspection required. | D2 - Inspection / additional measurement required | Use persistence, correlation and operating-state context. |
| SR-003 | Bent screw | P, I, S1X | P: 1.0 MPa I: 3 A S1X: N/A | P: 4.0 MPa I: 10 A S1X: 1.667 Hz  @ 100 rpm | P: 6.0 MPa I: 20 A S1X: speed- dependent | Periodic 1.667 Hz modulation; screw-side vibration/inspection required. | D2 - Inspection / additional measurement  required | Use persistence, correlation and operating-state context. |
| SR-004 | Screw seizure | RPM, I, P | RPM: 1800 rpm I: 3 A P: 1.0 MPa | RPM: 2000 rpm I: 10 A P: 4.0 MPa | RPM: 2250 rpm I: 20 A P: 6.0 MPa | RPM<=1800 and falling, I>=20 A; P may approach >=6 MPa. | D2 - Inspection / additional measurement required | Use persistence, correlation and operating-state context. |
| SR-005 | Severe metal-to-metal contact | I, VM, VG, Z1, Z2, Z3 | I: 3 A VM: 0.20 mm/s VG: 0.20 mm/s Z1: 150 C Z2: 170 C Z3: 190 C | I: 10 A VM: 1.67 mm/s VG: 1.67 mm/s Z1: 180 C Z2: 210 C Z3: 220 C | I: 20 A VM: 3.00 mm/s VG: 3.00 mm/s Z1: 210 C Z2: 230 C Z3: 250 C | I>=20, vibration>=3, localized thermal rise. | D2 - Inspection / additional measurement required | Use persistence, correlation and operating-state context. |
| SR-006 | Screw root crack | VM, TORQUE | VM: 0.20 mm/s TORQUE: N/A | VM: 1.67 mm/s TORQUE: recipe-dependent | VM: 3.00 mm/s TORQUE: drive/OEM limit | Advanced vibration/torque/inspection required. | D2 - Inspection / additional measurement required | Use persistence, correlation and operating-state context. |
| SR-007 | Screw tip failure | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Abrupt pressure/output change; inspection required. | D2 - Inspection / additional measurement required | Use persistence, correlation and operating-state context. |
| SR-008 | Thrust-end mechanical failure | TORQUE, VG | TORQUE: N/A VG: 0.20 mm/s | TORQUE: recipe-dependent VG: 1.67 mm/s | TORQUE: drive/OEM limit VG: 3.00 mm/s | Axial/thrust monitoring required; current sensors only show secondary load/vibration. | D2 - Inspection / additional measurement required | Use persistence, correlation and operating-state context. |

## 6. Barrel - Mechanical
Barrel bore, liner, support and mechanical integrity. P/I efficiency trends are indirect; inspection is important.
Catalogue entries in this section: 15   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 6.1  FREQUENT
| 2 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| BF-001 | Process build-up on barrel surface | P, I, Z1, Z2, Z3 | P: 1.0 MPa I: 3 A Z1: 150 C Z2: 170 C Z3: 190 C | P: 4.0 MPa I: 10 A Z1: 180 C Z2: 210 C Z3: 220 C | P: 6.0 MPa I: 20 A Z1: 210 C Z2: 230 C Z3: 250 C | Slow P/I/T relationship shift; may precede instability. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| BF-002 | Local thermal distortion | Z1, Z2, Z3, P | Z1: 150 C Z2: 170 C Z3: 190 C P: 1.0 MPa | Z1: 180 C Z2: 210 C Z3: 220 C P: 4.0 MPa | Z1: 210 C Z2: 230 C Z3: 250 C P: 6.0 MPa | Profile deviates from 180/210/220 C and process load changes. | D1 - Detectable now | Use persistence, correlation and operating-state context. |

## 6.2  SOMETIMES
| 8 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| BS-001 | Barrel bore wear | P, I, SRPM | P: 1.0 MPa I: 3 A SRPM: 90 rpm | P: 4.0 MPa I: 10 A SRPM: 100 rpm | P: 6.0 MPa I: 20 A SRPM: 112.5 rpm | P often <=3.2 MPa at same recipe/SRPM; output efficiency decreases. | D2 - Inspection usually required | Use persistence, correlation and operating-state context. |
| BS-002 | Excess screw-barrel clearance | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | P/output decrease; ambiguous with screw wear and low viscosity. | D2 - Inspection usually required | Use persistence, correlation and operating-state context. |
| BS-003 | Abrasive barrel wear | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Progressive pressure-generation loss. | D2 - Inspection usually required | Use persistence, correlation and operating-state context. |
| BS-004 | Barrel liner wear | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Same broad efficiency loss; inspection localizes. | D2 - Inspection usually required | Use persistence, correlation and operating-state context. |
| BS-005 | Barrel alignment error | VM, VG, I | VM: 0.20 mm/s VG: 0.20 mm/s I: 3 A | VM: 1.67 mm/s VG: 1.67 mm/s I: 10 A | VM: 3.00 mm/s VG: 3.00 mm/s I: 20 A | Vibration/load rise; alignment survey required. | D2 - Inspection usually required | Use persistence, correlation and operating-state context. |
| BS-006 | Barrel support misalignment | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Structural/screw vibration increase. | D2 - Inspection usually required | Use persistence, correlation and operating-state context. |
| BS-007 | Barrel internal scoring | I, P, VM | I: 3 A P: 1.0 MPa VM: 0.20 mm/s | I: 10 A P: 4.0 MPa VM: 1.67 mm/s | I: 20 A P: 6.0 MPa VM: 3.00 mm/s | Load/vibration/process instability; inspection. | D2 - Inspection usually required | Use persistence, correlation and operating-state context. |
| BS-008 | Localized barrel deformation | I, P, S1X | I: 3 A P: 1.0 MPa S1X: N/A | I: 10 A P: 4.0 MPa S1X: 1.667 Hz @ 100 rpm | I: 20 A P: 6.0 MPa S1X: speed-dependent | Periodic rubbing/load at screw frequency. | D2 - Inspection usually required | Use persistence, correlation and operating-state context. |

## 6.3  RARE
| 5 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| BR-001 | Barrel crack | P, MT | P: 1.0 MPa MT: 180 C | P: 4.0 MPa MT: 210 C | P: 6.0 MPa MT: 240 C | Pressure/melt leak or abnormal thermal behavior; inspection required. | D3 - Inspection / leak monitoring required | Use persistence, correlation and operating-state context. |
| BR-002 | Barrel structural failure | P, MT | P: 1.0 MPa MT: 180 C | P: 4.0 MPa MT: 210 C | P: 6.0 MPa MT: 240 C | Major process upset; emergency condition. | D3 - Inspection / leak monitoring required | Use persistence, correlation and operating-state context. |
| BR-003 | Barrel liner separation | VM, P | VM: 0.20 mm/s P: 1.0 MPa | VM: 1.67 mm/s P: 4.0 MPa | VM: 3.00 mm/s P: 6.0 MPa | Abnormal vibration/process response; inspection. | D3 - Inspection / leak monitoring required | Use persistence, correlation and operating-state context. |
| BR-004 | Severe bore damage | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Large pressure/output efficiency loss. | D3 - Inspection / leak monitoring required | Use persistence, correlation and operating-state context. |
| BR-005 | Barrel flange failure | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Abrupt pressure loss/melt leak; inspection. | D3 - Inspection / leak monitoring  required | Use persistence, correlation and operating-state context. |

## 7. Barrel Heating & Thermal Profile
Three controlled barrel zones plus melt temperature. The healthy profile is Z1/Z2/Z3 = 180/210/220 C; each zone must use its own limits.
Catalogue entries in this section: 31   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 7.1  FREQUENT
| 15 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| TF-001 | Zone 1 under-temperature | Z1 | Z1: 150 C | Z1: 180 C | Z1: 210 C | Developing <170 C; warning <=160 C; severe <=150 C. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| TF-002 | Zone 1 over-temperature | Z1 | Z1: 150 C | Z1: 180 C | Z1: 210 C | Developing >190 C; warning >=200 C; severe >=210 C. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| TF-003 | Zone 2 under-temperature | Z2 | Z2: 170 C | Z2: 210 C | Z2: 230 C | Developing <195 C; warning <=180 C; severe <=170 C. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| TF-004 | Zone 2 over-temperature | Z2 | Z2: 170 C | Z2: 210 C | Z2: 230 C | Developing >215 C; warning >=220 C; severe >=230 C. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| TF-005 | Zone 3 under-temperature | Z3 | Z3: 190 C | Z3: 220 C | Z3: 250 C | Developing <210 C; warning <=200 C; severe <=190 C. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| TF-006 | Zone 3 over-temperature | Z3 | Z3: 190 C | Z3: 220 C | Z3: 250 C | Developing >230 C; warning >=240 C; severe >=250 C. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| TF-007 | Barrel temperature oscillation | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Any zone P-P >=5 C; severe sustained oscillation or sigma >=6 C. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| TF-008 | Barrel temperature instability | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Any zone sigma >=3 C; severe >=6 C. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| TF-009 | Barrel local cold spot | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Measured zone >12 C below its own nominal (e.g., Z2 <198 C). | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| TF-010 | Barrel local hot spot | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Measured zone >12 C above own nominal (e.g., Z3 >232 C). | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| TF-011 | Thermal profile distortion | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Profile no longer resembles 180->210->220 C; residual deviation >12-15 C. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| TF-012 | Abnormal adjacent-zone gradient | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Adjacent delta differs materially from expected; >15 C residual is warning-class. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| TF-013 | Slow zone heating | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Zone remains >5 C below target while heating  slope <0.5 C/min. | D1 - Detectable  now | Use persistence, correlation and operating-state  context. |
| TF-014 | Melt temperature low | MT | MT: 180 C | MT: 210 C | MT: 240 C | <=190 C warning; <=180 C severe. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| TF-015 | Melt temperature high | MT | MT: 180 C | MT: 210 C | MT: 240 C | >=230 C warning; >=240 C severe. | D1 - Detectable now | Use persistence, correlation and operating-state context. |

## 7.2  SOMETIMES
| 9 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| TS-001 | Zone heater partial failure | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Weak recovery and sustained under-target; zone-specific warning-low eventually reached. | D2 - Cross-sensor reasoning required | Use persistence, correlation and operating-state context. |
| TS-002 | Zone heater complete failure | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Continuous temperature decline toward zone alarm-low: Z1 150, Z2 170, Z3 190 C. | D2 - Cross-sensor reasoning required | Use persistence, correlation and operating-state context. |
| TS-003 | Heater stuck ON | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Zone climbs through warning-high to severe: 200/210, 220/230, 240/250 C respectively. | D2 - Cross-sensor reasoning required | Use persistence, correlation and operating-state context. |
| TS-004 | Temperature controller hunting | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Cyclic P-P >=5 C around setpoint. | D2 - Cross-sensor reasoning required | Use persistence, correlation and operating-state context. |
| TS-005 | Cooling overactive | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Persistent low zone temperature despite heating demand. | D2 - Cross-sensor reasoning required | Use persistence, correlation and operating-state context. |
| TS-006 | Zone-to-zone thermal coupling abnormality | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | One zone responds strongly to neighboring control action; spatial residual >12-15 C. | D2 - Cross-sensor reasoning required | Use persistence, correlation and operating-state context. |
| TS-007 | Poor barrel insulation | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Slow recovery and increased external/ambient sensitivity; heater-output data desirable. | D2 - Cross-sensor reasoning required | Use persistence, correlation and operating-state context. |
| TS-008 | Excessive shear heating | MT, P, I | MT: 180 C P: 1.0 MPa I: 3 A | MT: 210 C P: 4.0 MPa I: 10 A | MT: 240 C P: 6.0 MPa I: 20 A | MT>=230 C with P/I high; differentiate heater stuck ON using zone behavior. | D2 - Cross-sensor reasoning required | Use persistence, correlation and operating-state context. |
| TS-009 | Melt residence-time overheating | MT | MT: 180 C | MT: 210 C | MT: 240 C | MT high or persistent hot condition despite reduced throughput; feed/throughput history needed. | D2 - Cross-sensor reasoning required | Use persistence, correlation and operating-state context. |

## 7.3  RARE
| 7 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| TR-001 | Thermal runaway - Zone 1 | Z1 | Z1: 150 C | Z1: 180 C | Z1: 210 C | Z1>=200 C plus rise >=8 C/min; critical >=210 C. | D2 - Add controller output/electrical feedback for root cause | Use persistence, correlation and operating-state context. |
| TR-002 | Thermal runaway - Zone 2 | Z2 | Z2: 170 C | Z2: 210 C | Z2: 230 C | Z2>=220 C plus rise >=8 C/min; critical >=230 C. | D2 - Add controller output/electrical feedback for root cause | Use persistence, correlation and operating-state context. |
| TR-003 | Thermal runaway - Zone 3 | Z3 | Z3: 190 C | Z3: 220 C | Z3: 250 C | Z3>=240 C plus rise >=8 C/min; critical >=250 C. | D2 - Add controller output/electrical feedback for root cause | Use persistence, correlation and operating-state context. |
| TR-004 | Multi-zone thermal runaway | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Two or more zones rising rapidly, approaching respective severe limits. | D2 - Add controller output/electrical feedback for root cause | Use persistence, correlation and operating-state context. |
| TR-005 | SSR/contactor welded ON | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Zone continues rising with zero heat command; output feedback required for confirmation. | D2 - Add controller output/electrical feedback for root cause | Use persistence, correlation and operating-state context. |
| TR-006 | Heater short/open catastrophic | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Abrupt loss/runaway thermal response plus electrical evidence. | D2 - Add controller output/electrical feedback for root cause | Use persistence, correlation and operating-state context. |
| TR-007 | Complete thermal-control loss | Z1, Z2, Z3, MT | Z1: 150 C Z2: 170 C Z3: 190 C MT: 180 C | Z1: 180 C Z2: 210 C Z3: 220 C MT: 210 C | Z1: 210 C Z2: 230 C Z3: 250 C MT: 240 C | Uncontrolled temperatures; may cross multiple severe limits. | D2 - Add controller output/electrical feedback for root cause | Use persistence, correlation and operating-state context. |

## 8. Melt & Polymer Process
Melt pressure, melt temperature, current/load and speed interactions. Many process faults are multivariable rather than single-sensor threshold events.
Catalogue entries in this section: 29   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 8.1  FREQUENT
| 13 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| PF-001 | High melt pressure | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Baseline-high >=4.8 MPa; warning >=5.4; severe >=6.0. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| PF-002 | Low melt pressure | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Baseline-low <=3.2 MPa; warning <=2.0; severe <=1.0. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| PF-003 | Melt pressure increasing | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Slope >=+0.005 MPa/s (~0.3 MPa/min). | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| PF-004 | Melt pressure decreasing | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Slope <=-0.005 MPa/s. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| PF-005 | Pressure instability | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Sigma >=0.40 MPa; severe >=0.80 MPa. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| PF-006 | Pressure pulsation | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | P-P >=0.5 MPa; severe >=1.5 MPa. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| PF-007 | Melt temperature drift | MT | MT: 180 C | MT: 210 C | MT: 240 C | Absolute trend >0.5 C/min sustained; contextual. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| PF-008 | Melt temperature instability | MT | MT: 180 C | MT: 210 C | MT: 240 C | Sigma >=3 C; severe >=6 C. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| PF-009 | High-viscosity process | MT, P, I | MT: 180 C P: 1.0 MPa I: 3 A | MT: 210 C P: 4.0 MPa I: 10 A | MT: 240 C P: 6.0 MPa I: 20 A | Typical MT 185-200 C, P 4.8-5.6 MPa, I 12.5-17 A, RPM stable. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| PF-010 | Low-viscosity process | MT, P, I | MT: 180 C P: 1.0 MPa I: 3 A | MT: 210 C P: 4.0 MPa I: 10 A | MT: 240 C P: 6.0 MPa I: 20 A | Typical MT 220-235 C, P 2.5-3.2 MPa, I 6-8 A with adequate feed. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| PF-011 | Process surging | P, I, RPM | P: 1.0 MPa I: 3 A RPM: 1800 rpm | P: 4.0 MPa I: 10 A RPM: 2000 rpm | P: 6.0 MPa I: 20 A RPM: 2250 rpm | P/I cyclic with RPM stable; P P-P >=0.5 MPa. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| PF-012 | Excess back pressure | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | P>=5.4-6 MPa and I>=15 A. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| PF-013 | Insufficient back pressure | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | P<=2-3.2 MPa and I below baseline. | D1 - Detectable now | Use persistence, correlation and operating-state context. |

## 8.2  SOMETIMES
| 10 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| PS-001 | Incomplete melting | MT, P, I | MT: 180 C P: 1.0 MPa I: 3 A | MT: 210 C P: 4.0 MPa I: 10 A | MT: 240 C P: 6.0 MPa I: 20 A | MT<=190 C + pressure/load instability; product evidence helpful. | D2 - Multivariable/family-level | Use persistence, correlation and operating-state context. |
| PS-002 | Excessive shear heating | MT, P, I | MT: 180 C P: 1.0 MPa I: 3 A | MT: 210 C P: 4.0 MPa I: 10 A | MT: 240 C P: 6.0 MPa I: 20 A | MT>=230 C while P/I elevated. | D2 - Multivariable/family-level | Use persistence, correlation and operating-state context. |
| PS-003 | Excessive residence time | MT, FR | MT: 180 C FR: 10 kg/h | MT: 210 C FR: 50 kg/h | MT: 240 C FR: 80 kg/h | Low throughput/feed + high/persistent MT; residence model required. | D2 - Multivariable/family-level | Use persistence, correlation and operating-state context. |
| PS-004 | Flow instability | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | P sigma>=0.4 and I sigma>=1.5 A. | D2 - Multivariable/family-level | Use persistence, correlation and operating-state context. |
| PS-005 | Melt fracture tendency | MT, P | MT: 180 C P: 1.0 MPa | MT: 210 C P: 4.0 MPa | MT: 240 C P: 6.0 MPa | Typically MT low (<=190-200) with P high (>=5.4); product surface sensor/camera confirms. | D2 - Multivariable/family-level | Use persistence, correlation and operating-state context. |
| PS-006 | Poor mixing | MT, P, QUALITY | MT: 180 C P: 1.0 MPa QUALITY: N/A | MT: 210 C P: 4.0 MPa QUALITY: product specification | MT: 240 C P: 6.0 MPa QUALITY: product specification | MT/P variability; product quality measurement required. | D2 - Multivariable/family-level | Use persistence, correlation and operating-state context. |
| PS-007 | Poor homogenization | MT, P, QUALITY | MT: 180 C P: 1.0 MPa QUALITY: N/A | MT: 210 C P: 4.0 MPa QUALITY: product specification | MT: 240 C P: 6.0 MPa QUALITY: product specification | Process variance without single thermal/pressure cause; quality evidence required. | D2 - Multivariable/family-level | Use persistence, correlation and operating-state context. |
| PS-008 | Output reduction at fixed speed | P, I, SRPM | P: 1.0 MPa I: 3 A SRPM: 90 rpm | P: 4.0 MPa I: 10 A SRPM: 100 rpm | P: 6.0 MPa I: 20 A SRPM: 112.5 rpm | P/I lower than baseline at SRPM~100; differentiate wear, viscosity and feed. | D2 - Multivariable/family-level | Use persistence, correlation and operating-state context. |
| PS-009 | Process efficiency degradation | P, I, FR, SRPM | P: 1.0 MPa I: 3 A FR: 10 kg/h SRPM: 90 rpm | P: 4.0 MPa I: 10 A FR: 50 kg/h SRPM: 100 rpm | P: 6.0 MPa I: 20 A FR: 80 kg/h SRPM: 112.5 rpm | Same command/recipe with progressive P/I/output relationship deterioration. | D2 - Multivariable/family-level | Use persistence, correlation and operating-state context. |
| PS-010 | Process oscillation from control interaction | P, I, RPM | P: 1.0 MPa I: 3 A RPM: 1800 rpm | P: 4.0 MPa I: 10 A RPM: 2000 rpm | P: 6.0 MPa I: 20 A RPM: 2250 rpm | Correlated periodic P/I/RPM behavior; control log required. | D2 - Multivariable/family-level | Use persistence, correlation and operating-state context. |

## 8.3  RARE
| 6 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| PR-001 | Severe polymer decomposition | MT, P | MT: 180 C P: 1.0 MPa | MT: 210 C P: 4.0 MPa | MT: 240 C P: 6.0 MPa | MT near/above 240 C or excessive residence; gas/quality evidence required. | D2 - Critical process family; safety system remains independent | Use persistence, correlation and operating-state context. |
| PR-002 | Gas generation in melt | P, MT, QUALITY | P: 1.0 MPa MT: 180 C QUALITY: N/A | P: 4.0 MPa MT: 210 C QUALITY: product specification | P: 6.0 MPa MT: 240 C QUALITY: product specification | Pressure instability and product defects; gas/vent measurement required. | D2 - Critical process family; safety system remains independent | Use persistence, correlation and operating-state context. |
| PR-003 | Catastrophic pressure excursion | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | P>=6 MPa and continuing to rise; protection action per machine safety system. | D2 - Critical process family; safety system remains independent | Use persistence, correlation and operating-state context. |
| PR-004 | Material solidification in barrel/die | MT, P, I | MT: 180 C P: 1.0 MPa I: 3 A | MT: 210 C P: 4.0 MPa I: 10 A | MT: 240 C P: 6.0 MPa I: 20 A | Low MT plus rising P/I; can progress to stall. | D2 - Critical process family; safety system  remains independent | Use persistence, correlation and operating-state context. |
| PR-005 | Complete melt-flow interruption | P, I, RPM | P: 1.0 MPa I: 3 A RPM: 1800 rpm | P: 4.0 MPa I: 10 A RPM: 2000 rpm | P: 6.0 MPa I: 20 A RPM: 2250 rpm | Output disappears; P may collapse or rise depending blockage location. | D2 - Critical process family; safety system remains independent | Use persistence, correlation and operating-state context. |
| PR-006 | Complete process blockage | P, I, RPM | P: 1.0 MPa I: 3 A RPM: 1800 rpm | P: 4.0 MPa I: 10 A RPM: 2000 rpm | P: 6.0 MPa I: 20 A RPM: 2250 rpm | P>=6 MPa, I 18-20 A, RPM may fall. | D2 - Critical process family; safety system remains independent | Use persistence, correlation and operating-state context. |

## 9. Screen Pack & Breaker Plate
Downstream restriction component. Current P sensor is upstream, so screen vs die vs viscosity may be ambiguous without downstream pressure localization.
Catalogue entries in this section: 15   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 9.1  FREQUENT
| 5 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| SCF-001 | Screen contamination | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Early P 4.6-4.8 MPa, I 10.5-12.5 A; progressive loading. | D2 - Downstream restriction family | Use persistence, correlation and operating-state context. |
| SCF-002 | Gradual screen blockage | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | P trend upward; moderate 5.0-5.4 MPa, I 13-15 A. | D2 - Downstream restriction family | Use persistence, correlation and operating-state context. |
| SCF-003 | Partial screen blockage | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | P ~5.0-5.8 MPa, I ~13-18 A. | D2 - Downstream restriction family | Use persistence, correlation and operating-state context. |
| SCF-004 | Near-critical screen blockage | P, I, RPM | P: 1.0 MPa I: 3 A RPM: 1800 rpm | P: 4.0 MPa I: 10 A RPM: 2000 rpm | P: 6.0 MPa I: 20 A RPM: 2250 rpm | P approaches 6 MPa, I 18-20 A; RPM may fall toward <=1900. | D2 - Downstream restriction family | Use persistence, correlation and operating-state context. |
| SCF-005 | Screen loading by contaminants | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Stable RPM/feed with progressive P/I rise. | D2 - Downstream restriction family | Use persistence, correlation and operating-state context. |

## 9.2  SOMETIMES
| 6 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| SCS-001 | Incorrect screen mesh | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Normal recipe runs at shifted P/I baseline; compare configuration/maintenance record. | D2 - Family-level; inspection localizes | Use persistence, correlation and operating-state context. |
| SCS-002 | Excess screen-pack resistance | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | P>=5.4 MPa and I>=15 A without other explanation. | D2 - Family-level; inspection localizes | Use persistence, correlation and operating-state context. |
| SCS-003 | Screen installed incorrectly | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Pressure/process instability or unexpected baseline shift. | D2 - Family-level; inspection localizes | Use persistence, correlation and operating-state context. |
| SCS-004 | Screen deformation | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Pressure behavior changes; inspection required. | D2 - Family-level; inspection localizes | Use persistence, correlation and operating-state context. |
| SCS-005 | Breaker-plate fouling | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Same high-P/high-load restriction vector. | D2 - Family-level; inspection localizes | Use persistence, correlation and operating-state context. |
| SCS-006 | Contaminated breaker plate | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Progressive P increase at stable speed/feed. | D2 - Family-level; inspection localizes | Use persistence, correlation and operating-state context. |

## 9.3  RARE
| 4 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| SCR-001 | Screen rupture | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Abrupt P drop after previously high P; contamination risk downstream. | D2 - Restriction family / inspection | Use persistence, correlation and operating-state context. |
| SCR-002 | Screen bypass | P, QUALITY | P: 1.0 MPa QUALITY: N/A | P: 4.0 MPa QUALITY: product specification | P: 6.0 MPa QUALITY: product specification | P drop plus downstream contamination/quality defect. | D2 - Restriction family / inspection | Use persistence, correlation and operating-state context. |
| SCR-003 | Breaker-plate structural damage | P, QUALITY | P: 1.0 MPa QUALITY: N/A | P: 4.0 MPa QUALITY: product specification | P: 6.0 MPa QUALITY: product specification | Abnormal process/quality; inspection required. | D2 - Restriction family / inspection | Use persistence, correlation and operating-state context. |
| SCR-004 | Complete screen blockage | P, I, RPM | P: 1.0 MPa I: 3 A RPM: 1800 rpm | P: 4.0 MPa I: 10 A RPM: 2000 rpm | P: 6.0 MPa I: 20 A RPM: 2250 rpm | P>=6 MPa, I>=18-20 A, RPM may fall. | D2 - Restriction family / inspection | Use persistence, correlation and operating-state context. |

## 10. Die & Extrusion Head
Final flow restriction and shaping system. Current upstream pressure can detect restriction but not uniquely localize screen vs die.
Catalogue entries in this section: 20   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 10.1  FREQUENT
| 4 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| DF-001 | Die contamination | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | P rises >=4.8-5.4 MPa with load increase. | D2 - Restriction family / quality sensor useful | Use persistence, correlation and operating-state context. |
| DF-002 | Die-lip build-up | P, QUALITY | P: 1.0 MPa QUALITY: N/A | P: 4.0 MPa QUALITY: product specification | P: 6.0 MPa QUALITY: product specification | Pressure fluctuation plus product lines/quality defects. | D2 - Restriction family / quality sensor useful | Use persistence, correlation and operating-state context. |
| DF-003 | Partial die restriction | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | P>=5.4 MPa, I>=15 A; severe approaches 6/20. | D2 - Restriction family / quality sensor useful | Use persistence, correlation and operating-state context. |
| DF-004 | Non-uniform die flow | P, QUALITY | P: 1.0 MPa QUALITY: N/A | P: 4.0 MPa QUALITY: product specification | P: 6.0 MPa QUALITY: product specification | Pressure/process instability; downstream quality measurement needed. | D2 - Restriction family / quality sensor useful | Use persistence, correlation and operating-state context. |

## 10.2  SOMETIMES
| 9 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| DS-001 | Die temperature too low | MT, P, I, DIE_T | MT: 180 C P: 1.0 MPa I: 3 A DIE_T: N/A | MT: 210 C P: 4.0 MPa I: 10 A DIE_T: recipe-dependent | MT: 240 C P: 6.0 MPa I: 20 A DIE_T: material/OEM limit | MT lower and P/I higher; direct die temperature needed for localization. | D3 - Additional die/quality sensing required for unique root cause | Use persistence, correlation and operating-state context. |
| DS-002 | Die temperature too high | MT, DIE_T | MT: 180 C DIE_T: N/A | MT: 210 C DIE_T: recipe-dependent | MT: 240 C DIE_T: material/OEM limit | MT high and degradation risk; direct die T needed. | D3 - Additional die/quality sensing required for unique root cause | Use persistence, correlation and operating-state context. |
| DS-003 | Die gap too small | P, I, QUALITY | P: 1.0 MPa I: 3 A QUALITY: N/A | P: 4.0 MPa I: 10 A QUALITY: product specification | P: 6.0 MPa I: 20 A QUALITY: product specification | P/I elevated; melt-fracture tendency. | D3 - Additional die/quality sensing required for unique root cause | Use persistence, correlation and operating-state context. |
| DS-004 | Die misalignment | QUALITY | QUALITY: N/A | QUALITY: product specification | QUALITY: product specification | Product geometry evidence/inspection required. | D3 - Additional die/quality sensing required for unique root cause | Use persistence, correlation and operating-state context. |
| DS-005 | Die fouling | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Progressive P rise at stable feed/speed. | D3 - Additional die/quality sensing required for unique root cause | Use persistence, correlation and operating-state context. |
| DS-006 | Dead-zone material build-up | P, MT, QUALITY | P: 1.0 MPa MT: 180 C QUALITY: N/A | P: 4.0 MPa MT: 210 C QUALITY: product specification | P: 6.0 MPa MT: 240 C QUALITY: product specification | Pressure/temperature instability and degradation evidence. | D3 - Additional die/quality sensing required for unique root cause | Use persistence, correlation and operating-state context. |
| DS-007 | Die-lip damage | QUALITY | QUALITY: N/A | QUALITY:  product specification | QUALITY: product  specification | Surface/dimensional defect; camera/inspection  required. | D3 - Additional  die/quality sensing required for unique root cause | Use persistence, correlation and operating-state  context. |
| DS-008 | Uneven die heating | DIE_T, QUALITY | DIE_T: N/A QUALITY: N/A | DIE_T: recipe-dependent QUALITY: product specification | DIE_T: material/OEM limit QUALITY: product specification | Multi-point die temperature required. | D3 - Additional die/quality sensing required for unique root cause | Use persistence, correlation and operating-state context. |
| DS-009 | Melt leak at die flange | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Unexpected P drop; visual/leak detection required. | D3 - Additional die/quality sensing required for unique root cause | Use persistence, correlation and operating-state context. |

## 10.3  RARE
| 7 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| DR-001 | Complete die blockage | P, I, RPM | P: 1.0 MPa I: 3 A RPM: 1800 rpm | P: 4.0 MPa I: 10 A RPM: 2000 rpm | P: 6.0 MPa I: 20 A RPM: 2250 rpm | P>=6 MPa, I>=18-20 A, possible RPM drop. | D3 - Inspection/safety instrumentation | Use persistence, correlation and operating-state context. |
| DR-002 | Die structural crack | P, QUALITY | P: 1.0 MPa QUALITY: N/A | P: 4.0 MPa QUALITY: product specification | P: 6.0 MPa QUALITY: product specification | Pressure loss/product defect; inspection. | D3 - Inspection/safety instrumentation | Use persistence, correlation and operating-state context. |
| DR-003 | Head flange failure | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Abrupt pressure/melt leak. | D3 - Inspection/safety instrumentation | Use persistence, correlation and operating-state context. |
| DR-004 | Severe melt leakage | P, MT | P: 1.0 MPa MT: 180 C | P: 4.0 MPa MT: 210 C | P: 6.0 MPa MT: 240 C | Pressure loss + local thermal/visual evidence. | D3 - Inspection/safety instrumentation | Use persistence, correlation and operating-state context. |
| DR-005 | Die fastener failure | P, QUALITY | P: 1.0 MPa QUALITY: N/A | P: 4.0 MPa QUALITY: product specification | P: 6.0 MPa QUALITY: product specification | Leak/misalignment; inspection. | D3 - Inspection/safety instrumentation | Use persistence, correlation and operating-state context. |
| DR-006 | Major die deformation | P, QUALITY | P: 1.0 MPa QUALITY: N/A | P: 4.0 MPa QUALITY: product specification | P: 6.0 MPa QUALITY: product specification | Abnormal pressure and geometry. | D3 - Inspection/safety instrumentation | Use persistence, correlation and operating-state context. |
| DR-007 | Catastrophic head overpressure | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | P>=6 MPa and rising; machine protection independent of ULTRON diagnostics. | D3 - Inspection/safety instrumentation | Use persistence, correlation and operating-state context. |

## 11. Raw Material / Polymer Condition
Recipe reference: PA6 grade 6201, nominal feed 50 kg/h, melt 210 C, melt pressure 4 MPa. Material faults often alter the MT-P-I relationship.
Catalogue entries in this section: 28   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 11.1  FREQUENT
| 8 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| MATF-001 | Material viscosity increase | MT, P, I | MT: 180 C P: 1.0 MPa I: 3 A | MT: 210 C P: 4.0 MPa I: 10 A | MT: 240 C P: 6.0 MPa I: 20 A | Typical MT 185-200 C, P 4.8-5.6 MPa, I 12.5-17 A. | D2 - Family-level unless material measurement available | Use persistence, correlation and operating-state context. |
| MATF-002 | Material viscosity decrease | MT, P, I | MT: 180 C P: 1.0 MPa I: 3 A | MT: 210 C P: 4.0 MPa I: 10 A | MT: 240 C P: 6.0 MPa I: 20 A | Typical MT 220-235 C, P 2.5-3.2 MPa, I 6-8 A. | D2 - Family-level unless material measurement available | Use persistence, correlation and operating-state context. |
| MATF-003 | Moisture too high | MOIST, P, MT | MOIST: N/A P: 1.0 MPa MT: 180 C | MOIST: supplier/grade target P: 4.0 MPa MT: 210 C | MOIST: N/A P: 6.0 MPa MT: 240 C | P/MT/process instability; moisture % must follow supplier grade specification. | D2 - Family-level unless material measurement available | Use persistence, correlation and operating-state context. |
| MATF-004 | Poor material drying | MOIST, P, MT | MOIST: N/A P: 1.0 MPa MT: 180 C | MOIST: supplier/grade target P: 4.0 MPa MT: 210 C | MOIST: N/A P: 6.0 MPa MT: 240 C | Same family as high moisture; dryer status/moisture sensor required. | D2 - Family-level unless material measurement available | Use persistence, correlation and operating-state context. |
| MATF-005 | Foreign contamination | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Early P 4.5-4.8/I 11-13; screen loading can progress to P>=5.4/I>=15. | D2 - Family-level unless material measurement available | Use persistence, correlation and operating-state context. |
| MATF-006 | Material lot variation | MT, P, I | MT: 180 C P: 1.0 MPa I: 3 A | MT: 210 C P: 4.0 MPa I: 10 A | MT: 240 C P: 6.0 MPa I: 20 A | Persistent shift in MT-P-I baseline vs recipe. | D2 - Family-level unless material measurement available | Use persistence, correlation and operating-state context. |
| MATF-007 | Bulk-density variation | P, I, L | P: 1.0 MPa I: 3 A L: 5% | P: 4.0 MPa I: 10 A L: 75% | P: 6.0 MPa I: 20 A L: 95% | Feed/load/pressure instability at stable speed. | D2 - Family-level unless material measurement available | Use persistence, correlation and operating-state context. |
| MATF-008 | Pellet-size variation | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Feeding/pressure oscillation; feeder measurement helps. | D2 - Family-level unless material measurement available | Use persistence, correlation and operating-state context. |

## 11.2  SOMETIMES
| 14 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| MATS-001 | Wrong polymer grade | MT, P, I | MT: 180 C P: 1.0 MPa I: 3 A | MT: 210 C P: 4.0 MPa I: 10 A | MT: 240 C P: 6.0 MPa I: 20 A | Large persistent departure from recipe MT-P-I relationship; recipe/material ID needed. | D3 - Material/quality measurement required for unique ID | Use persistence, correlation and operating-state context. |
| MATS-002 | Wrong MFI / rheology | MT, P, I | MT: 180 C P: 1.0 MPa I: 3 A | MT: 210 C P: 4.0 MPa I: 10 A | MT: 240 C P: 6.0 MPa I: 20 A | Pressure/load shift at same MT/feed; lab/inline rheology required. | D3 - Material/quality measurement required for unique ID | Use persistence, correlation and operating-state context. |
| MATS-003 | Recycled-content variation | MT, P, I | MT: 180 C P: 1.0 MPa I: 3 A | MT: 210 C P: 4.0 MPa I: 10 A | MT: 240 C P: 6.0 MPa I: 20 A | Viscosity/feed variability; material record required. | D3 - Material/quality measurement required for unique ID | Use persistence, correlation and operating-state context. |
| MATS-004 | Additive concentration error | QUALITY, P, MT | QUALITY: N/A P: 1.0 MPa MT: 180 C | QUALITY: product specification P: 4.0 MPa MT: 210 C | QUALITY: product specification P: 6.0 MPa MT: 240 C | Quality/process shift; formulation data required. | D3 - Material/quality measurement required for unique ID | Use persistence, correlation and operating-state context. |
| MATS-005 | Filler-content variation | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Load/pressure shift; material composition evidence required. | D3 - Material/quality measurement required for unique ID | Use persistence, correlation and operating-state context. |
| MATS-006 | Excess abrasive filler | P, I | P: 1.0 MPa I: 3 A | P: 4.0 MPa I: 10 A | P: 6.0 MPa I: 20 A | Long-term screw/barrel wear acceleration; material/inspection evidence. | D3 - Material/quality measurement required for unique ID | Use persistence, correlation and operating-state context. |
| MATS-007 | Regrind ratio variation | P, I, MT | P: 1.0 MPa I: 3 A MT: 180 C | P: 4.0 MPa I: 10 A MT: 210 C | P: 6.0 MPa I: 20 A MT: 240 C | Process baseline changes; batch data required. | D3 - Material/quality measurement required for unique ID | Use persistence, correlation and operating-state context. |
| MATS-008 | Color/masterbatch variation | QUALITY | QUALITY: N/A | QUALITY: product specification | QUALITY: product specification | Quality evidence; no unique current sensor vector. | D3 - Material/quality measurement required for unique ID | Use persistence, correlation and operating-state context. |
| MATS-009 | Poor pellet blending | P, I, QUALITY | P: 1.0 MPa I: 3 A QUALITY: N/A | P: 4.0 MPa I: 10 A QUALITY: product specification | P: 6.0 MPa I: 20 A QUALITY: product specification | Process/quality variability. | D3 - Material/quality measurement required for unique ID | Use persistence, correlation and operating-state context. |
| MATS-010 | Incoming material too cold | P, I, MT | P: 1.0 MPa I: 3 A MT: 180 C | P: 4.0 MPa I: 10 A MT: 210 C | P: 6.0 MPa I: 20 A MT: 240 C | Higher load/pressure and thermal disturbance. | D3 - Material/quality measurement required for unique ID | Use persistence, correlation and operating-state context. |
| MATS-011 | Incoming material too hot | MT, P | MT: 180 C P: 1.0 MPa | MT: 210 C P: 4.0 MPa | MT: 240 C P: 6.0 MPa | Lower viscosity/pressure tendency. | D3 - Material/quality measurement required for unique ID | Use persistence, correlation and operating-state context. |
| MATS-012 | Material agglomeration | P, I, L | P: 1.0 MPa I: 3 A L: 5% | P: 4.0 MPa I: 10 A L: 75% | P: 6.0 MPa I: 20 A L: 95% | Feed instability/restriction. | D3 - Material/quality measurement required for unique ID | Use persistence, correlation and operating-state context. |
| MATS-013 | Thermal degradation/oxidation | MT, QUALITY | MT: 180 C QUALITY: N/A | MT: 210 C QUALITY: product specification | MT: 240 C QUALITY: product specification | High MT/residence and product discoloration; quality evidence. | D3 - Material/quality measurement required for unique ID | Use persistence, correlation and operating-state context. |
| MATS-014 | Poor storage condition | MOIST, QUALITY | MOIST: N/A QUALITY: N/A | MOIST: supplier/grade target QUALITY: product specification | MOIST: N/A QUALITY: product specification | Moisture/contamination family; storage history needed. | D3 - Material/quality measurement required for unique ID | Use persistence, correlation and operating-state context. |

## 11.3  RARE
| 6 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| MATR-001 | Completely wrong resin | MT, P, I | MT: 180 C P: 1.0 MPa I: 3 A | MT: 210 C P: 4.0 MPa I: 10 A | MT: 240 C P: 6.0 MPa I: 20 A | Major MT-P-I mismatch to recipe; material traceability confirms. | D3 - Material analysis required | Use persistence, correlation and operating-state context. |
| MATR-002 | Severely contaminated batch | P, I, QUALITY | P: 1.0 MPa I: 3 A QUALITY: N/A | P: 4.0 MPa I: 10 A QUALITY: product specification | P: 6.0 MPa I: 20 A QUALITY: product specification | Restriction/quality failure; inspection/material test. | D3 - Material analysis required | Use persistence, correlation and operating-state context. |
| MATR-003 | Metal contamination | P, QUALITY | P: 1.0 MPa QUALITY: N/A | P: 4.0 MPa QUALITY: product specification | P: 6.0 MPa QUALITY: product specification | Potential screen loading/product hazard; metal detector/inspection required. | D3 - Material analysis required | Use persistence, correlation and operating-state context. |
| MATR-004 | Moisture saturation | MOIST, QUALITY | MOIST: N/A QUALITY: N/A | MOIST: supplier/grade target QUALITY: product specification | MOIST: N/A QUALITY: product specification | Supplier-specific moisture threshold; severe product/process impact. | D3 - Material analysis required | Use persistence, correlation and operating-state context. |
| MATR-005 | Severe polymer decomposition | MT, P, QUALITY | MT: 180 C P: 1.0 MPa QUALITY: N/A | MT: 210 C P: 4.0 MPa QUALITY: product specification | MT: 240 C P: 6.0 MPa QUALITY: product specification | MT near/above 240 C or long residence; gas/discoloration. | D3 - Material analysis required | Use persistence, correlation and operating-state context. |
| MATR-006 | Incompatible material mixture | P, I, QUALITY | P: 1.0 MPa I: 3 A QUALITY: N/A | P: 4.0 MPa I: 10 A QUALITY: product specification | P: 6.0 MPa I: 20 A QUALITY: product specification | Large rheology/quality abnormality; material analysis. | D3 - Material analysis required | Use persistence, correlation and operating-state context. |

## 12. Cooling System
Barrel, motor and gearbox cooling performance. Current temperatures provide consequence detection; flow/valve measurements would improve cause identification.
Catalogue entries in this section: 16   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 12.1  FREQUENT
| 3 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| COF-001 | Cooling performance reduced | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | After cooling demand, temperature fails to fall adequately; slope >-0.5 C/min is weak. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| COF-002 | Cooling response slow | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Weak cooling slope between -0.5 and -0.1 C/min. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| COF-003 | Local temperature remains high | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Zone remains above target and may cross warning-high. | D1 - Detectable now | Use persistence, correlation and operating-state context. |

## 12.2  SOMETIMES
| 8 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| COS-001 | Cooling-water flow reduced | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Poor negative slope; add flow sensor for confirmation. | D2 - Temperature consequence detectable; utility cause needs extra sensor | Use persistence, correlation and operating-state context. |
| COS-002 | Cooling passage partially blocked | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Localized persistent high zone; flow/dP sensor useful. | D2 - Temperature consequence detectable; utility cause needs extra sensor | Use persistence, correlation and operating-state context. |
| COS-003 | Cooling solenoid sticking | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Temperature cycling or delayed response. | D2 - Temperature consequence detectable; utility cause needs extra sensor | Use persistence, correlation and operating-state context. |
| COS-004 | Cooling valve partially closed | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Persistent high temp / weak cooling slope. | D2 - Temperature consequence detectable; utility cause needs extra sensor | Use persistence, correlation and operating-state context. |
| COS-005 | Cooling overactive | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Persistent under-temperature despite heat demand. | D2 - Temperature consequence detectable; utility cause needs extra sensor | Use persistence, correlation and operating-state context. |
| COS-006 | Cooling-water temperature too high | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Inadequate recovery; inlet-water T sensor needed. | D2 - Temperature consequence detectable; utility cause needs extra sensor | Use persistence, correlation and operating-state context. |
| COS-007 | Motor cooling degradation | TMOT, I, VM | TMOT: 30 C I: 3 A VM: 0.20 mm/s | TMOT: 40 C I: 10 A VM: 1.67 mm/s | TMOT: 90 C I: 20 A VM: 3.00 mm/s | TMOT>=80 C while I~8-12 and VM<=2. | D2 - Temperature consequence detectable; utility cause needs extra sensor | Use persistence, correlation and operating-state context. |
| COS-008 | Gearbox cooling degradation | TGB, I, VG | TGB: 30 C I: 3 A VG: 0.20 mm/s | TGB: 40 C I: 10 A VG: 1.67 mm/s | TGB: 90 C I: 20 A VG: 3.00 mm/s | TGB>=80 C while I~8-12 and VG<=2. | D2 - Temperature consequence detectable; utility cause needs extra sensor | Use persistence, correlation and operating-state context. |

## 12.3  RARE
| 5 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| COR-001 | Complete cooling-water loss | Z1, Z2, Z3, TMOT, TGB | Z1: 150 C Z2: 170 C Z3: 190 C TMOT: 30 C TGB: 30 C | Z1: 180 C Z2: 210 C Z3: 220 C TMOT: 40 C TGB: 40 C | Z1: 210 C Z2: 230 C Z3: 250 C TMOT: 90 C TGB: 90 C | Multiple temperatures rise together; may exceed 1-3 C/min depending load. | D3 - Utility instrumentation required | Use persistence, correlation and operating-state context. |
| COR-002 | Cooling pump failure | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Multi-zone poor recovery; pump status/flow required. | D3 - Utility instrumentation required | Use persistence, correlation and operating-state context. |
| COR-003 | Cooling pipe rupture | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Cooling loss plus leak evidence. | D3 - Utility instrumentation required | Use persistence, correlation and operating-state context. |
| COR-004 | Complete coolant blockage | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Localized/no cooling; flow/dP sensor required. | D3 - Utility instrumentation required | Use persistence, correlation and operating-state context. |
| COR-005 | Cooling valve complete failure | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | No response to command; actuator feedback required. | D3 - Utility instrumentation required | Use persistence, correlation and operating-state context. |

## 13. Lubrication System
Mainly gearbox/bearing lubrication. Present detection is consequence-based using TGB/VG; oil level, pressure and condition sensing would improve specificity.
Catalogue entries in this section: 14   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 13.1  FREQUENT
| 2 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| LUBF-001 | Gradual lubricant degradation | TGB, VG | TGB: 30 C VG: 0.20 mm/s | TGB: 40 C VG: 1.67 mm/s | TGB: 90 C VG: 3.00 mm/s | Early TGB 50-65 C, VG 1.8-2.2; progressive trend. | D2 - Maintenance/time + condition trend | Use persistence, correlation and operating-state context. |
| LUBF-002 | Lubrication interval overdue | TGB, VG | TGB: 30 C VG: 0.20 mm/s | TGB: 40 C VG: 1.67 mm/s | TGB: 90 C VG: 3.00 mm/s | No unique value; increasing temperature/vibration trend and maintenance elapsed time. | D2 - Maintenance/time + condition trend | Use persistence, correlation and operating-state context. |

## 13.2  SOMETIMES
| 8 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| LUBS-001 | Low oil level | TGB, VG, OIL | TGB: 30 C VG: 0.20 mm/s OIL: N/A | TGB: 40 C VG: 1.67 mm/s OIL: OEM oil condition | TGB: 90 C VG: 3.00 mm/s OIL: OEM/site limits | Developing TGB 65-80, VG 2.2-2.5; oil level sensor confirms. | D2 - Oil sensing/maintenance evidence needed | Use persistence, correlation and operating-state context. |
| LUBS-002 | Contaminated oil | TGB, VG, OIL | TGB: 30 C VG: 0.20 mm/s OIL: N/A | TGB: 40 C VG: 1.67 mm/s OIL: OEM oil condition | TGB: 90 C VG: 3.00 mm/s OIL: OEM/site limits | Progressive TGB/VG rise; oil analysis required. | D2 - Oil sensing/maintenance evidence needed | Use persistence, correlation and operating-state context. |
| LUBS-003 | Wrong oil viscosity | TGB, VG, OIL | TGB: 30 C VG: 0.20 mm/s OIL: N/A | TGB: 40 C VG: 1.67 mm/s OIL: OEM oil condition | TGB: 90 C VG: 3.00 mm/s OIL: OEM/site limits | Temperature/load/vibration abnormal; oil record/test required. | D2 - Oil sensing/maintenance evidence needed | Use persistence, correlation and operating-state context. |
| LUBS-004 | Excessive oil temperature | TGB | TGB: 30 C | TGB: 40 C | TGB: 90 C | TGB>=80 warning; >=90 severe. | D2 - Oil sensing/maintenance evidence  needed | Use persistence, correlation and operating-state context. |
| LUBS-005 | Aerated oil | TGB, VG, OIL | TGB: 30 C VG: 0.20 mm/s OIL: N/A | TGB: 40 C VG: 1.67 mm/s OIL: OEM oil condition | TGB: 90 C VG: 3.00 mm/s OIL: OEM/site limits | Variable vibration/temp; oil condition evidence. | D2 - Oil sensing/maintenance evidence needed | Use persistence, correlation and operating-state context. |
| LUBS-006 | Blocked oil filter | TGB, OIL | TGB: 30 C OIL: N/A | TGB: 40 C OIL: OEM oil condition | TGB: 90 C OIL: OEM/site limits | Oil pressure/flow required; temperature may rise. | D2 - Oil sensing/maintenance evidence needed | Use persistence, correlation and operating-state context. |
| LUBS-007 | Inadequate bearing lubrication | TGB, VG | TGB: 30 C VG: 0.20 mm/s | TGB: 40 C VG: 1.67 mm/s | TGB: 90 C VG: 3.00 mm/s | TGB>=70-80 and VG>=2-2.5. | D2 - Oil sensing/maintenance evidence needed | Use persistence, correlation and operating-state context. |
| LUBS-008 | Excess lubrication | TGB, VG | TGB: 30 C VG: 0.20 mm/s | TGB: 40 C VG: 1.67 mm/s | TGB: 90 C VG: 3.00 mm/s | Temperature may rise despite adequate oil; service evidence required. | D2 - Oil sensing/maintenance evidence needed | Use persistence, correlation and operating-state context. |

## 13.3  RARE
| 4 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| LUBR-001 | Oil pump failure | TGB, OIL | TGB: 30 C OIL: N/A | TGB: 40 C OIL: OEM oil condition | TGB: 90 C OIL: OEM/site limits | Oil pressure/flow goes low; current configuration sees later TGB rise. | D3 - Oil instrumentation required | Use persistence, correlation and operating-state context. |
| LUBR-002 | Complete lubricant loss | TGB, VG, OIL | TGB: 30 C VG: 0.20 mm/s OIL: N/A | TGB: 40 C VG: 1.67 mm/s OIL: OEM oil condition | TGB: 90 C VG: 3.00 mm/s OIL: OEM/site limits | TGB>=90 + VG>=3 can develop rapidly. | D3 - Oil instrumentation required | Use persistence, correlation and operating-state context. |
| LUBR-003 | Lubricant line rupture | TGB, OIL | TGB: 30 C OIL: N/A | TGB: 40 C OIL: OEM oil condition | TGB: 90 C OIL: OEM/site limits | Loss of pressure/level; leak evidence. | D3 - Oil instrumentation required | Use persistence, correlation and operating-state context. |
| LUBR-004 | Major seal failure / oil loss | TGB, VG, OIL | TGB: 30 C VG: 0.20 mm/s OIL: N/A | TGB: 40 C VG: 1.67 mm/s OIL: OEM oil condition | TGB: 90 C VG: 3.00 mm/s OIL: OEM/site limits | Secondary TGB/VG rise; level/leak sensor confirms. | D3 - Oil instrumentation required | Use persistence, correlation and operating-state context. |

## 14. Electrical Supply & VFD
Drive electronics and incoming power. Current ULTRON has aggregate motor current and speed; exact phase/winding faults require phase voltage/current and VFD status.
Catalogue entries in this section: 31   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 14.1  FREQUENT
| 5 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| EF-001 | Speed-reference mismatch | RPM | RPM: 1800 rpm | RPM: 2000 rpm | RPM: 2250 rpm | Actual RPM persistently differs from commanded by >~5% (e.g., outside 1900-2100 around 2000 target). | D2 - Broad drive/electrical family | Use persistence, correlation and operating-state context. |
| EF-002 | Drive speed hunting | RPM, I | RPM: 1800 rpm I: 3 A | RPM: 2000 rpm I: 10 A | RPM: 2250 rpm I: 20 A | RPM P-P>=100 rpm with cyclic I response. | D2 - Broad drive/electrical family | Use persistence, correlation and operating-state context. |
| EF-003 | Drive overload/current limiting | RPM, I | RPM: 1800 rpm I: 3 A | RPM: 2000 rpm I: 10 A | RPM: 2250 rpm I: 20 A | I>=15-20 A while RPM falls <=1900. | D2 - Broad drive/electrical family | Use persistence, correlation and operating-state context. |
| EF-004 | Transient current overload | I | I: 3 A | I: 10 A | I: 20 A | I>=15 A transient; severe >=20 A. Duration/persistence matters. | D2 - Broad drive/electrical family | Use persistence, correlation and operating-state context. |
| EF-005 | Poor electrical connection - broad | I, TMOT | I: 3 A TMOT: 30 C | I: 10 A TMOT: 40 C | I: 20 A TMOT: 90 C | Current/temperature instability; terminal thermal/phase measurement required. | D2 - Broad drive/electrical family | Use persistence, correlation and operating-state context. |

## 14.2  SOMETIMES
| 14 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| ES-001 | Acceleration/deceleration parameter wrong | RPM, I | RPM: 1800 rpm I: 3 A | RPM: 2000 rpm I: 10 A | RPM: 2250 rpm I: 20 A | Excessive overshoot/undershoot or long ramp; VFD command log required. | D3 - Phase/VFD telemetry required | Use persistence, correlation and operating-state context. |
| ES-002 | VFD thermal derating | RPM, I | RPM: 1800 rpm I: 3 A | RPM: 2000 rpm I: 10 A | RPM: 2250 rpm I: 20 A | RPM/load capability falls despite command; VFD temperature/status required. | D3 - Phase/VFD telemetry required | Use persistence, correlation and operating-state context. |
| ES-003 | DC-bus instability | RPM, I | RPM: 1800 rpm I: 3 A | RPM: 2000 rpm I: 10 A | RPM: 2250 rpm I: 20 A | Speed/current disturbance; VFD DC-bus telemetry required. | D3 - Phase/VFD telemetry required | Use persistence, correlation and operating-state context. |
| ES-004 | Incorrect frequency limit | RPM | RPM: 1800 rpm | RPM: 2000 rpm | RPM: 2250 rpm | Speed clips at wrong value; configuration/VFD parameter evidence. | D3 - Phase/VFD telemetry required | Use persistence, correlation and operating-state context. |
| ES-005 | Torque-boost/current-control tuning issue | RPM, I | RPM: 1800 rpm I: 3 A | RPM: 2000 rpm I: 10 A | RPM: 2250 rpm I: 20 A | Hunting or low-speed load problem; drive parameter evidence. | D3 - Phase/VFD telemetry required | Use persistence, correlation and operating-state context. |
| ES-006 | Feedback/scaling mismatch | RPM | RPM: 1800 rpm | RPM: 2000 rpm | RPM: 2250 rpm | Command/actual mismatch; compare drive feedback to independent RPM sensor. | D3 - Phase/VFD telemetry required | Use persistence, correlation and operating-state context. |
| ES-007 | Voltage variation | PHASE, RPM, I | PHASE: N/A RPM: 1800 rpm I: 3 A | PHASE: balanced 3-phase RPM: 2000 rpm I: 10 A | PHASE: OEM/site limits RPM: 2250 rpm I: 20 A | Phase voltage measurement required; secondary RPM/I effects. | D3 - Phase/VFD telemetry required | Use persistence, correlation and operating-state context. |
| ES-008 | Voltage imbalance | PHASE | PHASE: N/A | PHASE: balanced 3-phase | PHASE: OEM/site limits | Use site/OEM limit; individual phase voltages required. | D3 - Phase/VFD telemetry required | Use persistence, correlation and operating-state context. |
| ES-009 | Phase-current imbalance | PHASE | PHASE: N/A | PHASE: balanced 3-phase | PHASE: OEM/site limits | Use site/OEM limit; individual Ia/Ib/Ic required. | D3 - Phase/VFD telemetry required | Use persistence, correlation and operating-state context. |
| ES-010 | Poor power factor | PHASE | PHASE: N/A | PHASE: balanced 3-phase | PHASE: OEM/site limits | Power meter PF required; current alone insufficient. | D3 - Phase/VFD telemetry required | Use persistence, correlation and operating-state context. |
| ES-011 | Loose electrical terminal | PHASE, TMOT | PHASE: N/A TMOT: 30 C | PHASE: balanced 3-phase TMOT: 40 C | PHASE: OEM/site limits TMOT: 90 C | Thermal/current imbalance evidence; inspection. | D3 - Phase/VFD telemetry required | Use persistence, correlation and operating-state context. |
| ES-012 | Contactor degradation | PHASE, RPM | PHASE: N/A RPM: 1800 rpm | PHASE: balanced 3-phase RPM: 2000 rpm | PHASE: OEM/site limits RPM: 2250 rpm | Voltage drop/intermittency; contactor status/thermal inspection. | D3 - Phase/VFD telemetry required | Use persistence, correlation and operating-state context. |
| ES-013 | Harmonic distortion | PHASE | PHASE: N/A | PHASE: balanced 3-phase | PHASE: OEM/site limits | Voltage/current waveform THD required. | D3 - Phase/VFD telemetry required | Use persistence, correlation and operating-state context. |
| ES-014 | Grounding issue | PHASE | PHASE: N/A | PHASE: balanced 3-phase | PHASE: OEM/site limits | Leakage/ground measurement required. | D3 - Phase/VFD telemetry required | Use persistence, correlation and operating-state context. |

## 14.3  RARE
| 12 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| ER-001 | VFD inverter power-stage failure | RPM, I | RPM: 1800 rpm I: 3 A | RPM: 2000 rpm I: 10 A | RPM: 2250 rpm I: 20 A | Severe speed/current anomaly; VFD fault code required. | D3 - Dedicated electrical protection/VFD data required | Use persistence, correlation and operating-state context. |
| ER-002 | IGBT failure | RPM, PHASE | RPM: 1800 rpm PHASE: N/A | RPM: 2000 rpm PHASE: balanced 3-phase | RPM: 2250 rpm PHASE: OEM/site limits | Drive trip/phase abnormality; VFD diagnostics. | D3 - Dedicated electrical protection/VFD data required | Use persistence, correlation and operating-state context. |
| ER-003 | DC-bus capacitor failure | RPM, PHASE | RPM: 1800 rpm PHASE: N/A | RPM: 2000 rpm PHASE: balanced 3-phase | RPM: 2250 rpm PHASE: OEM/site limits | DC ripple/status required. | D3 - Dedicated electrical protection/VFD data required | Use persistence, correlation and operating-state context. |
| ER-004 | Rectifier failure | PHASE, RPM | PHASE: N/A RPM: 1800  rpm | PHASE: balanced 3- phase RPM: 2000 rpm | PHASE: OEM/site limits RPM: 2250 rpm | VFD input/DC diagnostics required. | D3 - Dedicated electrical  protection/VFD data required | Use persistence, correlation and operating-state context. |
| ER-005 | VFD cooling fan failure | RPM, I | RPM: 1800 rpm I: 3 A | RPM: 2000 rpm I: 10 A | RPM: 2250 rpm I: 20 A | Derating/trip; VFD temperature/fan status required. | D3 - Dedicated electrical protection/VFD data required | Use persistence, correlation and operating-state context. |
| ER-006 | Control-board failure | RPM | RPM: 1800 rpm | RPM: 2000 rpm | RPM: 2250 rpm | Drive communication/status abnormal; VFD diagnostic code. | D3 - Dedicated electrical protection/VFD data required | Use persistence, correlation and operating-state context. |
| ER-007 | Complete VFD trip | RPM, I | RPM: 1800 rpm I: 3 A | RPM: 2000 rpm I: 10 A | RPM: 2250 rpm I: 20 A | RPM drops to 0; I may fall to zero; distinguish motor/sensor failure via VFD status. | D3 - Dedicated electrical protection/VFD data required | Use persistence, correlation and operating-state context. |
| ER-008 | Phase loss | PHASE, RPM | PHASE: N/A RPM: 1800 rpm | PHASE: balanced 3-phase RPM: 2000 rpm | PHASE: OEM/site limits RPM: 2250 rpm | Phase measurement required; may cause trip/torque loss. | D3 - Dedicated electrical protection/VFD data required | Use persistence, correlation and operating-state context. |
| ER-009 | Short circuit / earth fault | PHASE | PHASE: N/A | PHASE: balanced 3-phase | PHASE: OEM/site limits | Protection relay/drive fault data required. | D3 - Dedicated electrical protection/VFD data required | Use persistence, correlation and operating-state context. |
| ER-010 | Insulation breakdown | PHASE | PHASE: N/A | PHASE: balanced 3-phase | PHASE: OEM/site limits | Insulation/earth leakage measurement required. | D3 - Dedicated electrical protection/VFD data required | Use persistence, correlation and operating-state context. |
| ER-011 | Contactor welded closed | PHASE | PHASE: N/A | PHASE: balanced 3-phase | PHASE: OEM/site limits | Command/status discrepancy; electrical feedback required. | D3 - Dedicated electrical protection/VFD data required | Use persistence, correlation and operating-state context. |
| ER-012 | Breaker/protection device failure | PHASE | PHASE: N/A | PHASE: balanced 3-phase | PHASE: OEM/site limits | Protection-system diagnostic; outside current scalar sensor set. | D3 - Dedicated electrical protection/VFD data required | Use persistence, correlation and operating-state context. |

## 15. Instrumentation & Sensors
Sensor integrity faults must be diagnosed separately from machine faults. Missing data is never interpreted as a physical zero.
Catalogue entries in this section: 45   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 15.1  FREQUENT
| 12 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| IF-001 | Pressure sensor drift | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Example 4.00->4.05->4.12->4.20->4.35->4.50 MPa without correlated I/MT changes. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| IF-002 | Pressure sensor noise | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Values may jump e.g. 3.4->4.6->3.5->4.7 MPa; sigma >=0.40 MPa without process corroboration. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| IF-003 | Pressure sensor frozen | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Repeated exact 4.000 MPa while related I/MT/P process context changes. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| IF-004 | Pressure sensor dropout | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | NULL/MISSING/invalid; do not treat as 0 MPa. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| IF-005 | Pressure telemetry stale | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Valid-looking value but timestamp older than allowed freshness window. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| IF-006 | Temperature sensor drift | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Example Z1 180->182->185->188->192 while related process remains stable. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| IF-007 | Temperature sensor frozen | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Exact unchanged value such as 180.0 C while machine variables move. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| IF-008 | Temperature sensor noise | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Variance incompatible with thermal process; sigma >=3 C is suspicious/unstable. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| IF-009 | Vibration sensor dropout/noise | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Missing or highly noisy RMS/waveform; signal quality flag required. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| IF-010 | RPM sensor missed/intermittent pulses | RPM | RPM: 1800 rpm | RPM: 2000 rpm | RPM: 2250 rpm | Unexpected drops below 1900 or intermittent invalids not corroborated by load/process. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| IF-011 | Hopper level noise/frozen | L | L: 5% | L: 75% | L: 95% | Level jumps/freeze incompatible with material consumption/refill. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| IF-012 | Power/current telemetry dropout | I | I: 3 A | I: 10 A | I: 20 A | NULL/stale current; do not interpret as zero-load. | D1 - Detectable now | Use persistence, correlation and operating-state context. |

## 15.2  SOMETIMES
| 21 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| IS-001 | Pressure zero/offset error | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Example true 4.0 MPa displayed 4.5 MPa: +0.5 MPa offset. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-002 | Pressure scaling/gain error | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Example true 4.0 MPa displayed 4.8 MPa: gain 1.20. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-003 | Plugged pressure port | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Slow/frozen/biased pressure response while I/MT vary. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-004 | Polymer build-up at  pressure tip | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Delayed/biased response;  maintenance/inspection needed. | D1/D2 - Integrity  logic plus correlation | Use persistence, correlation and operating-state  context. |
| IS-005 | Pressure transmitter saturation | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Repeated exact high/low endpoint such as 6.000 MPa despite process variation. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-006 | RTD calibration offset | Z1, Z2, Z3, TMOT, TGB | Z1: 150 C Z2: 170 C Z3: 190 C TMOT: 30 C TGB: 30 C | Z1: 180 C Z2: 210 C Z3: 220 C TMOT: 40 C TGB: 40 C | Z1: 210 C Z2: 230 C Z3: 250 C TMOT: 90 C TGB: 90 C | Persistent fixed error; e.g. expected Z1 180 but reads 190 C. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-007 | RTD lead resistance error | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Bias especially in 2/3-wire setups; compare calibration. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-008 | Temperature sensor poor thermal contact | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Lag/attenuated response relative to neighboring zones/process. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-009 | Temperature sensor incorrect insertion depth | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Persistent spatially inconsistent bias. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-010 | Vibration sensitivity/configuration error | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Example true 1.67 mm/s displayed 3.34: gain 2.0. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-011 | Vibration sensor loose mount | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | False low/high and altered spectrum; mounting inspection. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-012 | Vibration sensor orientation error | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | RMS/order amplitudes inconsistent with expected axis; physical verification. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-013 | IEPE supply/cable issue | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Noise/dropout/saturation; signal quality/IEPE bias monitoring. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-014 | RPM double triggering | RPM | RPM: 1800 rpm | RPM: 2000 rpm | RPM: 2250 rpm | Actual 2000 may report ~4000 rpm; immediately outside drive plausibility. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-015 | RPM wrong pulses/rev scaling | RPM | RPM: 1800 rpm | RPM: 2000 rpm | RPM: 2250 rpm | Constant ratio error; e.g. 2000 actual ->1000 or 4000 indicated. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-016 | Proximity gap/target contamination | RPM | RPM: 1800 rpm | RPM: 2000 rpm | RPM: 2250 rpm | Missed/noisy pulses; RPM instability without process corroboration. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-017 | Radar level false echo/coating | L | L: 5% | L: 75% | L: 95% | Biased/frozen/noisy L despite known consumption/refill. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-018 | Radar level calibration error | L | L: 5% | L: 75% | L: 95% | Wrong empty/full scaling; persistent ratio error. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-019 | Current meter offset error | I | I: 3 A | I: 10 A | I: 20 A | Example true 10 A displayed 11 A: +1 A. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-020 | Current meter scaling/CT ratio error | I | I: 3 A | I: 10 A | I: 20 A | Example true 10 A displayed 12 A: gain 1.2. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |
| IS-021 | Power meter register mapping error | I | I: 3 A | I: 10 A | I: 20 A | Wrong value/register appears plausible but inconsistent with process. | D1/D2 - Integrity logic plus correlation | Use persistence, correlation and operating-state context. |

## 15.3  RARE
| 12 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| IR-001 | Pressure diaphragm damage | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Offset/scaling/unresponsive pressure; bench calibration/inspection. | D2/D3 - Hardware diagnosis required | Use persistence, correlation and operating-state context. |
| IR-002 | Pressure transducer overpressure damage | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Permanent bias/nonlinearity after event; calibration failure. | D2/D3 - Hardware diagnosis required | Use persistence, correlation and operating-state context. |
| IR-003 | RTD open circuit | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Device-specific extreme/invalid code; use electrical plausibility, not universal C value. | D2/D3 - Hardware diagnosis required | Use persistence, correlation and operating-state context. |
| IR-004 | RTD short circuit | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Device-specific extreme/invalid code. | D2/D3 - Hardware diagnosis required | Use persistence, correlation and operating-state context. |
| IR-005 | Thermocouple junction failure | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Open/invalid/extreme; device-specific. | D2/D3 - Hardware diagnosis required | Use persistence, correlation and operating-state context. |
| IR-006 | Accelerometer complete failure | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | No valid dynamic signal / flatline independent of operating state. | D2/D3 - Hardware diagnosis required | Use persistence, correlation and operating-state context. |
| IR-007 | Vibration connector open circuit | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | IEPE bias/signal invalid; cable check. | D2/D3 - Hardware diagnosis required | Use persistence, correlation and operating-state context. |
| IR-008 | RPM sensor complete failure | RPM | RPM: 1800 rpm | RPM: 2000 rpm | RPM: 2250 rpm | NULL/invalid or 0 despite corroborated running; distinguish true stop. | D2/D3 - Hardware diagnosis required | Use persistence, correlation and operating-state context. |
| IR-009 | RPM target marker loss | RPM | RPM: 1800 rpm | RPM: 2000 rpm | RPM: 2250 rpm | Missing pulses; inspection. | D2/D3 - Hardware diagnosis required | Use persistence, correlation and operating-state context. |
| IR-010 | Radar electronics failure | L | L: 5% | L: 75% | L: 95% | No valid echo/measurement; diagnostics status. | D2/D3 - Hardware diagnosis required | Use persistence, correlation and operating-state context. |
| IR-011 | Power meter complete failure | I | I: 3 A | I: 10 A | I: 20 A | No communication/measurement; separate comms vs meter failure. | D2/D3 - Hardware diagnosis required | Use persistence, correlation and operating-state context. |
| IR-012 | CT open-circuit / wiring failure | I | I: 3 A | I: 10 A | I: 20 A | Current reading invalid/zero despite running; electrical inspection. | D2/D3 - Hardware diagnosis required | Use persistence, correlation and operating-state context. |

## 16. Data, Telemetry & Communication
Digital integrity conditions. These are not physical machine faults but must block or reduce diagnostic confidence.
Catalogue entries in this section: 19   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 16.1  FREQUENT
| 3 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| DTF-001 | Missing samples | Data / metadata | N/A | N/A | N/A | Expected sample absent; quality=MISSING. Never substitute 0. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| DTF-002 | Stale telemetry | Data / metadata | N/A | N/A | N/A | Timestamp age exceeds configured freshness window; freeze physical diagnosis. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| DTF-003 | Temporary communication dropout | Data / metadata | N/A | N/A | N/A | Short sequence of missing samples followed by recovery. | D1 - Detectable now | Use persistence, correlation and operating-state context. |

## 16.2  SOMETIMES
| 11 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| DTS-001 | Packet/sample loss | Data / metadata | N/A | N/A | N/A | Loss rate above configured tolerance; persistence drives severity. | D1 - Detectable in data-quality layer | Use persistence, correlation and operating-state context. |
| DTS-002 | Excessive telemetry delay | Data / metadata | N/A | N/A | N/A | Arrival latency above allowed acquisition/diagnostic window. | D1 - Detectable in data-quality layer | Use persistence, correlation and operating-state context. |
| DTS-003 | Duplicate samples | Data / metadata | N/A | N/A | N/A | Identical sequence/timestamp duplicated; remove before temporal analytics. | D1 - Detectable in data-quality layer | Use persistence, correlation and operating-state context. |
| DTS-004 | Timestamp error / non-monotonic time | Data / metadata | N/A | N/A | N/A | Timestamp <= previous timestamp or implausible jump. | D1 - Detectable in data-quality layer | Use persistence, correlation and operating-state context. |
| DTS-005 | Clock drift | Data / metadata | N/A | N/A | N/A | Controller/gateway time offset progressively grows. | D1 - Detectable in data-quality layer | Use persistence, correlation and operating-state context. |
| DTS-006 | Sample interval mismatch | Data / metadata | N/A | N/A | N/A | Observed dt differs materially from configured rate. | D1 - Detectable in data-quality layer | Use persistence, correlation and operating-state context. |
| DTS-007 | Telemetry jitter | Data / metadata | N/A | N/A | N/A | Variable arrival interval that can corrupt temporal features. | D1 - Detectable in data-quality layer | Use persistence, correlation and operating-state context. |
| DTS-008 | Out-of-order packet | Data / metadata | N/A | N/A | N/A | Sequence/timestamp order reversed. | D1 - Detectable in data-quality layer | Use persistence, correlation and operating-state context. |
| DTS-009 | Buffer overflow / dropped block | Data / metadata | N/A | N/A | N/A | Gap or sequence discontinuity under load. | D1 - Detectable in data-quality layer | Use persistence, correlation and operating-state context. |
| DTS-010 | Missing channel in payload | Data / metadata | N/A | N/A | N/A | Expected tag absent while packet otherwise valid. | D1 - Detectable in data-quality layer | Use persistence, correlation and operating-state context. |
| DTS-011 | MQTT/gateway intermittent disconnect | Data / metadata | N/A | N/A | N/A | Connection/session loss with recovery; gateway/broker evidence. | D1 - Detectable in data-quality layer | Use persistence, correlation and operating-state context. |

## 16.3  RARE
| 5 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| DTR-001 | Complete gateway loss | Data / metadata | N/A | N/A | N/A | No telemetry from rack/gateway; distinguish power/network/controller. | D1/D3 - Platform diagnostics/audit | Use persistence, correlation and operating-state context. |
| DTR-002 | Corrupted payload | Data / metadata | N/A | N/A | N/A | Schema/CRC/parse failure or impossible values. | D1/D3 - Platform diagnostics/audit | Use persistence, correlation and operating-state context. |
| DTR-003 | Invalid unit metadata | Data / metadata | N/A | N/A | N/A | Engineering unit inconsistent with tag definition. | D1/D3 - Platform diagnostics/audit | Use persistence, correlation and operating-state context. |
| DTR-004 | Controller reset loop | Data / metadata | N/A | N/A | N/A | Repeated session/epoch resets and gaps. | D1/D3 - Platform diagnostics/audit | Use persistence, correlation and operating-state context. |
| DTR-005 | Database ingestion corruption | Data / metadata | N/A | N/A | N/A | Stored values differ from validated ingest stream; audit required. | D1/D3 - Platform diagnostics/audit | Use persistence, correlation and operating-state context. |

## 17. Configuration & Software
Configuration faults change the meaning of otherwise valid sensor values. Versioning and tag mapping are therefore part of diagnosis.
Catalogue entries in this section: 19   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 17.1  FREQUENT
| 2 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| CFG-F01 | Stale configuration | Data / metadata | N/A | N/A | N/A | Runtime configuration version older than approved machine definition. | D1 - Detectable now | Use persistence, correlation and operating-state context. |
| CFG-F02 | Recipe/setpoint mismatch | Z1, Z2, Z3, MT, P, RPM | Z1: 150 C Z2: 170 C Z3: 190 C MT: 180 C P: 1.0 MPa RPM: 1800 rpm | Z1: 180 C Z2: 210 C Z3: 220 C MT: 210 C P: 4.0 MPa RPM: 2000 rpm | Z1: 210 C Z2: 230 C Z3: 250 C MT: 240 C P: 6.0 MPa RPM: 2250 rpm | Measured values may be healthy for one recipe but abnormal for loaded recipe; compare active recipe. | D1 - Detectable now | Use persistence, correlation and operating-state context. |

## 17.2  SOMETIMES
| 10 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| CFG-S01 | Wrong engineering scaling | Data / metadata | N/A | N/A | N/A | Known calibration point maps to wrong engineering value. | D1 - Configuration audit/version rules | Use persistence, correlation and operating-state context. |
| CFG-S02 | Wrong engineering  unit | Data / metadata | N/A | N/A | N/A | e.g., pressure unit mismatch MPa/bar or  vibration unit mismatch. | D1 - Configuration  audit/version rules | Use persistence, correlation and operating-state  context. |
| CFG-S03 | Incorrect normal limits | Data / metadata | N/A | N/A | N/A | Configured normal band differs from approved master limits. | D1 - Configuration audit/version rules | Use persistence, correlation and operating-state context. |
| CFG-S04 | Incorrect warning/alarm thresholds | Data / metadata | N/A | N/A | N/A | Threshold table/version mismatch. | D1 - Configuration audit/version rules | Use persistence, correlation and operating-state context. |
| CFG-S05 | Configuration-version mismatch | Data / metadata | N/A | N/A | N/A | Controller/gateway/UI use different config hashes/versions. | D1 - Configuration audit/version rules | Use persistence, correlation and operating-state context. |
| CFG-S06 | Incorrect sample rate | Data / metadata | N/A | N/A | N/A | Configured sample rate differs from processing assumptions. | D1 - Configuration audit/version rules | Use persistence, correlation and operating-state context. |
| CFG-S07 | Incorrect tag assignment | Data / metadata | N/A | N/A | N/A | Sensor data attached to wrong tag/machine part. | D1 - Configuration audit/version rules | Use persistence, correlation and operating-state context. |
| CFG-S08 | Incorrect sensor type | Data / metadata | N/A | N/A | N/A | e.g., RTD/4-20 mA or sensitivity selection wrong. | D1 - Configuration audit/version rules | Use persistence, correlation and operating-state context. |
| CFG-S09 | Incorrect calibration offset | Data / metadata | N/A | N/A | N/A | Stored offset produces systematic bias. | D1 - Configuration audit/version rules | Use persistence, correlation and operating-state context. |
| CFG-S10 | Wrong pulses-per-revolution | RPM | RPM: 1800 rpm | RPM: 2000 rpm | RPM: 2250 rpm | RPM is constant multiple/fraction of true speed. | D1 - Configuration audit/version rules | Use persistence, correlation and operating-state context. |

## 17.3  RARE
| 7 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| CFG-R01 | Motor sensor mapped to gearbox | Data / metadata | N/A | N/A | N/A | VM/VG correlation/location becomes physically inconsistent; mapping audit. | D1 - Configuration integrity | Use persistence, correlation and operating-state context. |
| CFG-R02 | Z1/Z2/Z3 channels swapped | Z1, Z2, Z3 | Z1: 150 C Z2: 170 C Z3: 190 C | Z1: 180 C Z2: 210 C Z3: 220 C | Z1: 210 C Z2: 230 C Z3: 250 C | Profile appears impossible relative to expected 180/210/220; configuration audit. | D1 - Configuration integrity | Use persistence, correlation and operating-state context. |
| CFG-R03 | Pressure/current tags swapped | Data / metadata | N/A | N/A | N/A | Unit/range plausibility failure. | D1 - Configuration integrity | Use persistence, correlation and operating-state context. |
| CFG-R04 | Wrong machine profile loaded | Data / metadata | N/A | N/A | N/A | All nominal/range comparisons systematically wrong. | D1 - Configuration integrity | Use persistence, correlation and operating-state context. |
| CFG-R05 | Corrupted configuration | Data / metadata | N/A | N/A | N/A | Hash/schema validation failure. | D1 - Configuration integrity | Use persistence, correlation and operating-state context. |
| CFG-R06 | Firmware/config incompatibility | Data / metadata | N/A | N/A | N/A | Version compatibility rule failure. | D1 - Configuration integrity | Use persistence, correlation and operating-state context. |
| CFG-R07 | Diagnostic-rule version mismatch | Data / metadata | N/A | N/A | N/A | Different nodes produce inconsistent conclusions from same inputs. | D1 - Configuration integrity | Use persistence, correlation and operating-state context. |

## 18. Extrudate / Product Quality
These are product symptoms or outcomes. Present ULTRON can often identify process precursors, but direct product-quality confirmation needs camera, thickness, dimensional or laboratory measurements.
Catalogue entries in this section: 17   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 18.1  FREQUENT
| 6 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| QF-001 | Surface roughness | MT, P, QUALITY | MT: 180 C P: 1.0 MPa QUALITY: N/A | MT: 210 C P: 4.0 MPa QUALITY: product specification | MT: 240 C P: 6.0 MPa QUALITY: product specification | Often low MT / high shear; typical precursor MT<=190-200 and P>=5.4. | D3 - Process precursor only without quality sensing | Use persistence, correlation and operating-state context. |
| QF-002 | Melt fracture / sharkskin | MT, P, QUALITY | MT: 180 C P: 1.0 MPa QUALITY: N/A | MT: 210 C P: 4.0 MPa QUALITY: product specification | MT: 240 C P: 6.0 MPa QUALITY: product specification | Low MT + high P/shear; e.g. MT<=190, P>=5.4. | D3 - Process precursor only without quality sensing | Use persistence, correlation and operating-state context. |
| QF-003 | Output fluctuation | P, I, QUALITY | P: 1.0 MPa I: 3 A QUALITY: N/A | P: 4.0 MPa I: 10 A QUALITY: product specification | P: 6.0 MPa I: 20 A QUALITY: product specification | P P-P>=0.5 MPa and current oscillation. | D3 - Process precursor only without quality sensing | Use persistence, correlation and operating-state context. |
| QF-004 | Poor dimensional stability | P, MT, QUALITY | P: 1.0 MPa MT: 180 C QUALITY: N/A | P: 4.0 MPa MT: 210 C QUALITY: product specification | P: 6.0 MPa MT: 240 C QUALITY: product specification | Flow/thermal instability; direct gauge needed. | D3 - Process precursor only without quality sensing | Use persistence, correlation and operating-state context. |
| QF-005 | Unmelted particles | MT, QUALITY | MT: 180 C QUALITY: N/A | MT: 210 C QUALITY: product specification | MT: 240 C QUALITY: product specification | MT<=190 or insufficient melting/residence; camera/inspection. | D3 - Process precursor only without quality sensing | Use persistence, correlation and operating-state context. |
| QF-006 | Black specks / contamination | MT, QUALITY | MT: 180 C QUALITY: N/A | MT: 210 C QUALITY: product specification | MT: 240 C QUALITY: product specification | High residence/temp or contamination; quality inspection. | D3 - Process precursor only without quality sensing | Use persistence, correlation and operating-state context. |

## 18.2  SOMETIMES
| 8 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| QS-001 | Gels | MT, QUALITY | MT: 180 C QUALITY: N/A | MT: 210 C QUALITY: product specification | MT: 240 C QUALITY: product specification | Thermal/material condition; camera/inspection. | D3 - Additional quality sensing required | Use persistence, correlation and operating-state context. |
| QS-002 | Bubbles / voids | MOIST, QUALITY | MOIST: N/A QUALITY: N/A | MOIST: supplier/grade target QUALITY: product specification | MOIST: N/A QUALITY: product specification | Moisture/gas family; moisture/vision required. | D3 - Additional quality sensing required | Use persistence, correlation and operating-state context. |
| QS-003 | Moisture streaks | MOIST, QUALITY | MOIST: N/A QUALITY: N/A | MOIST: supplier/grade target QUALITY: product specification | MOIST: N/A QUALITY: product specification | Moisture measurement required. | D3 - Additional quality sensing required | Use persistence, correlation and operating-state context. |
| QS-004 | Discoloration | MT, QUALITY | MT: 180 C QUALITY: N/A | MT: 210 C QUALITY: product specification | MT: 240 C QUALITY: product specification | High temperature/residence/oxidation precursor. | D3 - Additional quality sensing required | Use persistence, correlation and operating-state context. |
| QS-005 | Non-uniform mixing | MT, P, QUALITY | MT: 180 C P: 1.0 MPa QUALITY: N/A | MT: 210 C P: 4.0 MPa QUALITY: product specification | MT: 240 C P: 6.0 MPa QUALITY: product specification | Process variability; direct quality evidence. | D3 - Additional quality sensing required | Use persistence, correlation and operating-state context. |
| QS-006 | Poor dispersion | QUALITY | QUALITY: N/A | QUALITY: product specification | QUALITY: product specification | Camera/lab measurement required. | D3 - Additional quality sensing required | Use persistence, correlation and operating-state context. |
| QS-007 | Dimensional drift | P, MT, QUALITY | P: 1.0 MPa MT: 180 C QUALITY: N/A | P: 4.0 MPa MT: 210 C QUALITY: product specification | P: 6.0 MPa MT: 240 C QUALITY: product specification | Slow process drift; gauge required. | D3 - Additional quality sensing required | Use persistence, correlation and operating-state context. |
| QS-008 | Surface/die lines | P, QUALITY | P: 1.0 MPa QUALITY: N/A | P: 4.0 MPa QUALITY: product specification | P: 6.0 MPa QUALITY: product specification | Die-lip build-up/damage family. | D3 - Additional quality sensing required | Use persistence, correlation and operating-state context. |

## 18.3  RARE
| 3 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| QR-001 | Severely burnt polymer | MT, QUALITY | MT: 180 C QUALITY: N/A | MT: 210 C QUALITY: product specification | MT: 240 C QUALITY: product specification | MT near/above 240 C or excessive residence; direct quality evidence. | D3 - Quality/inspection | Use persistence, correlation and operating-state context. |
| QR-002 | Metallic contamination | QUALITY | QUALITY: N/A | QUALITY: product specification | QUALITY: product specification | Metal detector/inspection required. | D3 - Quality/inspection | Use persistence, correlation and operating-state context. |
| QR-003 | Catastrophic product contamination | QUALITY | QUALITY: N/A | QUALITY: product specification | QUALITY: product specification | Inspection/material traceability; may follow screen rupture. | D3 - Quality/inspection | Use persistence, correlation and operating-state context. |

## 19. Machine Frame, Foundation & Supports
Structural conditions can amplify motor/gearbox vibration and create alignment problems. Current diagnosis is mostly vibration-family plus inspection.
Catalogue entries in this section: 10   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 19.1  FREQUENT
| 1 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| STF-001 | Small fastener looseness | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | VM/VG trend above baseline; harmonic-rich response. | D2 - Structural family | Use persistence, correlation and operating-state context. |

## 19.2  SOMETIMES
| 6 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| STS-001 | Machine-base looseness | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Both VM/VG elevated, often >=2-2.5. | D2 - Inspection/phase analysis | Use persistence, correlation and operating-state context. |
| STS-002 | Foundation bolt looseness | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Structural 1x/harmonic amplification. | D2 - Inspection/phase analysis | Use persistence, correlation and operating-state context. |
| STS-003 | Structural resonance | VM, VG, RPM | VM: 0.20 mm/s VG: 0.20 mm/s RPM: 1800 rpm | VM: 1.67 mm/s VG: 1.67 mm/s RPM: 2000 rpm | VM: 3.00 mm/s VG: 3.00 mm/s RPM: 2250 rpm | Sharp amplitude increase at specific RPM band. | D2 - Inspection/phase analysis | Use persistence, correlation and operating-state context. |
| STS-004 | Barrel-support misalignment | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Vibration/load increases; alignment survey. | D2 - Inspection/phase analysis | Use persistence, correlation and operating-state context. |
| STS-005 | Motor-base soft foot | VM | VM: 0.20 mm/s | VM: 1.67 mm/s | VM: 3.00 mm/s | 1x/2x vibration; phase/foot test required. | D2 - Inspection/phase analysis | Use persistence, correlation and operating-state context. |
| STS-006 | Support-frame distortion | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Alignment/vibration abnormalities. | D2 - Inspection/phase analysis | Use persistence, correlation and operating-state context. |

## 19.3  RARE
| 3 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| STR-001 | Cracked frame | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Structural vibration change; visual/NDT confirmation. | D3 - Inspection/NDT | Use persistence, correlation and operating-state context. |
| STR-002 | Foundation damage | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Broad structural vibration/alignment change. | D3 - Inspection/NDT | Use persistence, correlation and operating-state context. |
| STR-003 | Severe structural deformation | VM, VG | VM: 0.20 mm/s VG: 0.20 mm/s | VM: 1.67 mm/s VG: 1.67 mm/s | VM: 3.00 mm/s VG: 3.00 mm/s | Large persistent alignment/vibration abnormalities. | D3 - Inspection/NDT | Use persistence, correlation and operating-state context. |

## 20. Seals, Flanges & Leakage
Leakage faults often have weak unique signatures in current sensors; pressure trends plus visual/leak/oil sensors are recommended.
Catalogue entries in this section: 9   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 20.1  FREQUENT
| 1 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| LKF-001 | Minor polymer seepage / build-up | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Small pressure/process shift; visual inspection. | D3 - Inspection | Use persistence, correlation and operating-state context. |

## 20.2  SOMETIMES
| 5 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| LKS-001 | Flange leakage | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Unexpected P decrease; leak visualization required. | D3 - Leak/oil sensing required | Use persistence, correlation and operating-state context. |
| LKS-002 | Seal degradation | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Gradual leak/pressure loss; inspection. | D3 - Leak/oil sensing required | Use persistence, correlation and operating-state context. |
| LKS-003 | Gearbox seal leakage | TGB, OIL | TGB: 30 C OIL: N/A | TGB: 40 C OIL: OEM oil condition | TGB: 90 C OIL: OEM/site limits | Oil level loss may later raise TGB/VG. | D3 - Leak/oil sensing required | Use persistence, correlation and operating-state context. |
| LKS-004 | Melt leak | P, MT | P: 1.0 MPa MT: 180 C | P: 4.0 MPa MT: 210 C | P: 6.0 MPa MT: 240 C | P decrease plus local thermal/visual evidence. | D3 - Leak/oil sensing required | Use persistence, correlation and operating-state context. |
| LKS-005 | Oil leak | TGB, VG, OIL | TGB: 30 C VG: 0.20 mm/s OIL: N/A | TGB: 40 C VG: 1.67 mm/s OIL: OEM oil condition | TGB: 90 C VG: 3.00 mm/s OIL: OEM/site limits | Secondary TGB/VG increase; oil-level/leak sensor needed. | D3 - Leak/oil sensing required | Use persistence, correlation and operating-state context. |

## 20.3  RARE
| 3 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| LKR-001 | Major melt leak | P, MT | P: 1.0 MPa MT: 180 C | P: 4.0 MPa MT: 210 C | P: 6.0 MPa MT: 240 C | Abrupt P drop and local hot material; safety/visual detection. | D3 - Safety/inspection | Use persistence, correlation and operating-state context. |
| LKR-002 | Complete seal rupture | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Rapid pressure loss/leak. | D3 - Safety/inspection | Use persistence, correlation and operating-state context. |
| LKR-003 | High-pressure flange failure | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Abrupt severe pressure/leak event; machine safety system required. | D3 - Safety/inspection | Use persistence, correlation and operating-state context. |

## 21. Startup, Shutdown & Operating-State Abnormalities
State-aware diagnosis prevents normal transitions from being misclassified as faults.
Catalogue entries in this section: 13   |   Green = Frequent   Amber = Sometimes   Red = Rare
## 21.1  FREQUENT
| 4 entries | Priority conditions for routine simulation and Diagnosis. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| OPF-001 | Cold-start temperature below setpoint | Z1, Z2, Z3, MT | Z1: 150 C Z2: 170 C Z3: 190 C MT: 180 C | Z1: 180 C Z2: 210 C Z3: 220 C MT: 210 C | Z1: 210 C Z2: 230 C Z3: 250 C MT: 240 C | During startup values may legitimately be below normal; suppress fault until heat-soak/run-state conditions met. | D1 - State-aware logic | Use persistence, correlation and operating-state context. |
| OPF-002 | Startup pressure transient | P | P: 1.0 MPa | P: 4.0 MPa | P: 6.0 MPa | Temporary P excursion during start; persistence required before restriction diagnosis. | D1 - State-aware logic | Use persistence, correlation and operating-state context. |
| OPF-003 | Startup current transient | I | I: 3 A | I: 10 A | I: 20 A | Temporary current >12.5-15 A may be acceptable by drive profile; duration/context required. | D1 - State-aware logic | Use persistence, correlation and operating-state context. |
| OPF-004 | Normal shutdown pressure/current decrease | P, I, RPM | P: 1.0 MPa I: 3 A RPM: 1800 rpm | P: 4.0 MPa I: 10 A RPM: 2000 rpm | P: 6.0 MPa I: 20 A RPM: 2250 rpm | P/I/RPM fall together; classify as state, not starvation. | D1 - State-aware logic | Use persistence, correlation and operating-state context. |

## 21.2  SOMETIMES
| 6 entries | Recurring conditions requiring stronger correlation, signal analysis or maintenance context. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| OPS-001 | Attempted screw rotation before heat soak | Z1, Z2, Z3, MT, I, RPM | Z1: 150 C Z2: 170 C Z3: 190 C MT: 180 C I: 3 A RPM: 1800  rpm | Z1: 180 C Z2: 210 C Z3: 220 C MT: 210 C I: 10 A RPM: 2000  rpm | Z1: 210 C Z2: 230 C Z3: 250 C MT: 240 C I: 20 A RPM: 2250 rpm | Low thermal state plus I high and RPM low; cold/high-load start risk. | D2 - State/history + process evidence | Use persistence, correlation and operating-state context. |
| OPS-002 | Incomplete heat soak | Z1, Z2, Z3, MT | Z1: 150 C Z2: 170 C Z3: 190 C MT: 180 C | Z1: 180 C Z2: 210 C Z3: 220 C MT: 210 C | Z1: 210 C Z2: 230 C Z3: 250 C MT: 240 C | Zones near setpoint but insufficient temporal stability; soak timer/history needed. | D2 - State/history + process evidence | Use persistence, correlation and operating-state context. |
| OPS-003 | Excessively rapid startup | I, P, RPM | I: 3 A P: 1.0 MPa RPM: 1800 rpm | I: 10 A P: 4.0 MPa RPM: 2000 rpm | I: 20 A P: 6.0 MPa RPM: 2250 rpm | Large current/pressure transients or speed overshoot. | D2 - State/history + process evidence | Use persistence, correlation and operating-state context. |
| OPS-004 | Shutdown material left in barrel | MT, P | MT: 180 C P: 1.0 MPa | MT: 210 C P: 4.0 MPa | MT: 240 C P: 6.0 MPa | Restart may show high load/pressure; purge/maintenance history needed. | D2 - State/history + process evidence | Use persistence, correlation and operating-state context. |
| OPS-005 | Poor purge / material carryover | P, MT, QUALITY | P: 1.0 MPa MT: 180 C QUALITY: N/A | P: 4.0 MPa MT: 210 C QUALITY: product specification | P: 6.0 MPa MT: 240 C QUALITY: product specification | Contamination/pressure instability at restart. | D2 - State/history + process evidence | Use persistence, correlation and operating-state context. |
| OPS-006 | Improper restart sequence | Z1, Z2, Z3, I, RPM | Z1: 150 C Z2: 170 C Z3: 190 C I: 3 A RPM: 1800 rpm | Z1: 180 C Z2: 210 C Z3: 220 C I: 10 A RPM: 2000 rpm | Z1: 210 C Z2: 230 C Z3: 250 C I: 20 A RPM: 2250 rpm | State-machine/order violation. | D2 - State/history + process evidence | Use persistence, correlation and operating-state context. |

## 21.3  RARE
| 3 entries | Low-frequency / severe / specialized conditions retained for completeness and future capability. |
| Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference | Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |
| OPR-001 | Cold-start screw lock | Z1, Z2, Z3, MT, I, RPM | Z1: 150 C Z2: 170 C Z3: 190 C MT: 180 C I: 3 A RPM: 1800 rpm | Z1: 180 C Z2: 210 C Z3: 220 C MT: 210 C I: 10 A RPM: 2000 rpm | Z1: 210 C Z2: 230 C Z3: 250 C MT: 240 C I: 20 A RPM: 2250 rpm | Thermal state low; RPM near 0-200, I>=15-20 A. | D2 - Critical state/process family | Use persistence, correlation and operating-state context. |
| OPR-002 | Severe startup over-torque/stall | I, RPM, P | I: 3 A RPM: 1800 rpm P: 1.0 MPa | I: 10 A RPM: 2000 rpm P: 4.0 MPa | I: 20 A RPM: 2250 rpm P: 6.0 MPa | I>=20 A, RPM<=200-1800 depending event, pressure may rise. | D2 - Critical state/process family | Use persistence, correlation and operating-state context. |
| OPR-003 | Solidified polymer causing screw stall | MT, I, RPM, P | MT: 180 C I: 3 A RPM: 1800 rpm P: 1.0 MPa | MT: 210 C I: 10 A RPM: 2000 rpm P: 4.0 MPa | MT: 240 C I: 20 A RPM: 2250 rpm P: 6.0 MPa | MT low, I>=20, RPM collapses; pressure may be high. | D2 - Critical state/process family | Use persistence, correlation and operating-state context. |

## Appendix A - Canonical Multi-Sensor Fault Vectors
| Condition | Canonical engineering vector |
| Healthy reference | RPM 2000 | SRPM 100 | VM 1.67 | VG 1.67 | Z1 180 | Z2 210 | Z3 220 | MT 210 | TMOT 40 | TGB 40 | P 4.0 | L 75 | I 10 |
| Feed starvation | RPM ~2000 | L <=25% | P <=2.0 MPa | I <=6 A. Severe: L<=10%, P<=1, I<=3. |
| Feed-throat bridging | RPM ~2000 | L 40-90% | P <=2.0-2.5 MPa | I <=6-7 A. |
| Overfeed / high load | RPM ~2000 | P >=5.4 MPa | I >=15 A; severe P~6, I~20. |
| Motor overload | RPM 1850-1950 | I 15-20 A | TMOT 75-90 C | VM 2-3 mm/s | P often >4.8. |
| Motor bearing degradation | RPM 2000 | VM >=2.5 | TMOT 50-80 C | crest >=4 | kurtosis >=3.5; envelope impulsive. |
| Gearbox bearing degradation | VG >=2.5 | TGB 55-80 C | envelope/impulsive features; severe VG>=3/TGB>=90. |
| Screen/die restriction family | P 5.4-6 MPa | I 15-20 A | RPM stable or slightly falling | L healthy. |
| High viscosity | MT 185-200 C | P 4.8-5.6 | I 12.5-17 | L healthy | RPM stable. |
| Low viscosity / wear ambiguity | MT 220-235 C OR mechanical wear | P 2.5-3.2 | I 6-8 | L healthy | RPM stable. |
| Screw/barrel wear | SRPM~100 | L healthy | P progressively 4.0->3.6->3.2-><3.0 | I 10->9->8->~7. |
| Thermal runaway | Any zone above warning-high + rise >=8 C/min; critical at Z1>=210, Z2>=230, Z3>=250. |
| Motor cooling degradation | TMOT>=80 C | I 8-12 A | VM<=2 mm/s. |
| Gearbox lubrication degradation | TGB 65-80 C | VG 2.2-2.5 developing; severe TGB>=90 + VG>=3. |
| Sensor frozen | Exact repeated value while correlated variables and operating state continue to change. |
| Sensor scaling error | Persistent multiplicative mismatch; e.g. true P=4.0 -> reported 4.8 MPa (gain 1.20). |
| Motor stall | RPM<=200 rpm | I>=15-20 A; distinguish sensor failure using I/process/VFD evidence. |
| Screw seizure | RPM<=1800 and falling | I>=20 A | P may approach >=6 MPa. |

## Appendix B - Relationship to the Historical 61 Scenarios
The historical 61-scenario validation set is evidence for the diagnostic chain, not a list of 61 unique physical faults. It includes healthy states, transitions, instrumentation/data-quality tests, combined conditions, progressive severities and recovery cases. This master catalogue therefore preserves those scenarios as validation references while expanding the physical/process fault universe.
| Historical scenario | Meaning | Master catalogue location |
| SCN-M-001 | Motor bearing degradation | Motor / Sometimes |
| SCN-M-002 | Gearbox bearing degradation | Gearbox / Sometimes |
| SCN-M-003 | Gear / gear-mesh degradation | Gearbox / Sometimes |
| SCN-M-004 | Imbalance | Motor / Sometimes |
| SCN-M-005 | Misalignment | Motor/Coupling / Sometimes |
| SCN-M-006 | Looseness | Motor/Coupling / Sometimes |
| SCN-M-007 | Screw/barrel wear vs viscosity ambiguity | Screw/Material / Sometimes |
| SCN-P-001 | Feed starvation | Feed / Frequent |
| SCN-P-002 | Overfeed / restriction ambiguity | Feed/Process / Frequent |
| SCN-P-003 | Material viscosity/property | Material / Frequent |
| SCN-TH-001 | Heater failure | Thermal / Sometimes |
| SCN-TH-002 | Heater partial failure | Thermal / Sometimes |
| SCN-TH-003 | Heater stuck ON | Thermal / Sometimes |
| SCN-TH-004 | Cooling loss/degradation | Cooling / Sometimes |
| SCN-I-001..006 | Instrumentation faults | Instrumentation |
| SCN-DQ-001..004 | Data-quality faults | Data/Telemetry |
| SCN-C-001 | Viscosity + restriction ambiguity | Process/Restriction |
| SCN-C-002 | Motor bearing + overload | Combined Motor |
| SCN-R-001/002 | Screen vs die restriction | Restriction family |
| WP4_SCREEN_* | Progressive restriction severity coordinates | Restriction development cases |

## Appendix C - Recommended Fault Database Record
| Database field | Example / required content |
| Machine Part | Gearbox |
| Subcomponent | Bearing / output side |
| Occurrence | Sometimes |
| Fault ID | GS-001 |
| Fault | Gearbox bearing degradation |
| Primary Sensors | VG, TGB |
| Min / Nominal / Max | VG 0.20 / 1.67 / 3.00 mm/s; TGB 30 / 40 / 90 C |
| Fault Onset | VG >2.0 mm/s or progressive envelope growth |
| Warning / Developed | VG >=2.5 mm/s; TGB 55-80 C supporting |
| Severe | VG >=3.0 mm/s; TGB >=90 C |
| Signal Features | Envelope, crest factor, kurtosis, orders |
| Temporal Evidence | Persistent / progressive |
| Detectability | D2 unless advanced waveform evidence is available |
| Ambiguity / Alternatives | Gear mesh, looseness, lubrication |
| Additional Evidence | Bearing geometry for exact BPFO/BPFI; inspection/lubrication history |
| Related Scenario | SCN-M-002 |
| Maintenance Action | Inspect bearing, lubrication, alignment and housing; verify waveform/envelope evidence |

## Appendix D - Freeze / Commissioning Checklist
1. Confirm the controlled standard-machine baseline and active recipe before enabling automatic fault comparison.
2. Field-calibrate all temperature, pressure, vibration, RPM, level and current channels.
3. Validate the 1.67 mm/s operational vibration reference separately from synthetic diagnostic fixture values used in historical automated tests.
4. Confirm motor/VFD OEM current, speed and thermal protection limits; keep those separate from ULTRON diagnostic thresholds.
5. Confirm pressure transducer location and add downstream pressure if unique screen-vs-die localization is required.
6. Capture bearing geometry and gearbox tooth counts before enabling exact BPFO/BPFI/BSF/FTF/GMF diagnoses.
7. Add phase voltage/current if unique electrical phase/winding diagnosis is required.
8. Add moisture/material-quality sensing before claiming unique moisture, wrong-grade or product-quality root causes.
9. Use persistence, state-awareness, cross-sensor correlation and data-quality gates for every production diagnostic rule.
10. After sufficient field history, replace qualitative occurrence classes with measured occurrence rates by asset and operating regime.
## Document Summary
Total machine/process sections: 21Total catalogue records documented: 464Additional fault-propagation scenarios: 67Hierarchy: Machine Part -> Frequent -> Sometimes -> Rare -> Min/Nominal/Max -> Fault Vector -> Propagation PathPage format: A4 Landscape for readable engineering tables.
## Appendix E - Fault Propagation & Cascading Failure Analysis
Purpose: show how an initiating fault in one machine part can create secondary and tertiary abnormalities elsewhere in the single-screw extruder. This section separates the origin fault from its downstream consequences so ULTRON can explain cause, propagation and final process impact instead of reporting several unrelated alarms.
Reading order: Initiating Fault -> Local Effect -> First Affected Part -> Process Effect -> Final Consequence. Values below are engineering diagnostic values for the current ULTRON reference machine; they are not OEM safety-trip limits. “Family-level” means the current sensors can identify the fault family but may need an additional sensor for exact root-cause localization.
| Signal | Nominal | Warning / Abnormal | Severe / Diagnostic Max |
| Motor RPM | 2000 rpm | <=1900 or >=2100 rpm | <=1800 or >=2250 rpm |
| Screw RPM (derived, 20:1) | 100 rpm | <=95 or >=105 rpm | <=90 or >=112.5 rpm |
| Motor vibration VM | 1.67 mm/s RMS | >=2.50 mm/s | >=3.00 mm/s |
| Gearbox vibration VG | 1.67 mm/s RMS | >=2.50 mm/s | >=3.00 mm/s |
| Motor / Gearbox temperature | 40 C | >=80 C | >=90 C |
| Melt pressure P | 4.0 MPa | <=2.0 or >=5.4 MPa | <=1.0 or >=6.0 MPa |
| Melt temperature MT | 210 C | <=190 or >=230 C | <=180 or >=240 C |
| Hopper level L | 75% | <=25% | <=10%; near-empty <=5% |
| Motor current I | 10 A | >=15 A | >=20 A |

## E.1 Motor-Originated Cascades
Example interpretation: do not treat every downstream abnormality as an independent root cause. Preserve the first credible initiating fault and show the remaining conditions as propagated consequences.
## FREQUENT
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-MOT-F01 | Motor overload | Motor overload -> motor heating -> RPM droop -> screw-speed reduction -> pressure/output instability | I 15-20 A; TMOT 80-90 C; RPM 1900->1800 | SRPM 95->90; P deviates from 4 MPa; process output unstable | Immediate-minutes; detectable now |
| CAS-MOT-F02 | Motor speed low | RPM low -> screw speed low -> conveying low -> melt pressure/output low | RPM <=1900; severe <=1800 | SRPM <=95/90; P 4->3.2->2 MPa; I may later fall | Immediate; detectable now |
| CAS-MOT-F03 | Motor speed instability | RPM hunting -> screw-speed oscillation -> pressure/current oscillation -> die-flow variation | sigma RPM >=50 rpm; severe >=100 | P P-P >=0.5 MPa; I sigma >=1.5 A | Seconds-minutes; detectable now |
| CAS-MOT-F04 | Motor overheating | Motor temperature high -> drive derating/trip risk -> screw speed loss -> flow loss | TMOT >=80 C; severe >=90 C | RPM falls; P and output fall after derating/trip | Minutes; detectable now |
| CAS-MOT-F05 | High motor vibration | Motor vibration -> coupling excitation -> gearbox input vibration -> mounting/bearing stress | VM >=2.5; severe >=3.0 | VG rises above 2.0 toward >=2.5; possible I increase | Minutes-hours; family-level |

## SOMETIMES
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-MOT-S01 | Motor bearing degradation | Bearing wear -> vibration/friction -> coupling load -> gearbox input-bearing stress -> process instability | VM 2.0-2.5 developing; >=2.5 warning; TMOT 50-80 C | VG 1.67->2.2-2.6; I 10->12-15 A; pressure stability degrades | Hours-weeks; FFT/envelope improves confidence |
| CAS-MOT-S02 | Rotor imbalance | Imbalance -> 1x vibration -> coupling/foundation excitation -> bearing wear | VM 2.3-3.0+; 1x about 33.3 Hz at 2000 rpm | VG may rise; mounting looseness may develop | Hours-weeks; order analysis |
| CAS-MOT-S03 | Motor/coupling misalignment | Misalignment -> bearing side-load -> coupling wear -> gearbox input bearing stress | VM/VG >2.0; 1x + 2x about 33.3/66.7 Hz | TMOT/TGB trend upward; I may reach 12-15 A | Hours-weeks; phase/axial sensing improves ID |
| CAS-MOT-S04 | Mechanical looseness | Looseness -> harmonic vibration -> coupling/foundation looseness -> rotating train instability | VM >=2.5; 1x/2x/3x harmonics | VG increases; RPM/P may become slightly unstable | Hours-weeks; spectral confirmation |
| CAS-MOT-S05 | Motor rubbing/friction | Rubbing -> current/temperature rise -> torque loss -> RPM droop -> process pressure disturbance | I 12.5-15+ A; TMOT 70-90 C; VM 2.0-3.0 | RPM <=1900 possible; P unstable; gearbox load increases | Minutes-hours; detectable as mechanical family |
| CAS-MOT-S06 | Motor cooling degradation | Cooling weak -> TMOT rise -> drive thermal derating -> speed/output reduction | TMOT >=80 C while I 8-12 A and VM <=2 | Later RPM/P fall if derating occurs | Minutes-hours; detectable now |
| CAS-MOT-S07 | Torque pulsation | Motor torque pulsation -> coupling torsion -> gear mesh excitation -> screw pressure pulsation | I variation >=1.5 A; RPM sigma >=50 possible | VG/order sidebands; P P-P >=0.5 MPa | Seconds-minutes; additional torque/phase data helpful |

## RARE
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-MOT-R01 | Motor bearing seizure | Bearing seizure -> extreme load -> coupling/gearbox shock -> screw stop | VM >=3; TMOT >=90 C; I >=20 A; RPM collapses | SRPM ->0; P decays; hot polymer stagnates | Immediate; severe |
| CAS-MOT-R02 | Motor shaft fracture | Shaft fracture -> torque transfer lost -> screw stops -> pressure collapse | Motor/drive condition abnormal; torque lost | P 4-><=1-2 MPa; output lost | Immediate; independent screw RPM recommended |
| CAS-MOT-R03 | Major rotor rub | Severe rub -> heat/current/vibration -> VFD/motor trip -> screw stop | VM >=3; TMOT >=90; I >=20 | RPM ->0; P decays; material residence time rises | Immediate; severe |
| CAS-MOT-R04 | Electrical/VFD trip | Electrical trip -> motor stop -> screw stop -> no flow -> polymer remains hot -> later degradation/restriction | RPM 2000->0 | P decays; MT/Z remain hot; restart may show P >=5.4 due deposits | Immediate then minutes-hours; drive status required |

## E.2 Gearbox-Originated Cascades
## FREQUENT
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-GBX-F01 | Gearbox friction/load increase | Gearbox losses -> motor current/temperature rise -> RPM droop -> screw/output reduction | TGB >50-80 C; VG >2.0; I 12.5-15 A | RPM may <=1900; P/output may reduce or become unstable | Minutes-hours; detectable now |
| CAS-GBX-F02 | High gearbox vibration | Gearbox vibration -> motor/coupling/foundation excitation -> bearing/fastener deterioration | VG >=2.5; severe >=3.0 | VM may rise >2.0; I/TGB trends may increase | Hours-weeks; detectable family |
| CAS-GBX-F03 | Gearbox overheating | TGB high -> oil condition worsens -> bearing/gear wear accelerates -> friction/load rises | TGB >=80; severe >=90 C | VG rises toward >=2.5/3; I rises toward >=15 | Hours-days; detectable now |

## SOMETIMES
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-GBX-S01 | Gearbox bearing degradation | Bearing wear -> friction/heat -> vibration -> transmission efficiency loss -> motor load rise | VG >=2.5; TGB 60-80 C | I 12-15 A; P/RPM stability can degrade | Hours-weeks; envelope/FFT |
| CAS-GBX-S02 | Gear mesh degradation | Mesh damage -> torque pulsation -> screw-speed pulsation -> melt-pressure pulsation | VG >2; GMF/sidebands increase | sigma RPM rises; P P-P >=0.5 MPa | Minutes-weeks; tooth count required for exact GMF |
| CAS-GBX-S03 | Poor lubrication | Lubrication loss -> friction -> TGB/VG rise -> wear -> motor current rise -> possible seizure | TGB 40->60->80->90; VG 1.67->2.2->2.5->3 | I 10->12.5->15-20; RPM may fall | Hours-days; family-level without oil sensing |
| CAS-GBX-S04 | Gearbox misalignment | Misalignment -> bearing side-load -> VM/VG 1x/2x -> heat/wear | VG/VM 2.0-3.0; TGB rises | I may reach 12-15 A | Hours-weeks; phase/axial improves ID |
| CAS-GBX-S05 | Gearbox looseness | Looseness -> impact/harmonic vibration -> foundation/coupling excitation -> process instability | VG >=2.5 with harmonics | VM may rise; P/RPM may become noisy | Hours-weeks; spectral confirmation |

## RARE
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-GBX-R01 | Gearbox bearing seizure | Seizure -> output locked -> motor current surge -> RPM collapse -> screw stop | TGB >=90; VG >=3; I >=20 | RPM/SRPM collapse; P initially abnormal then decays | Immediate; severe |
| CAS-GBX-R02 | Gear tooth fracture | Tooth fracture -> impacts/torque interruption -> screw speed/pressure pulsation | VG sudden >=3; GMF impacts | P pulsation >=0.5-1.5 MPa; I pulses | Immediate; spectral confirmation |
| CAS-GBX-R03 | Output shaft fracture | Torque path breaks -> screw stops while motor may continue -> process pressure collapse | Motor RPM may remain near 2000 | Actual screw RPM 0; P <=1-2; I falls | Immediate; independent screw RPM highly valuable |

## E.3 Coupling / Transmission-Originated Cascades
## FREQUENT
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-CPL-F01 | Small coupling misalignment | Misalignment -> motor/gearbox bearing side-load -> vibration -> accelerated wear | VM/VG around 2.0-2.5; 1x/2x | TMOT/TGB may slowly rise | Hours-weeks; family-level |
| CAS-CPL-F02 | Fastener looseness | Loose coupling/mount -> harmonic impacts -> motor/gearbox vibration | VM/VG >=2.0-2.5 | Process may remain normal initially | Hours-weeks; inspection + spectrum |

## SOMETIMES
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-CPL-S01 | Flexible-element wear | Wear/backlash -> torsional oscillation -> screw-speed/current/pressure oscillation | VM/VG rising; I variation >=1.5 A possible | P P-P >=0.5 MPa; RPM sigma >=50 | Minutes-weeks; torsional evidence helpful |
| CAS-CPL-S02 | Coupling slip | Slip -> actual screw RPM lower than derived -> conveying/pressure output falls | Motor RPM ~2000 but torque transfer reduced | Actual SRPM <100; P <3.2; I can fall | Immediate; physical screw-RPM sensor required |
| CAS-CPL-S03 | Coupling eccentricity | Eccentricity -> 1x vibration -> bearing/foundation load | VM/VG >2.0; 1x dominant | Long-term bearing wear | Hours-weeks; order analysis |

## RARE
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-CPL-R01 | Coupling rupture | Torque path lost -> screw stops -> pressure/output collapse | Motor RPM can remain ~2000 | Actual screw RPM 0; P <=1-2; I drops | Immediate; independent SRPM recommended |
| CAS-CPL-R02 | Sheared key/keyway failure | Intermittent or complete torque loss -> RPM mismatch -> process collapse | Motor RPM normal/unstable | P and output intermittent or low | Immediate; mechanical inspection/SRPM |

## E.4 Screw-Originated Cascades
## FREQUENT
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-SCR-F01 | High screw load | High resistance -> gearbox torque -> motor current/temp -> speed droop | P >=5.4; I >=15 | TGB/TMOT rise; RPM may <=1900 | Minutes; detectable now |
| CAS-SCR-F02 | Screw output instability | Conveying instability -> P/I oscillation -> die-flow/product variation | P P-P >=0.5; I sigma >=1.5 | Product dimensional/flow instability | Seconds-minutes; detectable now |

## SOMETIMES
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-SCR-S01 | Screw flight/barrel wear | Clearance/backflow -> pressure/efficiency loss -> output reduction -> altered residence/melting | P 4->3.6->3.2->2.8; I 10->9->8->7 | RPM ~2000, feed healthy; product output declines | Weeks-months; ambiguous with low viscosity |
| CAS-SCR-S02 | Screw eccentricity/bending | Eccentric rotation -> barrel contact -> periodic load/vibration -> accelerated barrel wear | 1.67 Hz screw-order modulation; I/P oscillation | VM/VG may rise; local Z temperature rises | Hours-weeks; screw-side vibration useful |
| CAS-SCR-S03 | Screw-to-barrel rubbing | Rubbing -> friction/heat -> gearbox/motor load -> thermal distortion -> more rubbing | I >=15-20; VM/VG >=2-3; local zone +10 to +20 C | TGB/TMOT rise; P/RPM unstable | Minutes-hours; escalating loop |
| CAS-SCR-S04 | Material build-up on screw | Build-up -> torque/pressure oscillation -> shear/temperature changes -> further deposits | P sigma >=0.4; I sigma >=1.5 | MT/Z can become unstable; screen loading later | Hours-days; family-level |

## RARE
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-SCR-R01 | Screw seizure | Seizure -> gearbox output locked -> motor current surge -> drive trip | RPM <=1800 and falling; I >=20; P may >=6 initially | TGB/VM/VG rise; then RPM 0 and P decays | Immediate; severe |
| CAS-SCR-R02 | Screw fracture | Conveying lost -> pressure/load collapse -> hot material stagnation | Motor RPM may ~2000 | P <=1-2; I <=3-6; output lost | Immediate; physical SRPM/torque helpful |

## E.5 Barrel Mechanical-Originated Cascades
## FREQUENT
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-BAR-F01 | Barrel deposit/build-up | Wall deposit -> flow resistance/thermal transfer changes -> pressure/load/temperature drift | P or Z profile gradually deviates | I/P/MT trends shift; screen/die fouling may follow | Hours-weeks; family-level |

## SOMETIMES
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-BAR-S01 | Barrel bore wear | Clearance -> backflow -> P/output efficiency loss -> lower motor load | P <3.2; I <7.5-9 with RPM/feed normal | Product output decreases | Weeks-months; ambiguous with screw wear/viscosity |
| CAS-BAR-S02 | Barrel misalignment | Misalignment -> screw rubbing -> vibration/load/heat -> accelerated screw/barrel wear | I >=15 possible; VM/VG >2; local Z +10-20 C | TGB/TMOT may rise; long-term wear accelerates | Hours-months; inspection required |

## RARE
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-BAR-R01 | Barrel crack/melt leak | Leak -> pressure/output loss -> hot-polymer hazard | P 4-><3.2-><=2 | I may fall; visible leak/temperature required | Immediate; extra leak/visual evidence |

## E.6 Barrel Heating / Thermal-Originated Cascades
## FREQUENT
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-TH-F01 | Zone under-temperature | Zone T low -> melt viscosity high -> P/torque/current rise -> motor/gearbox load | Example Z2 <=180; MT <=190 | P >=5.4; I >=15; RPM may <=1900 | Minutes; detectable now |
| CAS-TH-F02 | Thermal profile imbalance | 180/210/220 profile distorted -> uneven melting/viscosity -> P/I oscillation -> product instability | Any zone >12-15 C from expected spatial profile | P sigma >=0.4 or P-P >=0.5; I unstable | Minutes; detectable now |

## SOMETIMES
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-TH-S01 | Heater partial failure | Zone falls slowly -> incomplete melting -> viscosity/load rise -> drive heating | Z2 210->195->180; MT 190-200 | P 4.8-5.6; I 12.5-17 | Minutes-hours; trend important |
| CAS-TH-S02 | Heater stuck ON | Zone/MT high -> viscosity initially falls -> polymer degrades -> deposits -> later screen/die restriction | Z3 220->240; MT 210->230-240 | Early P may fall; later P >=5.4 and I >=15 after fouling | Minutes-hours; two-stage cascade |
| CAS-TH-S03 | Cooling overactive | Zone too cold -> viscosity/load rise -> P/I rise -> speed droop | Zone below warning; MT <=190 | P >=5.4; I >=15 | Minutes; detectable family |

## RARE
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-TH-R01 | Thermal runaway | Rapid heating -> polymer degradation -> gas/deposits -> restriction/overpressure | Zone high alarm + rise >=8 C/min; MT >=240 | P may become unstable/high; I increases if restriction develops | Minutes; severe |
| CAS-TH-R02 | Multi-zone control loss | Multiple zones uncontrolled -> melt property instability -> process/drive stress | Z1/Z2/Z3 reach low/high alarm bands | MT outside 180-240; P/I strongly abnormal | Minutes; severe |

## E.7 Cooling-Originated Cascades
## FREQUENT
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-CLG-F01 | Reduced barrel cooling | Cooling weak -> zone/MT high -> viscosity shift/degradation -> process instability | Temperature fails to recover; slope >-0.1 C/min after cooling command | MT >=230 possible; later P instability/restriction | Minutes-hours; detectable with command context |

## SOMETIMES
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-CLG-S01 | Motor cooling degradation | Cooling weak -> TMOT high -> derating/trip -> screw speed/output loss | TMOT >=80 while I 8-12 and VM <=2 | Later RPM/P fall | Minutes-hours; detectable now |
| CAS-CLG-S02 | Gearbox cooling degradation | TGB high -> oil/lubrication deterioration -> bearing/gear wear -> motor load rise | TGB >=80 with moderate VG initially | VG eventually >=2.5; I >=12.5-15 | Hours-days; family-level |
| CAS-CLG-S03 | Cooling valve sticking | Intermittent cooling -> zone cycling -> viscosity/pressure cycling | Zone P-P >=5 C | P/I oscillation follows | Minutes; command/valve feedback useful |

## RARE
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-CLG-R01 | Complete cooling loss | Multiple temperatures rise -> thermal degradation -> derating/drive stress | Multiple zones/TMOT/TGB rising >=1-3 C/min | Approach respective high alarms; process instability | Minutes; severe |

## E.8 Hopper / Feed-Originated Cascades
## FREQUENT
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-FEED-F01 | Feed starvation | Feed low -> screw fill low -> P/load/output low -> possible residence-time increase | L <=25; P <=2; I <=6; RPM ~2000 | Severe L <=10; P <=1; I <=3; MT may later rise | Immediate-minutes; detectable now |
| CAS-FEED-F02 | Hopper bridging | Material indicated but flow blocked -> starvation-like P/I collapse | L 40-90 while P <=2 and I <=6 | Output falls; residence effects possible | Immediate; detectable by cross-sensor inconsistency |
| CAS-FEED-F03 | Overfeed | Feed high -> screw fill/load -> P/I rise -> gearbox/motor heating -> speed droop | P >=5.4; I >=15; L adequate | RPM may 1900-2000; TGB/TMOT rise | Minutes; detectable family |
| CAS-FEED-F04 | Unstable feed | Feed oscillation -> screw torque/current -> pressure -> die-flow oscillation | L/P/I oscillatory; P P-P >=0.5 | Product dimensional instability | Seconds-minutes; detectable now |

## SOMETIMES
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-FEED-S01 | Feeder calibration high | Excess actual feed -> chronic P/I elevation -> drive thermal load | P 4.8-5.4; I 12.5-15 | Long-term TMOT/TGB rise | Hours; command/feed reference required |
| CAS-FEED-S02 | Feeder calibration low/slip | Actual feed low -> chronic P/I reduction -> low output | P 2.5-3.2; I 6-8; L adequate | Output low despite correct RPM | Hours; feed-rate measurement improves ID |

## RARE
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-FEED-R01 | Feeder/gate complete failure | No feed -> pressure/load collapse -> hot residence/stagnation | L may high; P <=1-2; I <=3-6 | MT/Z remain hot; restart degradation risk | Immediate then minutes-hours |

## E.9 Material-Originated Cascades
## FREQUENT
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-MAT-F01 | High-viscosity material/process | Viscosity high -> P/torque/current -> gearbox/motor heat -> possible speed droop | MT 185-200; P 5.4-6; I 15-20 | TGB/TMOT rise; RPM <=1900 possible | Minutes; family-level |
| CAS-MAT-F02 | Low-viscosity material/process | Viscosity low -> pressure/load/output control changes -> quality instability | MT 225-235; P 2.5-3.2; I 6-8 | Output/dimensional behavior shifts | Minutes; ambiguous with wear |
| CAS-MAT-F03 | Contamination | Contamination -> screen loading -> P/I rise -> drive load -> later blockage | P 4->4.8->5.4->6 | I 10->12.5->15->20 | Minutes-hours; family-level |

## SOMETIMES
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-MAT-S01 | Wet/poorly dried material | Moisture -> gas/melt instability -> P oscillation -> die/product defects | P sigma >=0.4 possible; MT near recipe | P-P >=0.5; product voids/bubbles possible | Minutes; moisture sensor required for unique ID |
| CAS-MAT-S02 | Abrasive filler/material | Abrasion -> screw/barrel wear -> clearance/backflow -> P/output efficiency loss | Long-term P 4->3.2-><3; I 10->8 | Wear-related output loss | Weeks-months; material history + inspection |
| CAS-MAT-S03 | Thermal degradation/deposits | Degradation -> carbon/gel deposits -> screen/die restriction -> shear heat -> more degradation | MT >=230-240 or long residence | Later P >=5.4 and I >=15 | Hours-days; escalating loop |

## RARE
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-MAT-R01 | Severely contaminated batch | Large foreign matter -> abrupt screen/die blockage -> overpressure/load | P rises rapidly toward >=6; I >=18-20 | RPM droop/trip possible | Minutes; severe |

## E.10 Screen / Breaker-Plate-Originated Cascades
## FREQUENT
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-SCRN-F01 | Gradual screen blockage | Screen resistance -> upstream P -> screw torque/I -> motor/gearbox heat -> RPM droop | Early P 4.6-4.8, I 10.5-12.5; warning P 5.4, I 15 | High P 5.4-5.8, I 15-18; critical P >=6, I 18-20 | Minutes-hours; detectable as restriction family |

## SOMETIMES
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-SCRN-S01 | Breaker-plate fouling | Restriction -> P/I rise -> shear heat -> material degradation -> additional deposits | P 4.8-5.8; I 12.5-18 | MT may rise; RPM may drop | Hours; family-level |

## RARE
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-SCRN-R01 | Complete blockage | P extreme -> screw/gearbox/motor overload -> drive trip/mechanical risk | P >=6; I >=18-20 | RPM <=1900/1800; TMOT/TGB rise | Immediate-minutes; severe |
| CAS-SCRN-R02 | Screen rupture/bypass | Stored restriction released -> abrupt P drop -> contamination passes to die/product | P e.g. 5.8->3.0 abruptly | I may fall; downstream contamination/die fouling later | Immediate then minutes-hours; history needed |

## E.11 Die / Head-Originated Cascades
## FREQUENT
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-DIE-F01 | Partial die restriction | Die resistance -> P/torque/I -> gearbox/motor load -> shear heat | P >=5.4; I >=15 | MT can rise; RPM may <=1900 | Minutes; restriction family |
| CAS-DIE-F02 | Die build-up/fouling | Fouling -> flow nonuniformity/restriction -> pressure oscillation -> product defects | P 4.8-5.4; P-P >=0.5 possible | I rises 12.5-15; product lines/variation | Minutes-hours; product evidence useful |

## SOMETIMES
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-DIE-S01 | Die temperature too low | Cold die -> local viscosity/resistance -> P/I rise -> drive load | MT/local die T low; P >=5.4 | I >=15; melt fracture risk | Minutes; die-temperature sensor helpful |
| CAS-DIE-S02 | Die gap too narrow | Gap restriction -> P/shear -> MT rise -> melt fracture/product defect | P >=5.4; I >=15 | MT may >=230; product surface defect | Minutes; process + product confirmation |

## RARE
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-DIE-R01 | Complete die blockage | No flow -> P extreme -> screw/motor overload/trip | P >=6; I >=18-20 | RPM droop; thermal degradation risk | Immediate; severe |
| CAS-DIE-R02 | Melt leak/flange failure | Leak -> P/output loss -> hot-polymer hazard | P abrupt <3.2 or <=2 | I may fall; visual/leak evidence required | Immediate; extra sensor/inspection |

## E.12 Melt / Process-Originated Cascades
## FREQUENT
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-PROC-F01 | High melt pressure | P high -> screw thrust/torque -> gearbox/motor load -> temperatures rise | P >=5.4; severe >=6 | I >=15-20; TGB/TMOT rise | Minutes; detectable now |
| CAS-PROC-F02 | Pressure pulsation | Cyclic P -> cyclic screw torque -> gearbox/current fatigue loading -> product fluctuation | P P-P >=0.5; severe >=1.5 | I variation >=1.5 A; RPM may oscillate | Seconds-minutes; detectable now |
| CAS-PROC-F03 | Low melt temperature | MT low -> viscosity -> P/I -> drive load | MT <=190; severe <=180 | P >=5.4; I >=15 possible | Minutes; detectable family |
| CAS-PROC-F04 | High melt temperature | MT high -> viscosity decrease/degradation -> deposits -> later restriction | MT >=230; severe >=240 | Early P may fall; later P >=5.4 if fouling develops | Minutes-hours; two-stage |

## SOMETIMES
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-PROC-S01 | Pressure instability | Unstable melt -> torque/current oscillation -> drive fatigue -> product instability | sigma P >=0.40; severe >=0.80 | I sigma >=1.5; product output unstable | Seconds-minutes; detectable now |

## RARE
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-PROC-R01 | Catastrophic overpressure | Extreme restriction/process upset -> drive overload + seal/head stress | P >=6 and rising; I >=20 | RPM droop/trip; mechanical/safety risk | Immediate; severe |

## E.13 Lubrication-Originated Cascades
## FREQUENT
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-LUB-F01 | Lubricant degradation | Oil quality down -> friction/heat -> bearing/gear wear -> motor load rise | TGB 50-80; VG 1.8-2.5 | I 10->12.5-15 | Hours-weeks; family-level |

## SOMETIMES
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-LUB-S01 | Low oil level | Lubrication low -> TGB/VG rise -> wear -> efficiency loss -> I rise | TGB 60-90; VG 2.0-3.0 | I 12.5-20; RPM may fall late | Hours-days; oil-level sensor recommended |
| CAS-LUB-S02 | Oil contamination/wrong viscosity | Friction/lubrication abnormal -> bearing/gear degradation -> vibration/load rise | TGB >60; VG >2 | I rises; long-term gear/bearing damage | Hours-weeks; oil condition required |

## RARE
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-LUB-R01 | Complete lubricant loss | Rapid friction/heat -> bearing/gear damage -> seizure -> motor overload | TGB >=90; VG >=3 | I >=20; RPM collapse | Minutes-hours; severe |

## E.14 VFD / Electrical-Originated Cascades
## FREQUENT
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-EL-F01 | VFD speed hunting | Drive speed oscillation -> screw-speed oscillation -> P/I oscillation -> product variation | sigma RPM >=50 | P P-P >=0.5; I sigma >=1.5 | Seconds-minutes; detectable now |

## SOMETIMES
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-EL-S01 | Torque/current limiting | Available torque limited -> RPM droop under load -> throughput/P reduction | RPM <=1900 under high load; I near drive limit | SRPM <=95; P/output may fall | Minutes; VFD status improves ID |
| CAS-EL-S02 | Overspeed/overfrequency | RPM high -> SRPM/shear/throughput -> MT/P/load can rise | RPM >=2100; severe >=2250; SRPM >=105/112.5 | MT/P/I may rise depending material/die | Immediate; detectable now |
| CAS-EL-S03 | Electrical phase/winding abnormality family | Torque quality/available torque down -> heat/RPM instability -> process instability | I aggregate abnormal; TMOT rises; RPM unstable | P/SRPM unstable | Minutes; phase V/I required for exact root cause |

## RARE
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-EL-R01 | Power/VFD trip | Motor stop -> screw stop -> P decay -> hot polymer residence -> later degradation/restriction | RPM ->0 | P decays; Z/MT remain hot; restart restriction possible | Immediate then minutes-hours; drive event required |

## E.15 Instrumentation / Data False-Cascade Scenarios
## FREQUENT
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-INS-F01 | Pressure sensor falsely high | Bad P reading can mimic restriction/overload; cross-check current, RPM, MT, feed | True P ~4 but reported e.g. 5.8 | If I ~10, RPM ~2000, MT ~210, suspect sensor rather than restriction | Immediate; cross-sensor integrity gate |
| CAS-INS-F02 | Hopper sensor falsely low | Low reported L can mimic starvation; cross-check P/I/output | Reported L ~10 but P ~4 and I ~10 | Normal process despite low L -> level sensor fault likely | Immediate; detectable by inconsistency |
| CAS-INS-F03 | Current sensor falsely high | High I can mimic overload; cross-check TMOT/RPM/P/VM | Reported I ~18 but TMOT ~40, RPM ~2000, P ~4, VM ~1.67 | No corroboration -> meter/scaling issue | Immediate; integrity gate |
| CAS-INS-F04 | RPM sensor falsely low | Low RPM can mimic drive failure; cross-check process continuity | Reported RPM ~1000 while P ~4, I ~10, output normal | Likely missed pulses/scaling | Immediate; integrity gate |

## SOMETIMES
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-INS-S01 | Temperature sensor offset/frozen | Bad zone T can mimic heater fault; cross-check adjacent zones, MT, current and temporal response | Example Z1 frozen 180.0 despite process changes | If MT/P/I respond normally, instrumentation fault more likely | Minutes; temporal correlation |
| CAS-INS-S02 | Vibration sensor loose/scaled | False VM/VG can trigger mechanical cascade; cross-check spectrum, other location and load/temp | VM may jump >2.5 or drop <=0.2 implausibly | No correlated mechanical evidence -> sensor/mount issue | Minutes; integrity + waveform |
| CAS-INS-S03 | Channel mapping/config error | Correct values assigned to wrong component -> false propagation chain | e.g. Z2/Z3 or VM/VG swapped | Spatial/correlation logic becomes contradictory | Immediate; configuration/version gate |

## RARE
| Cascade ID | Initiating fault | Propagation path | Initiating / local values | Downstream values / symptoms | Time / detectability |
| CAS-INS-R01 | Pressure scaling x2 | True 4 MPa -> reported 8 MPa -> false severe restriction | Reported value exceeds configured process range | I/RPM/MT do not corroborate | Immediate; plausibility/config gate |

## E.16 Self-Reinforcing Fault Loops
| Loop ID | Loop | Propagation | Representative values | Time |
| LOOP-01 | Restriction / load loop | Screen or die restriction -> P rises -> I/shear rises -> material degradation/deposits -> restriction increases further | P 4->5.4->6 MPa; I 10->15->20 A | Escalating; minutes-hours |
| LOOP-02 | Screw rubbing loop | Misalignment/rubbing -> heat and wear -> geometry worsens -> more rubbing | I >=15; VM/VG >=2.5; local zone +10-20 C | Escalating; hours-days |
| LOOP-03 | Gearbox lubrication loop | Low lubrication -> heat -> oil degradation -> poorer lubrication -> bearing/gear damage | TGB 40->80->90; VG 1.67->2.5->3 | Escalating; hours-days |
| LOOP-04 | Thermal / poor melting loop | Low zone/MT -> viscosity/load rises -> shear heating/load instability -> thermal control becomes harder | MT <=190; P >=5.4; I >=15 | Escalating; minutes |
| LOOP-05 | Material degradation loop | High residence/T -> degradation -> deposits -> restriction -> shear heat -> more degradation | MT >=230-240; later P >=5.4 and I >=15 | Escalating; minutes-hours |

## E.17 Recommended Cascade Record for ULTRON
| Database field | Example |
| Cascade ID | CAS-MOT-S01 |
| Origin part | Motor |
| Initiating fault | Motor bearing degradation |
| Occurrence | Sometimes |
| Primary signal / nominal | VM / 1.67 mm/s RMS |
| Fault onset / warning / severe | >2.0 / >=2.5 / >=3.0 mm/s |
| First affected part | Coupling |
| Second affected part | Gearbox input bearing / gearbox |
| Secondary signal | VG 1.67 -> 2.2-2.6 mm/s |
| Process effect | Load/speed/pressure stability deteriorates if progression continues |
| Propagation time | Hours to weeks |
| Confirmation | Waveform + FFT/envelope + trend |
| Detectability | High at fault-family level |
| Recommended action | Inspect motor bearing, mounting and alignment before downstream gearbox damage |

Recommended UI behavior: Diagnosis should show the initiating fault and immediate maintenance action. Advance Diagnosis should show the propagation chain, current stage, affected sensors, supporting values, expected next affected part and whether the cascade is stable, developing or escalating.