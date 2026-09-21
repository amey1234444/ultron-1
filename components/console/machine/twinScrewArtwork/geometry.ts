
/**
 * Twin Screw Extruder — the machine itself.
 *
 * Vendored from the reference drawing (iteration 24, the marker-only channel-
 * mapping build) rather than redrawn. It is emitted as SVG source and parsed
 * once into react-native-svg nodes by `TwinScrewExtruder`, so the console
 * renders the reference drawing and not an approximation of it: gradients,
 * patterns, clip paths and lighting filters all survive that round trip, on
 * web and on native alike.
 *
 * What changed on the way in, and nothing else:
 *
 * 1. The motor, coupling and gearbox this file used to draw are gone. The
 *    rebuild pass in `rebuild.ts` draws all three again from scratch and the
 *    reference hides the originals behind an opaque patch; removing them is
 *    what lets the drawing sit on a transparent canvas instead of on a card.
 *    Verified equivalent to the reference composition by pixel diff.
 * 2. The sheet and its grid became optional, for the same reason.
 * 3. The lighting pass is applied as filter attributes rather than as a CSS
 *    block, because react-native-svg has no cascade to hang a stylesheet off.
 * 4. The dead intermesh layer and the empty annotation marker are dropped;
 *    each carries a note where it stood.
 *
 * Sensor markers are deliberately absent. This drawing is marker-only by
 * design, and the markers are the app's own: `TwinScrewExtruder` draws one pad
 * per `TWIN_SCREW_POINT_REGISTRY` entry, carrying that pad's wiring state.
 */

import {
  TWIN_SCREW_ARTWORK_HEIGHT,
  TWIN_SCREW_ARTWORK_WIDTH,
} from '../../../../lib/twinScrewExtruderPoints';

/** The frame the point registry places instruments in. One coordinate space. */
export const WIDTH = TWIN_SCREW_ARTWORK_WIDTH;
export const HEIGHT = TWIN_SCREW_ARTWORK_HEIGHT;

/** Iteration 22 removes every raised separator rod between heater modules. */
export const TEMPERATURE_ZONE_SEPARATOR_LAYOUT = [] as const;

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
  <g id="side-feeder" transform="translate(80 0)" filter="url(#tse14-metal-depth)">
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

    <!-- 2) CLEAR TAPERED HOPPER: wider mouth and deeper reference taper -->
    <path d="M 914 336 H 986
             L 972 370
             Q 971 373 967 374
             H 934 Q 930 373 929 370 Z"
          fill="url(#hopperGlass)" stroke="#343a3e" stroke-width="1.65"/>

    <!-- inner glass panel makes the hopper read as a separate transparent vessel -->
    <path d="M 920 340 H 980 L 969 369 H 936 Z"
          fill="#ffffff" fill-opacity=".16" stroke="#ffffff" stroke-opacity=".58" stroke-width=".8"/>

    <!-- glass highlight and right-side shade -->
    <path d="M 921 339 L 934 369" stroke="#ffffff" stroke-width="3.8" opacity=".38"/>
    <path d="M 978 339 L 967 370" stroke="#5e6569" stroke-width="2.2" opacity=".15"/>

    <!-- material bed follows actual hopper taper -->
    <path d="M 920 347
             C 935 343 964 343 980 347
             L 969 371 H 936 Z"
          fill="url(#pelletFill)" opacity=".94"/>
    <path d="M 921 347 C 938 343 963 343 979 347" fill="none" stroke="#f7dc9a" stroke-width="1.4" opacity=".86"/>
    <path d="M 936 348 L 943 369" stroke="#f7d99a" stroke-width="2.4" opacity=".54"/>
    <path d="M 970 347 L 961 370" stroke="#a97522" stroke-width="1.6" opacity=".20"/>

    <!-- visible pellet/granule cues, kept inside the tapered material bed -->
    <g id="side-hopper-pellets" fill="#bd892d" opacity=".52" stroke="#f3ce7b" stroke-width=".35">
      <circle cx="932" cy="351" r="1.25"/><circle cx="944" cy="349" r="1.1"/>
      <circle cx="957" cy="350" r="1.3"/><circle cx="970" cy="352" r="1.05"/>
      <circle cx="938" cy="358" r="1.15"/><circle cx="951" cy="356" r="1.25"/>
      <circle cx="964" cy="359" r="1.15"/><circle cx="943" cy="365" r="1.05"/>
      <circle cx="956" cy="364" r="1.2"/><circle cx="965" cy="366" r=".95"/>
    </g>

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

    <!-- Reference-strength silhouette: only assembly boundaries are reinforced. -->
    <g id="side-feeder-reference-outline" fill="none" stroke="#343a3e" stroke-linejoin="round" stroke-linecap="round" style="pointer-events: none">
      <path d="M907 318Q905 318 905 321V323Q905 326 909 326H991Q995 326 995 323V321Q995 318 991 318Z" stroke-width="2.15"/>
      <path d="M914 336H986L972 370Q971 373 967 374H934Q930 373 929 370Z" stroke-width="2.15"/>
      <rect x="918" y="373" width="70" height="17" rx="3" stroke-width="1.95"/>
      <path d="M923 390H939V451L923 429ZM938 390H978Q982 390 982 395V446Q982 451 977 454H943Q938 451 938 446Z" stroke-width="2.15"/>
      <path d="M937 449H986V469Q986 474 979 476H939Z" stroke-width="1.95"/>
      <path d="M944 476H973V489Q972 492 969 493H948Q945 492 944 489Z" stroke-width="1.8"/>
    </g>
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

function bottomZoneJoint(x: number): string {
  return `
    <g class="zone-joint">
      <!-- bottom clamp strip -->
      <rect x="${x-3.5}" y="614" width="7" height="41" rx="1.5" fill="url(#jointMetal)" stroke="#5c6266" stroke-width=".78"/>
      <path d="M ${x-1.7} 616 V 653" stroke="#fff" stroke-width=".65" opacity=".48"/>
      <circle cx="${x}" cy="638" r="2.35" fill="url(#boltGrad)" stroke="#555b5f" stroke-width=".68"/>
    </g>`;
}

function temperatureZoneLink(x: number): string {
  return `
    <rect class="temperature-zone-link" x="${x}" y="474" width="1" height="10" rx=".5"
          fill="url(#jointMetal)" stroke="none" style="pointer-events: none"/>`;
}

function barrel(): string {
  // The four-module bank between the main hopper and side feeder is lengthened
  // gently from 60 to 64 units. The downstream banks remain 60 units so the
  // side-feeder and vent mounting clearances stay mechanically correct.
  const tops = [
    [736,64,768],[801,64,833],[866,64,898],[931,64,963],
    [1072,60,1102],[1133,60,1163],[1194,60,1224],[1255,60,1285],
    [1378,60,1408]
  ].map(v => topHeater(v[0], v[1], v[2])).join("");

  const zoneLinks = [800,865,930,1132,1193,1254]
    .map(temperatureZoneLink)
    .join("");

  const bottoms = [
    [612,92],[708,92],[804,92],[900,92],
    [996,92],[1092,92],[1188,92],[1284,92],[1380,58]
  ].map(v => bottomHeater(v[0], v[1])).join("");

  const bottomJoints = [704,800,896,992,1088,1184,1280,1376]
    .map(bottomZoneJoint)
    .join("");

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

    <!-- dense intermeshing region -->
    <!-- Drawn unclipped. The reference clips this layer to a clip path it never
         declares anywhere; librsvg, which rendered the reference image, ignores
         the dangling reference and draws the layer, while a browser would drop
         the layer outright. Removing the attribute is what makes every renderer
         agree with the image this drawing was matched against. -->
    <g opacity=".84">
      ${[905,949,993,1037,1081,1125,1169,1213,1257,1301].map(x => intermeshBridge(x,552)).join("")}
    </g>

    <path d="M 850 549 C 900 543 945 547 989 566 C 1031 585 1085 588 1135 569 C 1191 548 1240 543 1293 555"
          fill="none" stroke="#f8f8f6" stroke-width="2.0" opacity=".47"/>
    <path d="M 852 567 C 904 579 950 577 998 558 C 1049 538 1103 539 1153 558 C 1206 579 1253 580 1302 566"
          fill="none" stroke="#606669" stroke-width="1.3" opacity=".54"/>

    ${tops}
    ${zoneLinks}
    ${bottoms}
    ${bottomJoints}
  </g>`;
}

function ventDie(): string {
  return `
  <g id="vent" transform="translate(4 0)" filter="url(#tse14-metal-depth)">
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

    <!-- rigid vent-to-machine throat: the vent now lands on the barrel rail -->
    <g id="vent-machine-connection-v23" stroke="#3b4145" stroke-linejoin="round">
      <rect x="1334" y="463" width="22" height="25" rx="2"
            fill="url(#metalV)" stroke-width="1.25"/>
      <path d="M1338 465V486M1352 465V486" stroke="#ffffff" stroke-width=".8" opacity=".58"/>
      <rect x="1328" y="461" width="34" height="8" rx="2"
            fill="url(#plateV)" stroke-width="1.15"/>
      <rect x="1326" y="486" width="38" height="8" rx="2"
            fill="url(#plateV)" stroke-width="1.25"/>
      <path d="M1330 489H1360" stroke="#ffffff" stroke-width=".8" opacity=".7"/>
      ${socketBolt(1332,490,2.5)} ${socketBolt(1358,490,2.5)}
    </g>

    <!-- physically mounted vent-temperature probe, threaded boss and rigid arm -->
    <g id="vent-temperature-probe" stroke="#3d4347" stroke-linejoin="round">
      <rect x="1365" y="416" width="10" height="10" rx="2"
            fill="url(#metalH)" stroke-width="1.05"/>
      <path d="M1372 417H1379L1385 421L1379 425H1372Z"
            fill="url(#plateV)" stroke-width="1.05"/>
      <path d="M1368 418V424" stroke="#ffffff" stroke-width=".75" opacity=".72"/>
      <path d="M1378 421H1384" stroke="#343a3e" stroke-width="3.2"/>
      <path d="M1378 420H1384" stroke="#ffffff" stroke-width=".8" opacity=".7"/>
      <circle cx="1384" cy="421" r="2.4" fill="url(#boltGrad)" stroke-width=".75"/>
    </g>
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
  <g id="side-feeder-detail-layer" transform="translate(80 0)" style="pointer-events: none">
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
 * The machine, as SVG body text: definitions followed by the parts, in the
 * order they are painted. No <svg> wrapper — `buildTwinScrewExtruderArtwork`
 * owns that, because the overlay passes have to land inside the same one.
 */
export function buildMachineSvg({ showBackground, sheet }: { showBackground: boolean; sheet: string }): string {
  return `
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
  </defs>

  ${showBackground ? `<rect width="${WIDTH}" height="${HEIGHT}" fill="${sheet}"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)" opacity=".88"/>` : ''}

  ${mainHopper()}
  ${hopperDetailLayer()}
  ${barrel()}
  ${barrelDetailLayer()}
  ${sideFeeder()}
  ${sideFeederDetailLayer()}
  ${ventDie()}
  ${ventDieDetailLayer()}`;
}
