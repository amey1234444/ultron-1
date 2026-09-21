/**
 * Form shadows and edge highlights, over the machine.
 *
 * These describe where the machine sits rather than what it is made of — the
 * shadow it casts on the floor, the motor barrel turning away from the light,
 * the gearbox top plane catching it — which is why they are one pass over the
 * whole drawing rather than a filter on each part.
 *
 * Takes no pointer events, so it can never come between a pad and a cursor.
 */
export function buildLightingOverlaySvg(): string {
  return `
  <g id="tse15-lighting-overlay" style="pointer-events: none">
    <ellipse cx="805" cy="715" rx="650" ry="18" fill="url(#tse14-contact-shadow)" filter="url(#tse14-ground-blur)" opacity=".5"/>
    <path d="M42 496C28 513 24 534 24 558C24 589 31 614 45 631" fill="none" stroke="url(#tse14-overlay-white)" stroke-width="5.8" opacity=".34"/>
    <path d="M197 489C208 512 211 536 211 558C211 583 207 607 198 625" fill="none" stroke="#11171a" stroke-width="6.5" opacity=".075"/>
    <rect x="85" y="489" width="23" height="136" rx="8" fill="#fff" opacity=".07"/>
    <rect x="185" y="489" width="20" height="136" rx="8" fill="#13181b" opacity=".05"/>
    <path d="M356 401L366 393H506Q516 393 521 399L513 404H364Z" fill="url(#tse14-overlay-white)" opacity=".34"/>
    <path d="M514 405H526V680L517 686Z" fill="url(#tse14-overlay-dark)" opacity=".42"/>
    <path d="M378 444H469" fill="none" stroke="#fff" stroke-width="1.7" opacity=".14"/>
    <path d="M479 444H526" fill="none" stroke="#fff" stroke-width="1.2" opacity=".1"/>
    <path d="M546 454C560 447 573 449 582 457" fill="none" stroke="#fff" stroke-width="2.2" opacity=".18"/>
    <path d="M550 620C560 628 570 628 578 622" fill="none" stroke="#11171a" stroke-width="2" opacity=".08"/>
  </g>`;
}
