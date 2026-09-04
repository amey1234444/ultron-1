
/**
 * Twin Screw Extruder artwork.
 *
 * This is the refined machine drawing (iteration 14), vendored as the template
 * artwork rather than redrawn: it is emitted as SVG source and parsed once into
 * react-native-svg nodes by `TwinScrewExtruder`, so the console renders the
 * reference drawing itself and not an approximation of it. Every element
 * survives that round trip — gradients, patterns, clip paths and the lighting
 * filters all map onto react-native-svg primitives, on web and on native alike.
 *
 * Four things were changed on the way in, and only these four:
 *
 * 1. The instrument markers baked into the drawing are gone. Pads are drawn by
 *    the template from `TWIN_SCREW_POINT_REGISTRY`, with their wiring state, so
 *    a dot on this machine always means a place a card can actually attach.
 * 2. The sheet and its grid are optional. On the editor canvas the workspace
 *    already paints a grid, and a second one beats against it.
 * 3. Part names and their leaders are optional and take their colour from the
 *    caller, so they stay readable in both themes and stay out of the way of
 *    the trail labels on the mapping canvas.
 * 4. The iteration-14 lighting pass is applied as filter attributes on the part
 *    groups rather than as a CSS block. react-native-svg has no CSS cascade, so
 *    a stylesheet would have rendered the machine flat on native.
 *
 * The frame is the registry's frame: point coordinates and this drawing are the
 * same coordinate space, which is what lets a pad sit on the feature it
 * measures at every zoom level.
 */

import {
  TWIN_SCREW_ARTWORK_HEIGHT,
  TWIN_SCREW_ARTWORK_WIDTH,
} from '../../../lib/twinScrewExtruderPoints';

export const WIDTH = TWIN_SCREW_ARTWORK_WIDTH;
export const HEIGHT = TWIN_SCREW_ARTWORK_HEIGHT;

const f = (n: number) => Number(n.toFixed(2));

function bolt(x: number, y: number, r = 6): string {
  return `
    <g class="bolt">
      <circle cx="${x}" cy="${y}" r="${r}" fill="url(#boltGrad)" stroke="#42474b" stroke-width="1.2"/>
      <circle cx="${x}" cy="${y}" r="${f(r * 0.42)}" fill="none" stroke="#646a6e" stroke-width="1"/>
      <path d="M ${f(x-r*0.28)} ${y} H ${f(x+r*0.28)}" stroke="#596064" stroke-width="1"/>
    </g>`;
}

function hexNut(x: number, y: number, r = 6): string {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 6 + i * Math.PI / 3;
    return `${f(x + Math.cos(a) * r)},${f(y + Math.sin(a) * r)}`;
  }).join(" ");
  return `
    <g class="hex-nut">
      <circle cx="${x}" cy="${y}" r="${f(r * 1.24)}" fill="url(#washerGrad)" stroke="#555b5f" stroke-width=".85"/>
      <polygon points="${pts}" fill="url(#nutGrad)" stroke="#41474b" stroke-width="1.05"/>
      <circle cx="${x}" cy="${y}" r="${f(r * .34)}" fill="#d9dcdb" stroke="#656b6f" stroke-width=".85"/>
    </g>`;
}

function studNut(x: number, y: number, r = 6, stem = 7): string {
  return `
    <g class="stud-nut">
      <rect x="${f(x-r*.35)}" y="${f(y-r-stem)}" width="${f(r*.7)}" height="${f(stem+r*.7)}"
            rx="${f(r*.18)}" fill="url(#metalV)" stroke="#5b6165" stroke-width=".8"/>
      ${hexNut(x, y, r)}
    </g>`;
}

function flangeBolt(x: number, y: number, r = 5.5): string {
  return `
    <g class="flange-bolt">
      <circle cx="${x}" cy="${y}" r="${f(r*1.35)}" fill="#eceeec" stroke="#7a8084" stroke-width=".8"/>
      ${hexNut(x, y, r)}
    </g>`;
}

function socketBolt(x: number, y: number, r = 5.5): string {
  const rr = f(r * .42);
  return `
    <g class="socket-bolt">
      <circle cx="${x}" cy="${y}" r="${f(r*1.18)}" fill="url(#washerGrad)" stroke="#666c70" stroke-width=".8"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="url(#boltGrad)" stroke="#41474b" stroke-width="1"/>
      <circle cx="${x}" cy="${y}" r="${rr}" fill="#eef0ee" stroke="#61676b" stroke-width=".8"/>
      <path d="M ${f(x-r*.28)} ${y} H ${f(x+r*.28)}" stroke="#666c70" stroke-width=".75"/>
    </g>`;
}

function heaterBolt(x: number, y: number): string {
  return `
    <g class="heater-bolt">
      <rect x="${x-8}" y="${y-8}" width="16" height="16" rx="2"
            fill="url(#metalV)" stroke="#5d6367" stroke-width=".9"/>
      ${socketBolt(x, y, 4.1)}
    </g>`;
}



function motor(): string {
  const fins = Array.from({ length: 22 }, (_, i) => {
    const y = 490 + i * 6.05;
    return `
      <path d="M 76 ${f(y)} H 218" stroke="#51575b" stroke-width="2.15" stroke-linecap="round"/>
      <path d="M 78 ${f(y + 2.05)} H 216" stroke="#ffffff" stroke-width=".88" stroke-linecap="round" opacity=".88"/>`;
  }).join("");

  return `
  <g id="motor" filter="url(#tse14-metal-depth)">
    <!-- LOWER FOUNDATION: front face + right bevel -->
    <path d="M 36 681 H 252 L 262 676 V 725 H 36 Z"
          fill="url(#baseMetal)" stroke="#343a3e" stroke-width="1.45"/>
    <path d="M 36 681 H 252 L 262 676 H 47 Z" fill="#ffffff" opacity=".38"/>
    <path d="M 252 681 L 262 676 V 725 L 252 720 Z" fill="url(#sidePlane)" opacity=".56"/>
    <rect x="42" y="720" width="212" height="4" rx="2" fill="#2f3538" opacity=".12"/>
    <path d="M 39 686 H 256" stroke="#ffffff" stroke-width="1.25" opacity=".7"/>
    ${studNut(69, 695, 6.0, 7)}
    ${studNut(203, 695, 6.0, 7)}

    <!-- intermediate sole plate -->
    <path d="M 53 650 H 231 L 240 656 V 681 H 53 Z"
          fill="url(#plateV)" stroke="#383e42" stroke-width="1.28"/>
    <path d="M 57 654 H 234" stroke="#ffffff" stroke-width="1.05" opacity=".65"/>
    <path d="M 231 650 L 240 656 V 681 L 231 676 Z" fill="#91979a" opacity=".18"/>

    <!-- cast mounting feet, slightly separated from body -->
    <path d="M 73 621 H 96 V 647 H 101 V 657 H 67 V 647 H 72 Z"
          fill="url(#metalV)" stroke="#50565a" stroke-width="1"/>
    <path d="M 194 621 H 217 V 647 H 223 V 657 H 188 V 647 H 193 Z"
          fill="url(#metalV)" stroke="#50565a" stroke-width="1"/>
    ${hexNut(85,650,4.2)} ${hexNut(207,650,4.2)}
    <path d="M 73 624 H 96 M 194 624 H 217" stroke="#ffffff" stroke-width=".9" opacity=".62"/>

    <!-- FRONT FAN / END BELL: rounded, tapered and with lower-right edge shadow -->
    <path d="M 76 485 H 50
             C 31 485 19 502 16 529
             V 588
             C 18 617 31 636 49 641
             H 64 Q 72 637 76 628 Z"
          fill="url(#motorFrontBell)" stroke="#30363a" stroke-width="1.45"/>
    <path d="M 49 491 C 34 508 29 529 29 557 C 29 588 36 613 50 628"
          fill="none" stroke="#ffffff" stroke-width="1.75" opacity=".66"/>
    <path d="M 61 491 C 51 510 48 532 48 557 C 48 586 54 610 63 626"
          fill="none" stroke="#c6cac9" stroke-width="1.05" opacity=".62"/>
    <path d="M 35 501 C 27 520 24 539 24 557 C 24 582 29 605 39 620"
          fill="none" stroke="#ffffff" stroke-width="2.5" opacity=".32"/>
    <path d="M 68 493 V 624" stroke="#50565a" stroke-width="2.0" opacity=".16"/>
    <path d="M 69 493 V 624" stroke="#858b8e" stroke-width=".8" opacity=".35"/>

    <!-- FINNED STATOR: body is slightly barrelled by the end-ring transitions -->
    <path d="M 75 485 H 213 Q 221 485 223 493 V 621 Q 221 629 213 630 H 75 Z"
          fill="url(#motorBody)" stroke="#343a3e" stroke-width="1.25"/>
    <path d="M 77 488 H 216" stroke="#ffffff" stroke-width="1.15" opacity=".62"/>
    ${fins}
    <!-- broad cylindrical gloss and lower form shadow -->
    <rect x="82" y="489" width="32" height="137" rx="9" fill="url(#cylGloss)" opacity=".34"/>
    <rect x="189" y="489" width="25" height="137" rx="8" fill="url(#cylShade)" opacity=".32"/>
    <path d="M 80 624 H 214" stroke="#3f4549" stroke-width="2.1" opacity=".19"/>
    <path d="M 77 488 V 627" stroke="#858b8f" stroke-width="1.05" opacity=".72"/>
    <path d="M 217 488 V 627" stroke="#73797d" stroke-width="1.08" opacity=".78"/>

    <!-- TOP TERMINAL BOX: cap, seam and body -->
    <rect x="112" y="449" width="76" height="15" rx="4" fill="url(#plateV)" stroke="#34393d" stroke-width="1.18"/>
    <path d="M 116 452 H 184" stroke="#ffffff" stroke-width="1" opacity=".75"/>
    <rect x="120" y="463" width="60" height="25" rx="3" fill="url(#metalV)" stroke="#454b4f" stroke-width="1.05"/>
    <path d="M 122 468 H 178" stroke="#ffffff" stroke-width="1.1" opacity=".76"/>
    <path d="M 123 485 H 177" stroke="#7b8185" stroke-width=".75" opacity=".5"/>

    <!-- REAR END BELL: three-step curved carrier -->
    <path d="M 216 486
             Q 230 489 238 502
             Q 246 519 248 553
             Q 247 587 240 607
             Q 233 622 219 630
             L 210 621 V 496 Z"
          fill="url(#endBell)" stroke="#343a3e" stroke-width="1.28"/>
    <path d="M 221 497 C 231 514 234 533 234 557 C 234 583 231 602 222 616"
          fill="none" stroke="#ffffff" stroke-width="1.2" opacity=".66"/>
    <path d="M 232 501 C 241 520 242 539 242 557 C 242 579 239 599 232 612"
          fill="none" stroke="#797f83" stroke-width=".9" opacity=".5"/>
    <ellipse cx="238" cy="557" rx="9.2" ry="50.5" fill="none" stroke="#6f7579" stroke-width=".85" opacity=".55"/>
  </g>

  <g id="motor-coupling" filter="url(#tse14-chrome-depth)">
    <!-- shaft from motor end bell -->
    <rect x="247" y="536" width="15" height="47" rx="6" fill="url(#deepMetal)" stroke="#343a3e" stroke-width="1.08"/>
    <path d="M 259 539 V 580" stroke="#ffffff" stroke-width=".8" opacity=".48"/>
    <!-- axial gap 1 -->
    <rect x="262" y="541" width="3" height="37" fill="#454b4f" opacity=".55"/>

    <!-- flexible coupling: larger collar with bright crown -->
    <rect x="265" y="524" width="39" height="69" rx="5" fill="url(#metalH)" stroke="#343a3e" stroke-width="1.23"/>
    <path d="M 270 529 H 299 M 270 588 H 299" stroke="#ffffff" stroke-width="1.0" opacity=".72"/>
    <path d="M 275 527 V 590 M 296 527 V 590" stroke="#ffffff" stroke-width=".95" opacity=".58"/>
    <path d="M 301 530 V 588" stroke="#70767a" stroke-width=".75" opacity=".55"/>
    <!-- axial gap 2 -->
    <rect x="304" y="540" width="3" height="38" fill="#454b4f" opacity=".5"/>

    <!-- short shaft -->
    <rect x="307" y="537" width="14" height="45" rx="3" fill="url(#deepMetal)" stroke="#343a3e" stroke-width="1.05"/>
    <!-- spacer/bearing collar -->
    <rect x="321" y="529" width="20" height="60" rx="3" fill="url(#metalH)" stroke="#343a3e" stroke-width="1.08"/>
    <path d="M 325 533 V 585" stroke="#ffffff" stroke-width=".85" opacity=".54"/>
    <path d="M 338 533 V 585" stroke="#777d81" stroke-width=".7" opacity=".5"/>
    <!-- axial gap 3 -->
    <rect x="341" y="540" width="3" height="38" fill="#454b4f" opacity=".5"/>

    <!-- gearbox input nose -->
    <path d="M 344 519 H 353 Q 359 521 361 531 V 585 Q 359 595 353 598 H 344 Z"
          fill="url(#metalV)" stroke="#454b4f" stroke-width="1.05"/>
    <path d="M 347 523 V 594" stroke="#ffffff" stroke-width=".8" opacity=".5"/>
  </g>`;
}

function gearbox(): string {
  return `
  <g id="gearbox" filter="url(#tse14-metal-depth)">
    <!-- BASE: front plate, top face and right bevel -->
    <path d="M 285 692 H 574 L 584 687 V 726 H 285 Z"
          fill="url(#baseMetal)" stroke="#343a3e" stroke-width="1.45"/>
    <path d="M 285 692 H 574 L 584 687 H 296 Z" fill="#ffffff" opacity=".36"/>
    <path d="M 574 692 L 584 687 V 726 L 574 721 Z" fill="#979c9f" opacity=".18"/>
    <path d="M 288 697 H 578" stroke="#ffffff" stroke-width="1.28" opacity=".66"/>
    ${studNut(317, 687, 6.1, 7)}
    ${studNut(544, 687, 6.1, 7)}

    <!-- LEFT SUPPORT WEB: sloped cast foot with internal highlight -->
    <path d="M 294 668 H 318
             C 333 656 339 643 343 625
             L 350 588 V 691 H 294 Z"
          fill="url(#metalV)" stroke="#676d71" stroke-width="1.05"/>
    <path d="M 304 658 C 324 647 335 629 340 605" fill="none" stroke="#ffffff" stroke-width="1.45" opacity=".5"/>
    <path d="M 318 668 H 348" stroke="#8f9598" stroke-width=".8" opacity=".38"/>

    <!-- cast contact shadow under housing -->
    <path d="M 349 687 H 524" stroke="#343a3e" stroke-width="2.2" opacity=".12"/>

    <!-- RIGHT FOOT: directly below output side -->
    <path d="M 519 654 H 543 V 673 H 554 L 566 684 V 691 H 518 Z"
          fill="url(#metalV)" stroke="#676d71" stroke-width="1.0"/>
    <path d="M 523 657 H 542" stroke="#ffffff" stroke-width=".9" opacity=".58"/>

    <!-- MAIN CASTING: exact top-left chamfer and nearly vertical front walls -->
    <path d="M 350 401 L 363 390 H 507
             Q 518 390 524 397
             L 531 410 V 681
             Q 531 690 522 692 H 350 Z"
          fill="url(#gearboxBody)" stroke="#34393d" stroke-width="1.58"/>
    <!-- cast edge planes -->
    <path d="M 350 401 L 363 390 V 692 H 350 Z" fill="url(#gearboxSide)" stroke="#666c70" stroke-width=".72"/>
    <!-- top face has visible depth instead of a single highlight line -->
    <path d="M 350 401 L 363 390 H 507 Q 517 390 522 395 L 514 401 H 361 Z"
          fill="url(#topPlane)" stroke="#8a9093" stroke-width=".65" opacity=".88"/>
    <!-- right cast side plane -->
    <path d="M 524 399 L 531 410 V 681 Q 531 689 523 692 L 517 684 V 411 Z"
          fill="url(#sidePlane)" opacity=".48"/>
    <path d="M 526 410 V 681" stroke="#676d71" stroke-width=".9" opacity=".5"/>

    <!-- LARGE INSPECTION COVER: larger radius and subtle bottom-right shadow -->
    <rect x="375" y="441" width="104" height="227" rx="9"
          fill="url(#coverFace)" stroke="#8c9194" stroke-width="1.12"/>
    <path d="M 382 447 H 471" stroke="#ffffff" stroke-width="1.65" opacity=".82"/>
    <path d="M 477 451 V 659 Q 477 665 471 666" fill="none" stroke="#858b8f" stroke-width=".75" opacity=".34"/>
    <path d="M 382 666 H 469" stroke="#9aa0a3" stroke-width=".7" opacity=".4"/>
    <!-- subtle recessed cover shadow on bottom/right -->
    <path d="M 470 448 Q 476 449 476 455 V 657 Q 475 664 469 665"
          fill="none" stroke="#33393d" stroke-width="2.3" opacity=".08"/>

    <!-- RIGHT SERVICE COVER: slightly stepped forward -->
    <path d="M 479 441 H 526 V 668 H 479 Z" fill="url(#gearboxRib)" stroke="#9da2a5" stroke-width=".86"/>
    <path d="M 484 447 H 521" stroke="#ffffff" stroke-width="1.22" opacity=".58"/>
    <path d="M 522 447 V 663" stroke="#858b8e" stroke-width=".68" opacity=".34"/>

    <!-- TOP LIFTING EYE -->
    <circle cx="458" cy="375" r="16" fill="none" stroke="#41474b" stroke-width="3"/>
    <circle cx="458" cy="375" r="8.9" fill="#f7f7f5" stroke="#777d80" stroke-width="1"/>
    <path d="M 447 390 H 469" stroke="#41474b" stroke-width="3"/>

    <!-- INSPECTION BOSSES: concentric metal rings -->
    <circle cx="436" cy="514" r="15" fill="url(#boltGrad)" stroke="#41474b" stroke-width="1.7"/>
    <circle cx="436" cy="514" r="9.1" fill="#e8eae8" stroke="#8c9295" stroke-width=".8"/>
    <circle cx="436" cy="514" r="6.5" fill="#f9f9f7" stroke="#656b6f" stroke-width="1"/>
    <circle cx="436" cy="600" r="13.2" fill="url(#boltGrad)" stroke="#41474b" stroke-width="1.65"/>
    <circle cx="436" cy="600" r="8.0" fill="#e8eae8" stroke="#8c9295" stroke-width=".75"/>
    <circle cx="436" cy="600" r="5.7" fill="#f9f9f7" stroke="#656b6f" stroke-width=".95"/>

    <!-- CAST FASTENERS / PLUGS -->
    ${socketBolt(372,421,5.3)}
    ${socketBolt(500,437,5.25)}
    ${socketBolt(500,556,4.95)}
    ${socketBolt(500,616,4.95)}
    ${socketBolt(500,684,4.5)}
    <rect x="393" y="386" width="13" height="7" rx="2" fill="url(#plateV)" stroke="#666c70" stroke-width=".82"/>
    <rect x="488" y="386" width="13" height="7" rx="2" fill="url(#plateV)" stroke="#666c70" stroke-width=".82"/>
    <rect x="346" y="467" width="8" height="26" rx="4" fill="url(#metalH)" stroke="#555b5f" stroke-width=".88"/>
  </g>

  <g id="gearbox-output" filter="url(#tse14-metal-depth)">
    <!-- Large output casting immediately attached to gearbox wall -->
    <path d="M 531 418 H 548
             Q 558 419 563 430
             V 640 Q 561 651 552 654 H 531 Z"
          fill="url(#metalH)" stroke="#343a3e" stroke-width="1.22"/>

    <!-- rounded bell / reducer housing -->
    <path d="M 548 425
             H 556 Q 566 428 571 441
             L 574 452 V 622
             L 570 637 Q 564 647 554 650 H 548 Z"
          fill="url(#outputBell)" stroke="#50565a" stroke-width="1.12"/>
    <path d="M 554 435 C 563 462 567 498 567 538 C 567 577 563 612 555 640"
          fill="none" stroke="#ffffff" stroke-width="1.28" opacity=".62"/>
    <path d="M 568 449 V 627" stroke="#73797d" stroke-width=".78" opacity=".38"/>
    <path d="M 550 466 C 558 463 566 463 572 466" fill="none" stroke="#ffffff" stroke-width="1.0" opacity=".44"/>
    <path d="M 550 603 C 558 606 565 606 571 603" fill="none" stroke="#4a5054" stroke-width=".9" opacity=".28"/>

    <!-- short bearing carrier directly after bell -->
    <rect x="573" y="448" width="12" height="188" rx="3"
          fill="url(#deepMetal)" stroke="#4c5256" stroke-width=".95"/>
    <path d="M 576 452 V 632" stroke="#ffffff" stroke-width=".72" opacity=".44"/>

    <!-- vertical bolted flange plate -->
    <rect x="585" y="441" width="27" height="204" rx="4"
          fill="url(#metalH)" stroke="#3d4347" stroke-width="1.08"/>
    <path d="M 589 445 H 608" stroke="#ffffff" stroke-width=".95" opacity=".67"/>
    <path d="M 608 445 V 641" stroke="#73797d" stroke-width=".72" opacity=".4"/>
    ${socketBolt(598,474,5.0)}
    ${socketBolt(598,548,5.0)}
    ${socketBolt(598,622,5.0)}

    <!-- tiny assembly seam before the two screw journals -->
    <rect x="612" y="456" width="3" height="173" rx="1" fill="#343a3e" opacity=".62"/>
  </g>`;
}

function mainHopper(): string {
  return `
  <g id="main-hopper" filter="url(#tse14-glass-depth)">
    <!-- lid / top inspection cap -->
    <rect x="646" y="119" width="24" height="11" rx="3" fill="url(#metalV)" stroke="#43494d" stroke-width="1"/>
    <rect x="641" y="129" width="35" height="20" rx="3" fill="url(#metalV)" stroke="#43494d" stroke-width="1"/>

    <!-- upper rolled rim -->
    <path d="M 559 151 Q 558 149 562 149 H 755 Q 760 149 760 155 V 164 Q 760 168 756 168 H 561 Q 558 168 558 164 Z"
          fill="url(#plateV)" stroke="#30363a" stroke-width="1.45"/>
    <path d="M 565 154 H 753" stroke="#fff" stroke-width="1.1" opacity=".75"/>
    <path d="M 566 165 H 752" stroke="#3d4347" stroke-width="1.05" opacity=".16"/>
    <path d="M 559 157 C 612 151 706 151 760 157" fill="none" stroke="#ffffff" stroke-width="1.4" opacity=".35"/>

    <!-- transparent hopper -->
    <path d="M 563 168 H 754 V 241 L 703 373 H 620 L 563 241 Z"
          fill="url(#hopperGlass)" stroke="#343a3e" stroke-width="1.45"/>
    <path d="M 579 173 V 236 L 627 367" fill="none" stroke="#ffffff" stroke-width="5" opacity=".18"/>
    <path d="M 731 174 V 238 L 692 367" fill="none" stroke="#8b9195" stroke-width="3.2" opacity=".10"/>
    <path d="M 574 240 C 607 238 709 238 744 241 L 696 372 H 626 Z"
          fill="url(#pelletFill)" opacity=".9"/>
    <path d="M 596 243 L 632 371" stroke="#f5d58f" stroke-width="4.7" opacity=".34"/>
    <path d="M 703 242 L 673 372" stroke="#b77c20" stroke-width="4.7" opacity=".14"/>

    <!-- hopper flange with visible studs/nuts -->
    <rect x="610" y="373" width="102" height="16" rx="3" fill="url(#plateV)" stroke="#383e42" stroke-width="1.2"/>
    <path d="M 613 377 H 709" stroke="#fff" stroke-width="1" opacity=".62"/>
    ${socketBolt(620,384,3.5)}
    ${socketBolt(703,384,3.5)}

    <!-- feed throat -->
    <rect x="620" y="389" width="79" height="65" rx="3" fill="url(#metalH)" stroke="#3a4044" stroke-width="1.2"/>
    <path d="M 629 391 V 452 M 689 391 V 452" stroke="#fff" stroke-width="1.2" opacity=".48"/>
    <rect x="681" y="392" width="16" height="60" fill="url(#sidePlane)" opacity=".22"/>
    <rect x="638" y="447" width="39" height="42" rx="2" fill="url(#endBell)" stroke="#3c4246" stroke-width="1.1"/>
  </g>`;
}

function sideFeeder(): string {
  return `
  <g id="side-feeder" filter="url(#tse14-metal-depth)">
    <!-- =========================================================
         SIDE FEEDER — reference-driven multi-plane reconstruction
         ========================================================= -->

    <!-- 1) TOP ROLLED LID / CAP -->
    <!-- bright top crown -->
    <path d="M 907 318
             Q 905 318 905 321
             V 323 Q 905 326 909 326
             H 991 Q 995 326 995 323
             V 321 Q 995 318 991 318 Z"
          fill="url(#plateV)" stroke="#33393d" stroke-width="1.18"/>
    <path d="M 911 320 H 989" stroke="#ffffff" stroke-width="1.15" opacity=".88"/>
    <path d="M 910 325 H 991" stroke="#62686c" stroke-width=".82" opacity=".52"/>

    <!-- rolled lower lip, slightly inset -->
    <path d="M 912 326 H 989
             L 986 337
             Q 985 339 982 339
             H 917 Q 914 339 914 336 Z"
          fill="url(#metalV)" stroke="#62686c" stroke-width=".9"/>
    <path d="M 916 329 H 986" stroke="#ffffff" stroke-width="1.0" opacity=".72"/>
    <path d="M 918 337 H 983" stroke="#4e5458" stroke-width=".7" opacity=".33"/>

    <!-- 2) CLEAR TAPERED HOPPER -->
    <path d="M 918 339 H 982
             L 972 370
             Q 971 373 967 374
             H 934 Q 930 373 929 370 Z"
          fill="url(#hopperGlass)" stroke="#3b4144" stroke-width="1.15"/>

    <!-- glass highlight and right-side shade -->
    <path d="M 926 342 L 934 368" stroke="#ffffff" stroke-width="3.6" opacity=".28"/>
    <path d="M 973 342 L 967 369" stroke="#6f7579" stroke-width="2.0" opacity=".11"/>

    <!-- material bed follows actual hopper taper -->
    <path d="M 927 344
             C 940 343 960 343 974 344
             L 967 370 H 936 Z"
          fill="url(#pelletFill)" opacity=".94"/>
    <path d="M 936 345 L 943 369" stroke="#f7d99a" stroke-width="2.4" opacity=".54"/>
    <path d="M 964 345 L 960 369" stroke="#b77c20" stroke-width="1.5" opacity=".15"/>

    <!-- 3) LEFT ADJUSTMENT / DRIVE CLUSTER -->
    <!-- cast triangular link bracket -->
    <path d="M 896 374 L 903 360 L 914 356 L 922 373 L 915 380 Z"
          fill="url(#deepMetal)" stroke="#4a5054" stroke-width="1.05"/>
    <path d="M 901 370 L 908 360 L 917 373" fill="none" stroke="#ffffff" stroke-width=".9" opacity=".38"/>

    <!-- two dominant round adjustment wheels -->
    <circle cx="905" cy="363" r="7.5" fill="url(#boltGrad)" stroke="#454b4f" stroke-width="1.05"/>
    <circle cx="897" cy="373" r="6.6" fill="url(#boltGrad)" stroke="#454b4f" stroke-width="1.05"/>
    <circle cx="905" cy="363" r="3.0" fill="#f5f6f4" stroke="#666c70" stroke-width=".78"/>
    <circle cx="897" cy="373" r="2.7" fill="#f5f6f4" stroke="#666c70" stroke-width=".75"/>
    <path d="M 902 360 L 908 366" stroke="#ffffff" stroke-width=".75" opacity=".6"/>

    <!-- small connector boss into flange -->
    <circle cx="915" cy="377" r="4.1" fill="url(#boltGrad)" stroke="#51575b" stroke-width=".9"/>

    <!-- 4) HOPPER-TO-BODY FLANGE -->
    <!-- darker underside first to create true assembly gap -->
    <rect x="920" y="386" width="67" height="4" rx="1.5" fill="#343a3e" opacity=".34"/>
    <rect x="918" y="373" width="70" height="17" rx="3" fill="url(#plateV)" stroke="#3b4144" stroke-width="1.15"/>
    <path d="M 922 377 H 984" stroke="#ffffff" stroke-width="1.05" opacity=".75"/>
    <path d="M 922 388 H 984" stroke="#596064" stroke-width=".8" opacity=".5"/>
    ${socketBolt(926,384,3.4)}
    ${socketBolt(981,384,3.4)}

    <!-- small underside bolt heads visible below flange in reference -->
    <ellipse cx="945" cy="391" rx="4.1" ry="2.3" fill="url(#boltGrad)" stroke="#595f63" stroke-width=".72"/>
    <ellipse cx="973" cy="391" rx="4.1" ry="2.3" fill="url(#boltGrad)" stroke="#595f63" stroke-width=".72"/>

    <!-- 5) MAIN CAST BODY -->
    <!-- left cast wedge / angled plane -->
    <path d="M 923 390 H 939
             V 451
             L 923 429 Z"
          fill="url(#metalH)" stroke="#3b4144" stroke-width="1.06"/>
    <path d="M 926 394 V 426 L 939 447" fill="none" stroke="#ffffff" stroke-width="1.1" opacity=".58"/>

    <!-- central front casting -->
    <path d="M 938 390 H 978
             Q 982 390 982 395
             V 446 Q 982 451 977 454
             H 943 Q 938 451 938 446 Z"
          fill="url(#feederBody)" stroke="#3b4144" stroke-width="1.15"/>

    <!-- recessed removable front cover -->
    <path d="M 943 395 H 973
             Q 976 395 976 399
             V 442 Q 975 447 970 448
             H 947 Q 942 446 942 441 V 400
             Q 942 396 943 395 Z"
          fill="url(#coverFace)" stroke="#9ca1a4" stroke-width=".82"/>
    <path d="M 947 399 H 971" stroke="#ffffff" stroke-width="1" opacity=".75"/>
    <path d="M 973 400 V 441" stroke="#81878b" stroke-width=".7" opacity=".38"/>
    <path d="M 948 447 H 969" stroke="#5a6064" stroke-width=".55" opacity=".25"/>

    <!-- right vertical side casting plane -->
    <path d="M 978 391 H 985 V 447
             Q 985 452 979 455 H 975
             L 978 446 Z"
          fill="url(#sidePlane)" stroke="#666c70" stroke-width=".75" opacity=".78"/>
    <path d="M 981 394 V 446" stroke="#ffffff" stroke-width=".72" opacity=".3"/>

    <!-- 6) LOWER DRIVE / GEAR BLOCK -->
    <!-- contact seam between body and lower block -->
    <rect x="938" y="448" width="48" height="3" rx="1.5" fill="#343a3e" opacity=".22"/>

    <path d="M 937 449 H 986 V 469
             Q 986 474 979 476 H 939 Z"
          fill="url(#metalV)" stroke="#3c4246" stroke-width="1.1"/>
    <path d="M 942 453 H 981" stroke="#ffffff" stroke-width="1.05" opacity=".7"/>
    <path d="M 980 451 H 986 V 469 Q 986 473 981 475 L 978 470 Z"
          fill="url(#sidePlane)" opacity=".42"/>

    <!-- right-side utility fitting / grease nipple style -->
    <rect x="981" y="418" width="8" height="22" rx="2" fill="url(#metalV)" stroke="#565c60" stroke-width=".92"/>
    <path d="M 983 413 H 987 L 990 419 H 980 Z" fill="url(#plateV)" stroke="#555b5f" stroke-width=".8"/>
    ${hexNut(985,438,2.7)}
    <circle cx="986" cy="469" r="4.1" fill="url(#boltGrad)" stroke="#53595d" stroke-width=".8"/>

    <!-- 7) VERTICAL THROAT / BARREL INTERFACE -->
    <!-- short dark gasket line -->
    <rect x="945" y="475" width="27" height="2.5" rx="1" fill="#33393d" opacity=".45"/>
    <!-- upper throat -->
    <path d="M 944 476 H 973 V 489
             Q 972 492 969 493 H 948
             Q 945 492 944 489 Z"
          fill="url(#metalH)" stroke="#3d4347" stroke-width="1.0"/>
    <!-- lower adapter -->
    <rect x="948" y="492" width="21" height="7" rx="1.5" fill="url(#plateV)" stroke="#555b5f" stroke-width=".78"/>
    <!-- final contact shadow to barrel -->
    <rect x="951" y="499" width="15" height="3" rx="1" fill="#42484c" opacity=".62"/>
  </g>`;
}
function screwRibbon(x: number, cy: number, phase = 0, mirror = false): string {
  const xx = x + phase;
  const top = cy - 29;
  const bottom = cy + 29;
  const tr = mirror ? ` transform="translate(0 ${2*cy}) scale(1 -1)"` : "";

  const crown = `
    M ${xx-8} ${top+4}
    C ${xx+1} ${top-3}, ${xx+10} ${top+1}, ${xx+18} ${cy-10}
    C ${xx+27} ${cy-1}, ${xx+32} ${cy+14}, ${xx+42} ${bottom-4}
    C ${xx+47} ${bottom+1}, ${xx+52} ${bottom+3}, ${xx+57} ${bottom+2}
    C ${xx+47} ${cy+11}, ${xx+42} ${cy-5}, ${xx+33} ${cy-17}
    C ${xx+23} ${cy-29}, ${xx+11} ${top-7}, ${xx-1} ${top+1} Z`;

  const bevel = `
    M ${xx+1} ${top+8}
    C ${xx+10} ${top+4}, ${xx+18} ${top+8}, ${xx+26} ${cy-3}
    C ${xx+34} ${cy+7}, ${xx+39} ${cy+18}, ${xx+48} ${bottom+1}
    C ${xx+42} ${cy+10}, ${xx+37} ${cy-2}, ${xx+30} ${cy-12}
    C ${xx+21} ${cy-23}, ${xx+12} ${top-2}, ${xx+1} ${top+8} Z`;

  return `
    <g${tr}>
      <path d="${bevel}" fill="url(#flightUnderside)" stroke="#4a5054" stroke-width="1.0" opacity=".96"/>
      <path d="${crown}" fill="url(#flight3D)" stroke="#3f4549" stroke-width="1.12"/>

      <path d="M ${xx-1} ${top+5}
               C ${xx+9} ${top-2}, ${xx+18} ${top+2}, ${xx+27} ${cy-9}
               C ${xx+35} ${cy}, ${xx+40} ${cy+12}, ${xx+47} ${bottom-6}"
            fill="none" stroke="url(#flightSpecular)" stroke-width="2.25" opacity=".96"/>

      <path d="M ${xx+10} ${bottom-4}
               C ${xx+20} ${cy+9}, ${xx+25} ${cy-5}, ${xx+19} ${top+8}"
            fill="none" stroke="#51575b" stroke-width="1.05" opacity=".78"/>

      <path d="M ${xx+4} ${top+12}
               C ${xx+13} ${top+8}, ${xx+20} ${top+12}, ${xx+27} ${cy+2}"
            fill="none" stroke="#31373b" stroke-width=".95" opacity=".28"/>
    </g>`;
}

function screwFlights(x0: number, x1: number, cy: number, pitch = 43, phase = 0, mirror = false): string {
  let out = "";
  for (let x = x0; x <= x1; x += pitch) out += screwRibbon(x, cy, phase, mirror);
  return out;
}


function intermeshBridge(x: number, cy = 552): string {
  // Narrow crossing land used only where the two flights visually overlap.
  // It gives the twin-screw center line the denser "woven" look of the reference.
  return `
    <g class="intermesh-bridge">
      <path d="
        M ${x-13} ${cy-31}
        C ${x-3} ${cy-24}, ${x+8} ${cy-12}, ${x+18} ${cy+2}
        C ${x+28} ${cy+16}, ${x+36} ${cy+24}, ${x+45} ${cy+30}
        L ${x+55} ${cy+25}
        C ${x+45} ${cy+17}, ${x+37} ${cy+8}, ${x+28} ${cy-5}
        C ${x+18} ${cy-18}, ${x+7} ${cy-29}, ${x-4} ${cy-36} Z"
        fill="url(#flight3D)" stroke="#4b5155" stroke-width="1.0" opacity=".92"/>
      <path d="
        M ${x-6} ${cy-30}
        C ${x+6} ${cy-22}, ${x+17} ${cy-9}, ${x+27} ${cy+4}
        C ${x+36} ${cy+16}, ${x+43} ${cy+22}, ${x+50} ${cy+26}"
        fill="none" stroke="url(#flightSpecular)" stroke-width="1.8" opacity=".8"/>
    </g>`;
}

function topHeater(x: number, w: number, capX?: number): string {
  const cx = capX ?? x + w * 0.52;
  return `
    <g class="top-heater" filter="url(#microCastShadow)">
      <!-- 3-D top plane -->
      <path d="M ${x+3} 465 L ${x+8} 461 H ${x+w-6} L ${x+w-2} 465 Z"
            fill="url(#topPlane)" stroke="#777d81" stroke-width=".72"/>

      <!-- front body -->
      <rect x="${x}" y="465" width="${w}" height="28" rx="4.5"
            fill="url(#heaterFace)" stroke="#353a3d" stroke-width="1.28"/>
      <path d="M ${x+3} 470 H ${x+w-3}" stroke="#fff" stroke-width="1.1" opacity=".84"/>
      <path d="M ${x+3} 489 H ${x+w-3}" stroke="#596064" stroke-width=".75" opacity=".52"/>

      <!-- narrow right side plane -->
      <path d="M ${x+w-5} 468 L ${x+w} 465 V 490 L ${x+w-5} 493 Z"
            fill="url(#sidePlane)" opacity=".58"/>

      ${hexNut(x+9, 487, 2.45)}
      ${hexNut(x+w-9, 487, 2.45)}
      <circle cx="${x+4.5}" cy="472" r="1.35" fill="url(#boltGrad)" stroke="#596064" stroke-width=".5"/>
      <circle cx="${x+w-4.5}" cy="472" r="1.35" fill="url(#boltGrad)" stroke="#596064" stroke-width=".5"/>

      <!-- stepped heater / sensor cap -->
      <rect x="${f(cx-13)}" y="453" width="26" height="13" rx="4" fill="url(#plateV)" stroke="#464c50" stroke-width=".95"/>
      <rect x="${f(cx-10)}" y="450" width="20" height="5" rx="2" fill="url(#metalV)" stroke="#5c6266" stroke-width=".75"/>
      <path d="M ${f(cx-8)} 454 H ${f(cx+8)}" stroke="#fff" stroke-width=".9" opacity=".7"/>
      <path d="M ${f(cx-8)} 462 H ${f(cx+8)}" stroke="#70767a" stroke-width=".75"/>
    </g>`;
}

function bottomHeater(x: number, w: number): string {
  return `
    <g class="bottom-heater" filter="url(#microCastShadow)">
      <!-- small upper ledge -->
      <path d="M ${x+3} 615 L ${x+7} 612 H ${x+w-6} L ${x+w-2} 615 Z"
            fill="url(#topPlane)" stroke="#777d81" stroke-width=".68"/>

      <rect x="${x}" y="615" width="${w}" height="39" rx="3"
            fill="url(#heaterFace)" stroke="#353a3d" stroke-width="1.28"/>
      <path d="M ${x+3} 619 H ${x+w-3}" stroke="#fff" stroke-width="1.0" opacity=".72"/>

      <!-- inset service face -->
      <rect x="${x+8}" y="620" width="${w-16}" height="28" rx="2"
            fill="url(#coverFace)" stroke="#9ba0a3" stroke-width=".78"/>
      <path d="M ${x+10} 623 H ${x+w-10}" stroke="#fff" stroke-width=".7" opacity=".55"/>
      <path d="M ${x+10} 646 H ${x+w-10}" stroke="#6f7579" stroke-width=".7" opacity=".42"/>

      <!-- right bevel and lower contact shadow -->
      <path d="M ${x+w-5} 618 L ${x+w} 615 V 651 L ${x+w-5} 654 Z" fill="url(#sidePlane)" opacity=".55"/>
      <rect x="${x+3}" y="651" width="${w-6}" height="3" rx="1" fill="#353b3f" opacity=".18"/>

      ${heaterBolt(x + w/2, 636)}
    </g>`;
}

function zoneJoint(x: number): string {
  return `
    <g class="zone-joint">
      <!-- top clamp strip -->
      <rect x="${x-3.5}" y="463" width="7" height="32" rx="1.5" fill="url(#jointMetal)" stroke="#5c6266" stroke-width=".78"/>
      <path d="M ${x-1.7} 465 V 493" stroke="#fff" stroke-width=".65" opacity=".48"/>
      <circle cx="${x}" cy="487" r="2.35" fill="url(#boltGrad)" stroke="#555b5f" stroke-width=".68"/>
      <!-- bottom clamp strip -->
      <rect x="${x-3.5}" y="614" width="7" height="41" rx="1.5" fill="url(#jointMetal)" stroke="#5c6266" stroke-width=".78"/>
      <path d="M ${x-1.7} 616 V 653" stroke="#fff" stroke-width=".65" opacity=".48"/>
      <circle cx="${x}" cy="638" r="2.35" fill="url(#boltGrad)" stroke="#555b5f" stroke-width=".68"/>
    </g>`;
}

function barrel(): string {
  const tops = [
    [704,94,750],[804,96,853],[902,95,936],[1002,118,1064],
    [1124,106,1187],[1236,100,1289],[1336,104,1389]
  ].map(v => topHeater(v[0], v[1], v[2])).join("");

  const bottoms = [
    [612,92],[708,92],[804,92],[900,92],
    [996,92],[1092,92],[1188,92],[1284,92],[1380,58]
  ].map(v => bottomHeater(v[0], v[1])).join("");

  const joints = [704,800,896,992,1088,1184,1280,1376].map(zoneJoint).join("");

  return `
  <g id="barrel" filter="url(#tse14-barrel-depth)">
    <!-- cutaway carrier begins almost immediately after gearbox flange -->
    <rect x="605" y="490" width="838" height="125" rx="6"
          fill="url(#barrelFrame)" stroke="#2f3538" stroke-width="1.46"/>
    <path d="M 609 490 L 615 486 H 1437 L 1443 490 Z"
          fill="url(#barrelTopPlane)" stroke="#686e72" stroke-width=".62"/>
    <path d="M 609 615 H 1440 L 1435 619 H 615 Z"
          fill="url(#barrelBottomPlane)" opacity=".72"/>
    <rect x="610" y="491" width="832" height="121" rx="3"
          fill="#515659" stroke="#2e3437" stroke-width="1.05"/>
    <rect x="616" y="497" width="821" height="111" rx="3"
          fill="url(#barrelInterior)"/>
    <path d="M 618 499 H 1434" stroke="#ffffff" stroke-width="1.1" opacity=".16"/>
    <path d="M 618 607 H 1434" stroke="#22282b" stroke-width="2.0" opacity=".18"/>

    <!-- flange-to-journal joint, matching reference: almost no empty axial gap -->
    <rect x="605" y="474" width="11" height="181" rx="2"
          fill="url(#metalH)" stroke="#343a3e" stroke-width="1.18"/>
    <path d="M 608 478 V 651" stroke="#fff" stroke-width=".75" opacity=".48"/>

    <!-- upper and lower journal collars directly behind bolted flange -->
    <rect x="615" y="503" width="23" height="47" rx="10"
          fill="url(#shaftCore3D)" stroke="#53595d" stroke-width="1.0"/>
    <rect x="615" y="558" width="23" height="46" rx="10"
          fill="url(#shaftCore3D)" stroke="#53595d" stroke-width="1.0"/>
    <path d="M 619 506 V 547 M 619 561 V 601" stroke="#fff" stroke-width=".8" opacity=".5"/>
    <path d="M 634 506 V 547 M 634 561 V 601" stroke="#73797c" stroke-width=".66" opacity=".42"/>

    <!-- gold heater seams -->
    <path d="M 611 495 H 1442" stroke="#d3a13c" stroke-width="4" opacity=".76"/>
    <path d="M 611 612 H 1442" stroke="#d3a13c" stroke-width="3" opacity=".62"/>

    <!-- screw shafts begin right after the journals -->
    <g id="upper-screw" clip-path="url(#upperClip)" filter="url(#tse14-chrome-depth)">
      <rect x="632" y="499" width="810" height="54" rx="22"
            fill="url(#shaftCore3D)" stroke="#555b5f" stroke-width="1.25"/>
      <path d="M 642 504 H 1430" stroke="#ffffff" stroke-width="1.35" opacity=".25"/>
      ${screwFlights(636, 1438, 527, 42, 0, false)}
    </g>
    <g id="lower-screw" clip-path="url(#lowerClip)" filter="url(#tse14-chrome-depth)">
      <rect x="632" y="554" width="810" height="53" rx="22"
            fill="url(#shaftCore3D)" stroke="#555b5f" stroke-width="1.25"/>
      <path d="M 642 559 H 1430" stroke="#ffffff" stroke-width="1.2" opacity=".22"/>
      ${screwFlights(637, 1438, 578, 42, 15, true)}
    </g>

    <!-- The reference drawing carries a further "dense intermeshing" layer here,
         clipped to #intermeshClip. No such clip path is ever defined, so a
         browser drops the layer outright and it is absent from the reference
         render this template was matched against. It is left out rather than
         carried across dead: react-native-svg ignores the dangling reference
         instead of dropping the layer, so keeping it would have put marks on
         the native drawing that the drawing it came from has never shown.
         intermeshBridge() below is what it drew, if it is ever wanted back. -->

    <path d="M 850 549 C 900 543 945 547 989 566 C 1031 585 1085 588 1135 569 C 1191 548 1240 543 1293 555"
          fill="none" stroke="#f8f8f6" stroke-width="2.0" opacity=".47"/>
    <path d="M 852 567 C 904 579 950 577 998 558 C 1049 538 1103 539 1153 558 C 1206 579 1253 580 1302 566"
          fill="none" stroke="#606669" stroke-width="1.3" opacity=".54"/>

    ${tops}
    ${bottoms}
    ${joints}
  </g>`;
}

function ventDie(): string {
  return `
  <g id="vent" filter="url(#tse14-metal-depth)">
    <!-- vent body -->
    <rect x="1324" y="376" width="45" height="89" rx="3"
          fill="url(#metalH)" stroke="#373d41" stroke-width="1.25"/>
    <rect x="1333" y="350" width="22" height="28" rx="3"
          fill="url(#metalV)" stroke="#707579" stroke-width=".95"/>

    <!-- bolted vent flange -->
    <rect x="1312" y="400" width="58" height="15" rx="3"
          fill="url(#plateV)" stroke="#41474b" stroke-width="1.05"/>
    ${socketBolt(1321,411,3.2)} ${socketBolt(1360,411,3.2)}
    <rect x="1330" y="417" width="30" height="47"
          fill="url(#mesh)" stroke="#4b5155" stroke-width="1"/>
  </g>

  <g id="die" filter="url(#tse14-metal-depth)">
    <!-- screen / breaker flange -->
    <rect x="1438" y="476" width="21" height="178"
          fill="url(#metalV)" stroke="#343a3e" stroke-width="1.35"/>
    <rect x="1458" y="483" width="42" height="164"
          fill="url(#metalH)" stroke="#343a3e" stroke-width="1.35"/>
    <rect x="1466" y="505" width="28" height="118"
          fill="url(#mesh)" stroke="#555b5f" stroke-width=".9"/>

    <!-- tapered die body -->
    <path d="M 1500 477 H 1520 L 1572 526 V 610 L 1520 653 H 1500 Z"
          fill="url(#metalV)" stroke="#343a3e" stroke-width="1.5"/>
    <path d="M 1517 493 L 1560 533 V 602 L 1517 638 Z"
          fill="url(#dieInset)" stroke="#929698" stroke-width="1"/>
    <path d="M 1560 533 L 1572 526 V 610 L 1560 602 Z" fill="url(#sidePlane)" opacity=".48"/>
    <path d="M 1518 638 L 1560 602" stroke="#3f4549" stroke-width="1.3" opacity=".15"/>

    <!-- die face bolts -->
    ${socketBolt(1554,548,4.4)}
    ${socketBolt(1554,590,4.4)}

    <!-- outlet collar + brass tip -->
    <rect x="1564" y="526" width="17" height="82" rx="3"
          fill="url(#metalH)" stroke="#41474b" stroke-width="1.05"/>
    <rect x="1578" y="545" width="13" height="43" rx="2"
          fill="url(#endBell)" stroke="#41474b" stroke-width=".95"/>
    <rect x="1590" y="554" width="44" height="23" rx="4"
          fill="url(#gold)" stroke="#88651f" stroke-width="1.15"/>
  </g>`;
}


function motorDetailLayer(): string {
  return `
  <g id="motor-detail-layer" style="pointer-events: none">
    <path d="M 48 493 C 35 509 30 531 30 557 C 30 586 36 610 49 626"
          fill="none" stroke="#ffffff" stroke-width="1.6" opacity=".58"/>
    <path d="M 57 492 C 46 511 42 533 42 557 C 42 584 47 607 57 624"
          fill="none" stroke="#d8dcda" stroke-width="1.05" opacity=".52"/>
    <path d="M 66 491 C 59 511 56 533 56 557 C 56 582 59 603 66 621"
          fill="none" stroke="#5a6064" stroke-width=".95" opacity=".34"/>
    <path d="M 74 489 V 626" stroke="#ffffff" stroke-width=".95" opacity=".44"/>

    <path d="M 35 501 C 26 521 22 541 22 557 C 22 583 28 607 38 620"
          fill="none" stroke="#ffffff" stroke-width="2.7" opacity=".22"/>
    <path d="M 67 494 V 623" stroke="#2f3538" stroke-width="1.8" opacity=".08"/>

    <rect x="75" y="489" width="6" height="137" rx="2" fill="#555b5f" opacity=".10"/>
    <rect x="211" y="489" width="7" height="137" rx="2" fill="#33393d" opacity=".14"/>

    <path d="M 83 493.00 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 499.05 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 505.10 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 511.15 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 517.20 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 523.25 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 529.30 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 535.35 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 541.40 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 547.45 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 553.50 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 559.55 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 565.60 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 571.65 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 577.70 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 583.75 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 589.80 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 595.85 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 601.90 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 607.95 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/><path d="M 83 614.00 H 208" stroke="#ffffff" stroke-width=".42" opacity=".24"/>

    <ellipse cx="228" cy="557" rx="10.8" ry="58" fill="none" stroke="#ffffff" stroke-width=".72" opacity=".26"/>
    <ellipse cx="233" cy="557" rx="12.7" ry="55.5" fill="none" stroke="#ffffff" stroke-width=".82" opacity=".36"/>
    <ellipse cx="239" cy="557" rx="7.5" ry="47.5" fill="none" stroke="#5b6165" stroke-width=".85" opacity=".46"/>

    <path d="M 113 451 H 187" stroke="#ffffff" stroke-width=".9" opacity=".62"/>
    <path d="M 121 464 V 487" stroke="#6a7074" stroke-width=".6" opacity=".32"/>
    <path d="M 179 464 V 487" stroke="#6a7074" stroke-width=".6" opacity=".32"/>

    <path d="M 54 650 H 230 L 238 655 H 62 Z" fill="#ffffff" opacity=".20"/>
    <path d="M 60 653 H 233" stroke="#ffffff" stroke-width=".9" opacity=".38"/>
    <path d="M 38 681 H 251 L 259 677 H 47 Z" fill="#ffffff" opacity=".22"/>
    <path d="M 46 684 H 254" stroke="#3a4044" stroke-width=".85" opacity=".14"/>

    <path d="M 269 527 V 590" stroke="#5d6367" stroke-width=".85" opacity=".52"/>
    <path d="M 300 527 V 590" stroke="#5d6367" stroke-width=".85" opacity=".52"/>
    <path d="M 322 533 V 585" stroke="#ffffff" stroke-width=".78" opacity=".42"/>
    <path d="M 340 533 V 585" stroke="#555b5f" stroke-width=".72" opacity=".44"/>
    <path d="M 264 544 H 304" stroke="#ffffff" stroke-width=".6" opacity=".24"/>
    <path d="M 321 544 H 342" stroke="#ffffff" stroke-width=".56" opacity=".22"/>
    <path d="M 264 572 H 304" stroke="#2f3538" stroke-width=".6" opacity=".18"/>
    <path d="M 321 573 H 342" stroke="#2f3538" stroke-width=".55" opacity=".16"/>

    <rect x="184" y="491" width="25" height="133" rx="8" fill="#13181b" opacity=".06"/>
  </g>`;
}

function gearboxDetailLayer(): string {
  return `
  <g id="gearbox-detail-layer" style="pointer-events: none">
    <path d="M 362 392 H 505 Q 514 392 519 398" fill="none" stroke="#ffffff" stroke-width="1.28" opacity=".54"/>
    <path d="M 351 405 V 684" stroke="#ffffff" stroke-width="1.0" opacity=".44"/>
    <path d="M 527 412 V 677" stroke="#4b5155" stroke-width="1.08" opacity=".28"/>
    <path d="M 364 399 H 513" stroke="#ffffff" stroke-width=".86" opacity=".34"/>

    <path d="M 350 402 L 363 390 V 692" fill="none" stroke="#666c70" stroke-width=".82" opacity=".42"/>
    <path d="M 357 401 V 690" stroke="#ffffff" stroke-width=".62" opacity=".18"/>

    <path d="M 378 447 H 473" stroke="#ffffff" stroke-width="1.12" opacity=".58"/>
    <path d="M 381 448 V 662" stroke="#ffffff" stroke-width=".55" opacity=".16"/>
    <path d="M 474 451 V 657" stroke="#555b5f" stroke-width=".95" opacity=".24"/>
    <path d="M 382 665 H 469" stroke="#4b5155" stroke-width=".84" opacity=".20"/>
    <path d="M 470 448 Q 476 449 476 455 V 657 Q 475 664 469 665"
          fill="none" stroke="#2b3134" stroke-width="1.8" opacity=".08"/>

    <path d="M 480 444 V 665" stroke="#ffffff" stroke-width=".70" opacity=".42"/>
    <path d="M 487 446 H 521" stroke="#ffffff" stroke-width=".78" opacity=".22"/>
    <path d="M 524 445 V 664" stroke="#4f5559" stroke-width=".80" opacity=".32"/>
    <path d="M 520 448 V 662" stroke="#22282b" stroke-width=".6" opacity=".10"/>

    <circle cx="436" cy="514" r="11.7" fill="none" stroke="#ffffff" stroke-width=".75" opacity=".28"/>
    <circle cx="436" cy="600" r="10.0" fill="none" stroke="#ffffff" stroke-width=".72" opacity=".24"/>

    <path d="M 289 694 H 579" stroke="#ffffff" stroke-width=".9" opacity=".30"/>
    <path d="M 303 658 C 323 647 334 629 340 605" fill="none" stroke="#ffffff" stroke-width="1.0" opacity=".22"/>
    <path d="M 520 656 H 544" stroke="#ffffff" stroke-width=".9" opacity=".22"/>

    <path d="M 548 451 C 557 447 565 448 572 453" fill="none" stroke="#ffffff" stroke-width="1.2" opacity=".48"/>
    <path d="M 549 473 C 559 470 566 470 573 474" fill="none" stroke="#ffffff" stroke-width=".90" opacity=".22"/>
    <path d="M 549 489 C 559 486 566 486 572 490" fill="none" stroke="#ffffff" stroke-width=".90" opacity=".30"/>
    <path d="M 549 589 C 558 593 565 593 572 589" fill="none" stroke="#50565a" stroke-width=".94" opacity=".32"/>
    <path d="M 549 626 C 557 631 564 631 570 626" fill="none" stroke="#454b4f" stroke-width="1.02" opacity=".34"/>

    <rect x="572" y="454" width="2.6" height="176" fill="#2f3538" opacity=".16"/>
    <rect x="583" y="452" width="2.2" height="184" fill="#30363a" opacity=".22"/>
    <path d="M 589 445 H 607" stroke="#ffffff" stroke-width=".84" opacity=".44"/>
    <path d="M 591 639 H 607" stroke="#2e3437" stroke-width=".7" opacity=".14"/>
    <path d="M 608 446 V 640" stroke="#3e4448" stroke-width=".78" opacity=".34"/>

    <circle cx="593" cy="470" r="1.6" fill="#ffffff" opacity=".46"/>
    <circle cx="593" cy="611" r="1.6" fill="#ffffff" opacity=".38"/>
  </g>`;
}

function hopperDetailLayer(): string {
  return `
  <g id="hopper-detail-layer" style="pointer-events: none">
    <!-- top rim depth -->
    <path d="M 565 151 H 753" stroke="#ffffff" stroke-width="1.35" opacity=".55"/>
    <path d="M 563 168 H 754" stroke="#51575b" stroke-width=".75" opacity=".26"/>

    <!-- glass faceting -->
    <path d="M 585 170 L 586 239 L 630 370" fill="none" stroke="#ffffff" stroke-width="3.8" opacity=".15"/>
    <path d="M 710 170 L 708 240 L 681 370" fill="none" stroke="#ffffff" stroke-width="2.8" opacity=".10"/>
    <path d="M 739 171 L 735 239 L 695 369" fill="none" stroke="#565c60" stroke-width="2.2" opacity=".08"/>

    <!-- material top surface -->
    <path d="M 574 240 C 618 236 702 236 744 241 C 706 247 615 247 574 240 Z"
          fill="#f0cf83" opacity=".44"/>
    <path d="M 581 241 C 621 239 699 239 737 242" fill="none" stroke="#f7dfaa" stroke-width="1.2" opacity=".48"/>

    <!-- flange underside / throat contact -->
    <rect x="611" y="387" width="100" height="3" rx="1" fill="#343a3e" opacity=".18"/>
    <path d="M 623 391 V 451 M 696 391 V 451" stroke="#4d5357" stroke-width=".65" opacity=".26"/>
  </g>`;
}

function sideFeederDetailLayer(): string {
  return `
  <g id="side-feeder-detail-layer" style="pointer-events: none">
    <!-- top cap cylindrical depth -->
    <path d="M 910 319 C 934 316 968 316 991 319" fill="none" stroke="#ffffff" stroke-width="1.1" opacity=".50"/>
    <path d="M 914 327 H 987" stroke="#50565a" stroke-width=".7" opacity=".24"/>

    <!-- hopper panel highlights -->
    <path d="M 925 341 L 934 369" stroke="#ffffff" stroke-width="2.9" opacity=".22"/>
    <path d="M 973 341 L 966 369" stroke="#555b5f" stroke-width="1.5" opacity=".10"/>
    <path d="M 928 344 C 942 342 960 342 974 344" fill="none" stroke="#f7dea4" stroke-width=".9" opacity=".48"/>

    <!-- more mechanical adjustment linkage -->
    <path d="M 897 373 L 904 363 L 914 376" fill="none" stroke="#3f4549" stroke-width="2.6" opacity=".45"/>
    <circle cx="904" cy="363" r="2.1" fill="#f7f7f5" stroke="#5d6367" stroke-width=".65"/>
    <circle cx="897" cy="373" r="1.9" fill="#f7f7f5" stroke="#5d6367" stroke-width=".65"/>

    <!-- flange underside shadow gives reference-style gap -->
    <rect x="921" y="389" width="66" height="3" rx="1" fill="#272d30" opacity=".18"/>

    <!-- body left-plane and right-plane edge lights -->
    <path d="M 924 393 V 427 L 939 449" fill="none" stroke="#ffffff" stroke-width=".9" opacity=".50"/>
    <path d="M 979 394 V 447" stroke="#4c5256" stroke-width=".75" opacity=".32"/>
    <path d="M 943 397 H 972" stroke="#ffffff" stroke-width=".8" opacity=".52"/>

    <!-- lower block top face and contact shadow -->
    <path d="M 937 449 L 942 445 H 982 L 986 449 Z" fill="#ffffff" opacity=".18"/>
    <rect x="939" y="475" width="46" height="2.5" rx="1" fill="#30363a" opacity=".18"/>
    <path d="M 947 476 V 491 M 969 476 V 491" stroke="#50565a" stroke-width=".65" opacity=".28"/>
  </g>`;
}

function barrelDetailLayer(): string {
  return `
  <g id="barrel-detail-layer" style="pointer-events: none">
    <!-- stronger upper/lower carrier lips -->
    <path d="M 613 490 H 1437" stroke="#ffffff" stroke-width="1.05" opacity=".30"/>
    <path d="M 613 614 H 1438" stroke="#2f3538" stroke-width="1.3" opacity=".14"/>

    <!-- journal-to-screw axial seams -->
    <rect x="637" y="503" width="2.6" height="47" fill="#30363a" opacity=".24"/>
    <rect x="637" y="558" width="2.6" height="46" fill="#30363a" opacity=".24"/>
    <path d="M 641 504 H 1430" stroke="#ffffff" stroke-width=".8" opacity=".14"/>
    <path d="M 641 603 H 1430" stroke="#33393d" stroke-width=".75" opacity=".14"/>

    <!-- thin axial center line helps screws read as two real shafts -->
    <path d="M 640 553 H 1437" stroke="#252b2e" stroke-width="1.2" opacity=".26"/>

    <!-- heater rail contact shadows -->
    <rect x="704" y="492" width="735" height="2.4" rx="1" fill="#2e3437" opacity=".12"/>
    <rect x="612" y="613" width="826" height="2.4" rx="1" fill="#2e3437" opacity=".10"/>

    <!-- periodic barrel block seams -->
    ${[800,896,992,1088,1184,1280,1376].map(x => `
      <path d="M ${x} 496 V 611" stroke="#1f2528" stroke-width=".8" opacity=".13"/>
      <path d="M ${x+1.6} 497 V 610" stroke="#ffffff" stroke-width=".55" opacity=".13"/>
    `).join("")}
  </g>`;
}

function ventDieDetailLayer(): string {
  return `
  <g id="vent-die-detail-layer" style="pointer-events: none">
    <!-- vent cap depth -->
    <path d="M 1315 402 H 1367" stroke="#ffffff" stroke-width=".85" opacity=".48"/>
    <path d="M 1334 352 V 376" stroke="#ffffff" stroke-width=".7" opacity=".44"/>
    <path d="M 1358 419 V 462" stroke="#30363a" stroke-width=".75" opacity=".22"/>

    <!-- screen-pack and die axial separations -->
    <rect x="1457" y="486" width="2.4" height="158" fill="#30363a" opacity=".20"/>
    <rect x="1498" y="491" width="2.5" height="148" fill="#30363a" opacity=".18"/>

    <!-- die top/side planes -->
    <path d="M 1502 478 H 1519 L 1570 526 L 1562 530 L 1518 491 H 1503 Z"
          fill="#ffffff" opacity=".20"/>
    <path d="M 1562 530 L 1571 526 V 609 L 1561 602 Z"
          fill="#4c5256" opacity=".13"/>

    <!-- brass outlet highlight -->
    <path d="M 1594 558 H 1630" stroke="#fff1bd" stroke-width="1.2" opacity=".64"/>
    <path d="M 1593 574 H 1631" stroke="#8d671f" stroke-width=".8" opacity=".25"/>
  </g>`;
}


/**
 * Part names and their leader lines.
 *
 * The label set is the drawing's own — MOTOR, GEAR BOX, MAIN FEEDER / HOPPER,
 * SIDE FEEDER, HEATING ZONES, the numbered barrel zones, BARREL and DIE — and
 * nothing beyond it.
 *
 * Colour comes from the caller rather than the drawing. The machine itself is
 * a light technical illustration in both themes, the way a drawing sheet is,
 * but text that sits off the machine is read against the console behind it and
 * has to follow the console.
 *
 * Each leader now runs the full distance to its label. It used to stop short
 * of a marker dot that filled the last stretch; that dot is a wired instrument
 * pad now, and pads belong to the registry, not to the artwork.
 */
function annotations(ink: string): string {
  return `
  <g font-family="Inter_600SemiBold, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
     fill="${ink}" text-anchor="middle" font-weight="700">
    <g font-size="17" letter-spacing="3">
      <text x="142" y="341">MOTOR</text>
      <text x="436" y="275">GEAR BOX</text>
      <text x="660" y="42">MAIN FEEDER /</text>
      <text x="660" y="67">HOPPER</text>
      <text x="944" y="191">SIDE FEEDER</text>
      <text x="1182" y="296">HEATING ZONES</text>
    </g>
    <g font-size="16" letter-spacing="2">
      <text x="744" y="747">Z1</text>
      <text x="920" y="747">Z2</text>
      <text x="1033" y="747">Z3</text>
      <text x="1161" y="747">Z4</text>
      <text x="1278" y="747">Z5</text>
      <text x="981" y="834">BARREL</text>
      <text x="1499" y="747">DIE</text>
    </g>
  </g>

  <g fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="8 6" opacity=".85">
    <path d="M 142 351 V 424"/>
    <path d="M 436 286 V 350"/>
    <path d="M 659 78 V 112"/>
    <path d="M 944 205 V 290"/>
    <path d="M 1182 309 V 426"/>
    <path d="M 1059 426 V 370 Q 1059 352 1077 352 H 1267 Q 1285 352 1285 370 V 426"/>

    <path d="M 744 660 V 731"/>
    <path d="M 920 660 V 731"/>
    <path d="M 1033 660 V 731"/>
    <path d="M 1161 660 V 731"/>
    <path d="M 1278 660 V 731"/>
    <path d="M 1364 660 V 731"/>
    <path d="M 1499 660 V 731"/>

    <path d="M 1364 731 V 766 Q 1364 783 1347 783 H 622 Q 605 783 605 766 V 750"/>
    <path d="M 981 785 V 813"/>
  </g>`;
}

/**
 * The iteration-14 lighting pass.
 *
 * Form shadows and edge highlights that the per-part filters cannot produce,
 * because they describe where this machine sits rather than what it is made
 * of: the contact shadow it casts on the floor, the way the motor's barrel
 * turns away from the light, the top plane of the gearbox catching it.
 *
 * Drawn over the machine and under the labels, and never over a pad — it takes
 * no pointer events, so it cannot come between a pad and a cursor.
 */
function lightingOverlay(): string {
  return `
  <g id="tse14-lighting-overlay" style="pointer-events: none">
    <ellipse cx="805" cy="715" rx="650" ry="18"
      fill="url(#tse14-contact-shadow)" filter="url(#tse14-ground-blur)" opacity=".62"/>

    <path d="M 42 496 C 28 513 24 534 24 558 C 24 589 31 614 45 631"
      fill="none" stroke="url(#tse14-overlay-white)" stroke-width="5.8" opacity=".34"/>
    <path d="M 197 489 C 208 512 211 536 211 558 C 211 583 207 607 198 625"
      fill="none" stroke="#11171a" stroke-width="6.5" opacity=".075"/>
    <rect x="85" y="489" width="23" height="136" rx="8" fill="#ffffff" opacity=".07"/>
    <rect x="185" y="489" width="20" height="136" rx="8" fill="#13181b" opacity=".05"/>

    <path d="M 356 401 L 366 393 H 506 Q 516 393 521 399 L 513 404 H 364 Z"
      fill="url(#tse14-overlay-white)" opacity=".40"/>
    <path d="M 514 405 H 526 V 680 L 517 686 Z"
      fill="url(#tse14-overlay-dark)" opacity=".50"/>
    <path d="M 378 444 H 469"
      fill="none" stroke="#ffffff" stroke-width="1.7" opacity=".14"/>
    <path d="M 479 444 H 526"
      fill="none" stroke="#ffffff" stroke-width="1.2" opacity=".10"/>

    <path d="M 546 454 C 560 447 573 449 582 457"
      fill="none" stroke="#ffffff" stroke-width="2.2" opacity=".18"/>
    <path d="M 550 620 C 560 628 570 628 578 622"
      fill="none" stroke="#11171a" stroke-width="2.0" opacity=".08"/>
  </g>`;
}

/** What the caller wants drawn, beyond the machine itself. */
export type TwinScrewArtworkOptions = {
  /**
   * Draw the sheet and its engineering grid.
   *
   * Left off on the machine canvas: the workspace paints its own grid behind
   * the stage, and a second one inside the artwork beats against it.
   */
  showBackground?: boolean;
  /**
   * Draw the part names and their leader lines.
   *
   * Off on the mapping canvas, where the cards and trails already name every
   * point and a second set of names competes with them. On wherever the
   * drawing is shown on its own.
   */
  showPartLabels?: boolean;
  /** Colour for the part names and leaders. Follows the console, not the sheet. */
  ink?: string;
  /** Fill for the sheet, when `showBackground` is set. */
  sheet?: string;
};

/**
 * The machine, as SVG source.
 *
 * Deterministic for a given set of options: the same options always produce
 * the same string, which is what lets the template parse it once per option
 * set and hold on to the parsed nodes.
 */
export function buildTwinScrewExtruderArtwork({
  showBackground = false,
  showPartLabels = false,
  ink = '#565c63',
  sheet = 'url(#bg)',
}: TwinScrewArtworkOptions = {}): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fbfbfa"/>
      <stop offset="1" stop-color="#f8f8f6"/>
    </linearGradient>

    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 H 0 V 32" fill="none" stroke="#dde1e4" stroke-width=".65" opacity=".78"/>
    </pattern>

    <linearGradient id="metalH" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f9f9f7"/>
      <stop offset=".14" stop-color="#c8cbcb"/>
      <stop offset=".32" stop-color="#ffffff"/>
      <stop offset=".56" stop-color="#c4c7c6"/>
      <stop offset=".72" stop-color="#f5f5f3"/>
      <stop offset="1" stop-color="#a6aaab"/>
    </linearGradient>

    <linearGradient id="metalV" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".22" stop-color="#e4e5e3"/>
      <stop offset=".52" stop-color="#f9f9f7"/>
      <stop offset="1" stop-color="#b1b5b5"/>
    </linearGradient>

    <linearGradient id="plateV" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fafaf8"/>
      <stop offset=".38" stop-color="#d1d4d3"/>
      <stop offset=".55" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#b5b9b9"/>
    </linearGradient>

    <linearGradient id="baseMetal" x1="0" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".18" stop-color="#e8e9e7"/>
      <stop offset=".56" stop-color="#f7f7f5"/>
      <stop offset="1" stop-color="#aeb3b4"/>
    </linearGradient>

    <linearGradient id="deepMetal" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#aeb3b4"/>
      <stop offset=".22" stop-color="#f4f5f3"/>
      <stop offset=".52" stop-color="#8f9598"/>
      <stop offset=".76" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#777d80"/>
    </linearGradient>

    <linearGradient id="coverFace" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".52" stop-color="#f0f1ef"/>
      <stop offset="1" stop-color="#d1d4d3"/>
    </linearGradient>

    <linearGradient id="jointMetal" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8b9194"/>
      <stop offset=".35" stop-color="#f4f5f3"/>
      <stop offset=".65" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#7a8084"/>
    </linearGradient>

    <linearGradient id="feederBody" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".28" stop-color="#d5d8d7"/>
      <stop offset=".6" stop-color="#f6f6f4"/>
      <stop offset="1" stop-color="#9fa4a6"/>
    </linearGradient>

    <!-- Iteration 8: coherent top-left lighting / shallow 3-D planes -->
    <linearGradient id="topPlane" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".45" stop-color="#eceeec"/>
      <stop offset="1" stop-color="#bcc1c2"/>
    </linearGradient>
    <linearGradient id="sidePlane" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#c8cccb"/>
      <stop offset=".55" stop-color="#8f9598"/>
      <stop offset="1" stop-color="#e4e6e4"/>
    </linearGradient>
    <linearGradient id="heaterFace" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".22" stop-color="#e6e8e6"/>
      <stop offset=".56" stop-color="#f7f7f5"/>
      <stop offset="1" stop-color="#aeb3b4"/>
    </linearGradient>
    <linearGradient id="cylGloss" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset=".45" stop-color="#ffffff" stop-opacity=".86"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="cylShade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#343a3e" stop-opacity="0"/>
      <stop offset="1" stop-color="#343a3e" stop-opacity=".46"/>
    </linearGradient>
    <linearGradient id="flight3D" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".16" stop-color="#d9dcdb"/>
      <stop offset=".34" stop-color="#7c8285"/>
      <stop offset=".52" stop-color="#f7f7f5"/>
      <stop offset=".69" stop-color="#9ca2a4"/>
      <stop offset=".86" stop-color="#f0f1ef"/>
      <stop offset="1" stop-color="#71777b"/>
    </linearGradient>
    <linearGradient id="flightUnderside" x1="0" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#808689"/>
      <stop offset=".48" stop-color="#4b5155"/>
      <stop offset="1" stop-color="#b5b9ba"/>
    </linearGradient>
    <linearGradient id="flightSpecular" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".15"/>
      <stop offset=".42" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset=".72" stop-color="#dfe2e1" stop-opacity=".88"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity=".18"/>
    </linearGradient>
    <linearGradient id="shaftCore3D" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f0f1ef"/>
      <stop offset=".18" stop-color="#a5aaac"/>
      <stop offset=".42" stop-color="#62686c"/>
      <stop offset=".53" stop-color="#f6f6f4"/>
      <stop offset=".72" stop-color="#777d80"/>
      <stop offset="1" stop-color="#d4d7d6"/>
    </linearGradient>
    <linearGradient id="barrelTopPlane" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#9da2a4"/>
    </linearGradient>
    <linearGradient id="barrelBottomPlane" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a3a8aa"/>
      <stop offset="1" stop-color="#e6e8e6"/>
    </linearGradient>
    <linearGradient id="dieInset" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".6" stop-color="#e4e6e4"/>
      <stop offset="1" stop-color="#b5babc"/>
    </linearGradient>

    <linearGradient id="motorShell" x1="0" y1="0" x2="1" y2=".3">
      <stop offset="0" stop-color="#f8f8f6"/>
      <stop offset=".32" stop-color="#e1e3e1"/>
      <stop offset=".66" stop-color="#f8f8f6"/>
      <stop offset="1" stop-color="#b7bbbc"/>
    </linearGradient>

    <linearGradient id="motorBody" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#efefed"/>
      <stop offset=".12" stop-color="#b8bcbd"/>
      <stop offset=".28" stop-color="#f8f8f6"/>
      <stop offset=".58" stop-color="#b6babb"/>
      <stop offset=".82" stop-color="#f2f3f1"/>
      <stop offset="1" stop-color="#9da2a4"/>
    </linearGradient>

    <linearGradient id="endBell" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7f7f5"/>
      <stop offset=".38" stop-color="#9ca1a3"/>
      <stop offset=".64" stop-color="#f7f7f5"/>
      <stop offset="1" stop-color="#777d80"/>
    </linearGradient>

    <linearGradient id="gearboxBody" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f9f9f7"/>
      <stop offset=".4" stop-color="#ececea"/>
      <stop offset=".68" stop-color="#d6d8d7"/>
      <stop offset="1" stop-color="#aeb2b2"/>
    </linearGradient>

    <linearGradient id="gearboxRib" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".65"/>
      <stop offset=".5" stop-color="#d5d8d8" stop-opacity=".4"/>
      <stop offset="1" stop-color="#b4b8b9" stop-opacity=".64"/>
    </linearGradient>


    <linearGradient id="motorFrontBell" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f8f8f6"/><stop offset=".28" stop-color="#e3e5e3"/><stop offset=".58" stop-color="#ffffff"/><stop offset="1" stop-color="#c2c6c6"/>
    </linearGradient>
    <linearGradient id="gearboxSide" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#d4d7d6"/><stop offset=".45" stop-color="#f8f8f6"/><stop offset="1" stop-color="#b4b8b9"/>
    </linearGradient>
    <linearGradient id="outputBell" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f6f6f4"/><stop offset=".2" stop-color="#c2c6c5"/><stop offset=".45" stop-color="#ffffff"/><stop offset=".72" stop-color="#aeb3b4"/><stop offset="1" stop-color="#e8e9e7"/>
    </linearGradient>
    <linearGradient id="hopperGlass" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fafaf8" stop-opacity=".7"/>
      <stop offset=".18" stop-color="#e3e4e2" stop-opacity=".52"/>
      <stop offset=".45" stop-color="#ffffff" stop-opacity=".7"/>
      <stop offset=".7" stop-color="#d5d7d5" stop-opacity=".47"/>
      <stop offset="1" stop-color="#f8f8f6" stop-opacity=".7"/>
    </linearGradient>

    <linearGradient id="pelletFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f1d184"/>
      <stop offset=".5" stop-color="#ddb25d"/>
      <stop offset="1" stop-color="#c78e2e"/>
    </linearGradient>

    <linearGradient id="flight" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".18" stop-color="#c3c7c8"/>
      <stop offset=".38" stop-color="#747a7d"/>
      <stop offset=".56" stop-color="#f5f5f3"/>
      <stop offset=".73" stop-color="#8d9396"/>
      <stop offset="1" stop-color="#d9dcdb"/>
    </linearGradient>

    <linearGradient id="shaftCore" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#dedfdd"/>
      <stop offset=".32" stop-color="#7d8386"/>
      <stop offset=".5" stop-color="#f4f4f2"/>
      <stop offset=".8" stop-color="#777d80"/>
      <stop offset="1" stop-color="#d7d9d8"/>
    </linearGradient>

    <linearGradient id="barrelInterior" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8e9395"/>
      <stop offset=".35" stop-color="#555b5e"/>
      <stop offset=".65" stop-color="#373d40"/>
      <stop offset="1" stop-color="#8d9294"/>
    </linearGradient>

    <linearGradient id="barrelFrame" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#d9dbda"/>
      <stop offset=".12" stop-color="#676d70"/>
      <stop offset=".48" stop-color="#bfc2c1"/>
      <stop offset=".85" stop-color="#5d6366"/>
      <stop offset="1" stop-color="#d7d9d8"/>
    </linearGradient>

    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#aa771d"/>
      <stop offset=".25" stop-color="#f1c66e"/>
      <stop offset=".62" stop-color="#ca9331"/>
      <stop offset="1" stop-color="#f4d88c"/>
    </linearGradient>

    <radialGradient id="boltGrad" cx="35%" cy="30%" r="75%">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".56" stop-color="#d2d5d4"/>
      <stop offset="1" stop-color="#92979a"/>
    </radialGradient>
    <radialGradient id="washerGrad" cx="36%" cy="30%" r="76%">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".55" stop-color="#dfe1df"/>
      <stop offset="1" stop-color="#9ea3a5"/>
    </radialGradient>
    <linearGradient id="nutGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".35" stop-color="#d2d5d4"/>
      <stop offset=".7" stop-color="#8e9497"/>
      <stop offset="1" stop-color="#e6e8e6"/>
    </linearGradient>

    <pattern id="mesh" width="5" height="5" patternUnits="userSpaceOnUse">
      <rect width="5" height="5" fill="#d7d8d6"/>
      <circle cx="1" cy="1" r=".95" fill="#3e4447"/>
      <circle cx="4" cy="3.8" r=".7" fill="#555b5f"/>
    </pattern>

    <!-- Browser-safe cast shadows: no feDropShadow dependency -->
    <filter id="castShadow" x="-12%" y="-12%" width="130%" height="135%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.75" result="blur"/>
      <feOffset in="blur" dx="1.7" dy="2.5" result="offsetBlur"/>
      <feColorMatrix in="offsetBlur" type="matrix"
        values="0 0 0 0 0.12  0 0 0 0 0.13  0 0 0 0 0.14  0 0 0 .25 0" result="shadow"/>
      <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>

    <filter id="microCastShadow" x="-10%" y="-10%" width="125%" height="130%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation=".78" result="blur"/>
      <feOffset in="blur" dx=".9" dy="1.25" result="offsetBlur"/>
      <feColorMatrix in="offsetBlur" type="matrix"
        values="0 0 0 0 0.12  0 0 0 0 0.13  0 0 0 0 0.14  0 0 0 .20 0" result="shadow"/>
      <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>

    <clipPath id="upperClip"><rect x="630" y="496" width="812" height="60" rx="4"/></clipPath>
    <clipPath id="lowerClip"><rect x="630" y="548" width="812" height="64" rx="4"/></clipPath>

    <!-- Iteration-14 lighting. The reference hangs these off a CSS block; a
         stylesheet has no cascade to hang off outside the browser, so each one
         is applied as a filter attribute on the part group instead. Every
         primitive here round-trips through react-native-svg's parser, so the
         machine is lit the same way on the web console and on a device. -->
    <filter id="tse14-ground-blur" x="-20%" y="-100%" width="140%" height="300%">
      <feGaussianBlur stdDeviation="10"/>
    </filter>

    <filter id="tse14-metal-depth" x="-20%" y="-20%" width="150%" height="155%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.55" result="alphaBlur"/>
      <feSpecularLighting in="alphaBlur" surfaceScale="4.3" specularConstant=".55" specularExponent="24"
        lighting-color="#ffffff" result="specular">
        <feDistantLight azimuth="224" elevation="58"/>
      </feSpecularLighting>
      <feComposite in="specular" in2="SourceAlpha" operator="in" result="specularClip"/>
      <feBlend in="SourceGraphic" in2="specularClip" mode="screen" result="lit"/>
      <feTurbulence type="fractalNoise" baseFrequency=".34" numOctaves="2" seed="24" result="noise"/>
      <feColorMatrix in="noise" type="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .030 0" result="microGrain"/>
      <feBlend in="lit" in2="microGrain" mode="soft-light" result="textured"/>
      <feDropShadow dx="2.0" dy="2.9" stdDeviation="2.25" flood-color="#171c1f" flood-opacity=".25"/>
    </filter>

    <filter id="tse14-chrome-depth" x="-20%" y="-22%" width="145%" height="150%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="alphaBlur"/>
      <feSpecularLighting in="alphaBlur" surfaceScale="4.8" specularConstant=".72" specularExponent="32"
        lighting-color="#ffffff" result="specular">
        <feDistantLight azimuth="220" elevation="59"/>
      </feSpecularLighting>
      <feComposite in="specular" in2="SourceAlpha" operator="in" result="specularClip"/>
      <feBlend in="SourceGraphic" in2="specularClip" mode="screen" result="lit"/>
      <feDropShadow dx="1.5" dy="2.25" stdDeviation="1.65" flood-color="#101416" flood-opacity=".26"/>
    </filter>

    <filter id="tse14-glass-depth" x="-15%" y="-15%" width="135%" height="140%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation=".75" result="blur"/>
      <feSpecularLighting in="blur" surfaceScale="2.1" specularConstant=".38" specularExponent="24"
        lighting-color="#ffffff" result="spec">
        <feDistantLight azimuth="220" elevation="62"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specClip"/>
      <feBlend in="SourceGraphic" in2="specClip" mode="screen" result="lit"/>
      <feDropShadow dx="1.3" dy="2.2" stdDeviation="1.6" flood-color="#161b1e" flood-opacity=".14"/>
    </filter>

    <!-- The barrel's own contact shadow, which the reference applies through a
         CSS drop-shadow() that has no equivalent outside the browser. -->
    <filter id="tse14-barrel-depth" x="-8%" y="-12%" width="120%" height="128%" color-interpolation-filters="sRGB">
      <feDropShadow dx="1.2" dy="2" stdDeviation="1.5" flood-color="#111619" flood-opacity=".18"/>
    </filter>

    <linearGradient id="tse14-overlay-white" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".72"/>
      <stop offset=".35" stop-color="#ffffff" stop-opacity=".18"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>

    <linearGradient id="tse14-overlay-dark" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#13181b" stop-opacity="0"/>
      <stop offset=".70" stop-color="#13181b" stop-opacity=".05"/>
      <stop offset="1" stop-color="#13181b" stop-opacity=".28"/>
    </linearGradient>

    <radialGradient id="tse14-contact-shadow">
      <stop offset="0" stop-color="#171c1f" stop-opacity=".25"/>
      <stop offset=".66" stop-color="#171c1f" stop-opacity=".10"/>
      <stop offset="1" stop-color="#171c1f" stop-opacity="0"/>
    </radialGradient>
  </defs>

  ${showBackground ? `<rect width="${WIDTH}" height="${HEIGHT}" fill="${sheet}"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)" opacity=".88"/>` : ''}

  ${motor()}
  ${motorDetailLayer()}
  ${gearbox()}
  ${gearboxDetailLayer()}
  ${mainHopper()}
  ${hopperDetailLayer()}
  ${barrel()}
  ${barrelDetailLayer()}
  ${sideFeeder()}
  ${sideFeederDetailLayer()}
  ${ventDie()}
  ${ventDieDetailLayer()}
  ${lightingOverlay()}
  ${showPartLabels ? annotations(ink) : ''}
</svg>`;
}
