/**
 * Fine construction detail, painted over the machine.
 *
 * Kept as its own pass, the way the reference ships it, so the geometry
 * underneath keeps its part bounds and anchor coordinates. The motor,
 * coupling and gearbox detailing the reference carries here is not: the
 * rebuild pass draws those three assemblies again from scratch on top of it,
 * so none of it was ever visible.
 */
export function buildProductionRefinementSvg(): string {
  return `
  <g id="iteration15-production-refinements" style="pointer-events: none">
    <!-- MOTOR: fan-shell depth, rating plate, electrical hardware and feet -->
    

    <!-- COUPLING: jaw seams and axial alignment -->
    

    <!-- GEARBOX: raised cover, service fasteners, oil glass and breather -->
    

    <!-- OUTPUT HOUSING: bearing/flange construction cues -->
    <g id="output-production-details">
      <path d="M539 439C548 463 551 498 551 538C551 580 548 614 539 637" fill="none" stroke="#fff" stroke-width="1.05" opacity=".42"/>
      <path d="M579 456V630" stroke="#20272a" stroke-width=".65" opacity=".28"/>
      <g fill="url(#boltGrad)" stroke="#555c60" stroke-width=".55"><circle cx="598" cy="493" r="3.1"/><circle cx="598" cy="517" r="3.1"/><circle cx="598" cy="579" r="3.1"/><circle cx="598" cy="603" r="3.1"/></g>
    </g>

    <!-- BARREL: thermocouples, zone seams and material-flow cue -->
    <g id="barrel-production-details">
      <path d="M646 493H1426" stroke="#e8bd60" stroke-width="1.1" opacity=".68"/>
      <path d="M696 490V615M792 490V615M888 490V615M984 490V615M1080 490V615M1176 490V615M1272 490V615M1368 490V615" stroke="#242b2e" stroke-width=".65" opacity=".2"/>
      <path d="M681 486C733 478 786 478 838 486" fill="none" stroke="#fff" stroke-width="1.1" opacity=".52"/>
      <path d="M653 553H1408" stroke="#f4d07e" stroke-width="1" stroke-dasharray="9 9" opacity=".38"/>
    </g>

    <!-- VENT AND DIE: cap depth, pressure port and discharge direction -->
    <g id="vent-die-production-details">
      <path d="M1329 382H1364" stroke="#fff" stroke-width="1" opacity=".7"/>
      <path d="M1336 348V339H1352V350" fill="url(#plateV)" stroke="#596064" stroke-width=".75"/>
      <path d="M1454 478V462H1468V482" fill="url(#metalV)" stroke="#555c60" stroke-width=".8"/>
      <path d="M1505 486H1520L1565 529" fill="none" stroke="#fff" stroke-width="1.15" opacity=".58"/>
      <path d="M1601 539V532H1614V539" fill="none" stroke="#565d61" stroke-width="1"/>
      <path d="M1635 564H1640" stroke="#18b763" stroke-width="3"/><path d="M1640 558L1647 564L1640 570Z" fill="#18b763"/>
    </g>
  </g>`;
}

/** Insert refinements before the original annotation layer so callouts stay on top. */
