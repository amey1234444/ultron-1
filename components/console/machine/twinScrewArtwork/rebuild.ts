/**
 * The drive train, drawn from scratch.
 *
 * The reference replaces the motor, coupling and gearbox here rather than
 * decorating the earlier ones, with a deliberate stroke hierarchy: 2.4–2.8px
 * outside, 1–1.4px construction lines, sub-pixel highlights. It then covered
 * the originals with an opaque patch; here the originals are simply not
 * drawn, so this pass is the only motor and gearbox in the document.
 */
export function buildAssemblyRebuildSvg(): string {
  return `
  <g id="iteration16-assembly-rebuild">
    

    <!-- ===================== MOTOR ===================== -->
    <g id="motor-v16" stroke="#343a3e" stroke-linejoin="round" stroke-linecap="round">
      <!-- lower foundation with distinct top and side planes -->
      <path d="M35 682H252L264 675V726H35Z" fill="#e7e9e7" stroke-width="2.5"/>
      <path d="M35 682H252L264 675H48Z" fill="#fafbf9" stroke-width="1.1"/>
      <path d="M252 682L264 675V726L252 720Z" fill="#c5c9c8" stroke-width="1"/>
      <path d="M45 716H253" fill="none" stroke="#a6acab" stroke-width="1.1"/>
      <g fill="#d9dcda" stroke-width="1.15">
        <path d="M64 692V685H75V692L80 697V708H59V697Z"/>
        <path d="M198 692V685H209V692L214 697V708H193V697Z"/>
      </g>
      <g fill="#f7f8f6" stroke-width="1.2"><circle cx="69" cy="699" r="6"/><circle cx="203" cy="699" r="6"/></g>
      <g fill="#788083" stroke="none"><circle cx="69" cy="699" r="2.2"/><circle cx="203" cy="699" r="2.2"/></g>

      <!-- sole plate and two cast feet -->
      <path d="M52 650H232L241 656V682H52Z" fill="#eceeec" stroke-width="2.2"/>
      <path d="M58 655H234" stroke="#fff" stroke-width="1.1"/>
      <path d="M69 650L78 630H99L105 650ZM186 650L193 630H215L223 650Z" fill="#d8dcda" stroke-width="1.8"/>
      <path d="M76 641H100M193 641H217" stroke="#fff" stroke-width=".8" opacity=".75"/>

      <!-- fan end bell, main finned stator and drive end bell -->
      <path d="M72 487H49C28 487 16 508 15 540V581C16 612 29 633 50 638H72Z" fill="#eceeeb" stroke-width="2.7"/>
      <path d="M48 496C35 512 30 533 30 558C30 586 36 609 50 627" fill="none" stroke="#fff" stroke-width="2"/>
      <path d="M59 494C49 513 45 535 45 558C45 584 50 606 60 624" fill="none" stroke="#a7adad" stroke-width="1.15"/>
      <path d="M71 487H211Q219 487 222 495V628Q219 636 211 636H71Z" fill="#dfe2e0" stroke-width="2.7"/>
      <path d="M79 491H211V632H79Z" fill="#e8eae8" stroke="#737a7e" stroke-width="1.2"/>
      <g stroke="#50575b" stroke-width="2">
        <path d="M80 499H214"/><path d="M80 506H214"/><path d="M80 513H214"/><path d="M80 520H214"/><path d="M80 527H214"/>
        <path d="M80 534H214"/><path d="M80 541H214"/><path d="M80 548H214"/><path d="M80 555H214"/><path d="M80 562H214"/>
        <path d="M80 569H214"/><path d="M80 576H214"/><path d="M80 583H214"/><path d="M80 590H214"/><path d="M80 597H214"/>
        <path d="M80 604H214"/><path d="M80 611H214"/><path d="M80 618H214"/><path d="M80 625H214"/>
      </g>
      <g stroke="#fff" stroke-width=".85" opacity=".9">
        <path d="M82 501H212"/><path d="M82 515H212"/><path d="M82 529H212"/><path d="M82 543H212"/><path d="M82 557H212"/><path d="M82 571H212"/><path d="M82 585H212"/><path d="M82 599H212"/><path d="M82 613H212"/><path d="M82 627H212"/>
      </g>
      <path d="M211 488Q232 491 243 512Q250 529 250 558Q249 592 241 612Q231 630 213 635L207 626V497Z" fill="#d5d9d7" stroke-width="2.6"/>
      <path d="M219 500C230 516 234 535 234 558C234 584 230 605 220 621" fill="none" stroke="#fff" stroke-width="1.3"/>
      <path d="M232 505C241 522 244 540 244 558C244 581 240 600 232 614" fill="none" stroke="#90979a" stroke-width="1"/>

      <!-- terminal enclosure: wider lid, body seam, gland and screws -->
      <rect x="105" y="449" width="87" height="16" rx="4" fill="#f4f5f2" stroke-width="2.1"/>
      <rect x="113" y="464" width="71" height="24" rx="3" fill="#e2e5e2" stroke-width="2"/>
      <path d="M112 469H184M118 484H179" stroke="#fff" stroke-width="1"/>
      <circle cx="113" cy="456" r="2.2" fill="#8d9497" stroke="none"/><circle cx="184" cy="456" r="2.2" fill="#8d9497" stroke="none"/>
      <path d="M184 473H195Q200 473 200 479V486" fill="none" stroke-width="2.2"/>
      <circle cx="200" cy="487" r="4" fill="#d7dbd9" stroke-width="1.2"/>

      <!-- readable motor plate -->
      <rect x="116" y="527" width="67" height="38" rx="3" fill="#f2f3f0" stroke="#666d71" stroke-width="1.35"/>
      <g fill="#6d7478" stroke="none"><circle cx="122" cy="533" r="2"/><circle cx="177" cy="533" r="2"/><circle cx="122" cy="559" r="2"/><circle cx="177" cy="559" r="2"/></g>
      <g stroke="#8e9598" stroke-width="1"><path d="M131 537H170"/><path d="M131 543H162"/><path d="M131 549H172"/><path d="M131 555H157"/></g>
    </g>

    <!-- ===================== COUPLING ===================== -->
    <g id="motor-coupling-v16" stroke="#343a3e" stroke-linejoin="round">
      <rect x="247" y="539" width="18" height="39" rx="5" fill="#c9cecc" stroke-width="2.1"/>
      <rect x="265" y="526" width="40" height="65" rx="5" fill="#e2e5e2" stroke-width="2.2"/>
      <path d="M274 529V588M296 529V588" stroke="#858c8f" stroke-width="1.2"/>
      <path d="M271 542L299 574M271 574L299 542" stroke="#fff" stroke-width="1.2" opacity=".8"/>
      <rect x="305" y="540" width="17" height="38" rx="3" fill="#bfc5c3" stroke-width="2"/>
      <rect x="322" y="531" width="23" height="57" rx="3" fill="#e2e5e2" stroke-width="2.1"/>
      <path d="M328 534V585M340 534V585" stroke="#fff" stroke-width=".9"/>
      <rect x="345" y="540" width="14" height="38" rx="3" fill="#b7bdbb" stroke-width="2"/>
    </g>

    <!-- ===================== GEARBOX ===================== -->
    <g id="gearbox-v16" stroke="#343a3e" stroke-linejoin="round">
      <!-- strong foundation and cast support webs -->
      <path d="M285 692H575L586 685V727H285Z" fill="#e5e7e5" stroke-width="2.7"/>
      <path d="M285 692H575L586 685H299Z" fill="#fafbf9" stroke-width="1.15"/>
      <path d="M575 692L586 685V727L575 721Z" fill="#c4c9c7" stroke-width="1.1"/>
      <path d="M298 671H350V691H294Z" fill="#d9dcda" stroke-width="1.8"/>
      <path d="M518 658H543V675H556L569 689H518Z" fill="#d8dcda" stroke-width="1.8"/>
      <path d="M305 668Q336 649 347 603V691H300Z" fill="#e6e8e6" stroke-width="1.6"/>

      <!-- main casting with a distinct top plane and right return -->
      <path d="M350 402L364 390H506Q518 390 525 400L532 412V679Q532 692 520 693H350Z" fill="#e8eae8" stroke-width="2.8"/>
      <path d="M350 402L364 390H506Q517 390 523 397L514 404H362Z" fill="#fafbf9" stroke="#777e81" stroke-width="1.15"/>
      <path d="M350 402L364 390V693H350Z" fill="#d2d6d4" stroke="#737a7e" stroke-width="1.2"/>
      <path d="M522 402L532 412V679Q532 689 522 693L515 684V412Z" fill="#c6cbc9" stroke="#737a7e" stroke-width="1.1"/>

      <!-- lifting eye, breather and service cap -->
      <circle cx="458" cy="376" r="17" fill="#eef0ed" stroke-width="2.8"/><circle cx="458" cy="376" r="9" fill="#fcfdfb" stroke="#747b7f" stroke-width="1.4"/><path d="M445 391H471" stroke-width="2.8"/>
      <path d="M483 390V380H497V390" fill="#dce0dd" stroke-width="1.5"/><rect x="485" y="374" width="10" height="7" rx="2" fill="#f0f2ef" stroke-width="1.3"/>

      <!-- dominant recessed inspection cover -->
      <rect x="374" y="438" width="111" height="232" rx="10" fill="#f0f1ef" stroke="#6c7377" stroke-width="2"/>
      <rect x="382" y="446" width="95" height="216" rx="7" fill="#eceeec" stroke="#c1c5c3" stroke-width="1.05"/>
      <path d="M388 451H471" stroke="#fff" stroke-width="1.4"/>
      <g fill="#d0d4d2" stroke="#5f666a" stroke-width="1.1"><circle cx="388" cy="455" r="4"/><circle cx="471" cy="455" r="4"/><circle cx="388" cy="653" r="4"/><circle cx="471" cy="653" r="4"/></g>
      <circle cx="436" cy="515" r="16" fill="#d5d9d7" stroke-width="2.3"/><circle cx="436" cy="515" r="9" fill="#fbfcfa" stroke="#7a8184" stroke-width="1.4"/>
      <circle cx="436" cy="604" r="14" fill="#d5d9d7" stroke-width="2.2"/><circle cx="436" cy="604" r="7.5" fill="#fbfcfa" stroke="#7a8184" stroke-width="1.3"/>

      <!-- right service rail, oil glass and rating plate -->
      <path d="M485 438H517V670H485Z" fill="#d9dcda" stroke="#8b9295" stroke-width="1.3"/>
      <rect x="491" y="468" width="21" height="12" rx="2" fill="#eef0ed" stroke="#646b6f" stroke-width="1.1"/>
      <path d="M495 474H508" stroke="#858c8f" stroke-width="1"/>
      <circle cx="501" cy="581" r="10" fill="#ecedea" stroke="#555c60" stroke-width="1.8"/><circle cx="501" cy="581" r="6" fill="#d4a33c" stroke="#8a6724" stroke-width="1"/><path d="M498 578Q501 576 504 578" fill="none" stroke="#fff0bd" stroke-width="1.2"/>
      <rect x="398" y="628" width="67" height="25" rx="2" fill="#f2f3f0" stroke="#72797d" stroke-width="1.1"/>
      <g stroke="#92999c" stroke-width=".9"><path d="M407 635H456"/><path d="M407 641H447"/><path d="M407 647H454"/></g>
      <g fill="#666d71" stroke="none"><circle cx="403" cy="633" r="1.6"/><circle cx="460" cy="633" r="1.6"/></g>

      <!-- original output reducer retained; raised four units for screw-axis alignment -->
      <g id="gearbox-output-raised-v22" transform="translate(0 -4)">
      <path d="M532 421H549Q558 421 564 432V638Q561 650 551 654H532Z" fill="#dde0de" stroke-width="2.5"/>
      <path d="M549 426H557Q569 431 574 449V628Q569 646 556 650H549Z" fill="#e9ebe8" stroke-width="2.2"/>
      <path d="M557 437C565 465 568 500 568 539C568 581 564 616 557 640" fill="none" stroke="#fff" stroke-width="1.5"/>
      <rect x="574" y="447" width="13" height="190" rx="3" fill="#c8cdcb" stroke-width="2"/>
      <rect x="587" y="440" width="28" height="205" rx="4" fill="#e5e8e5" stroke-width="2.4"/>
      <path d="M592 444V641" stroke="#fff" stroke-width="1.1"/>
      <g fill="#d3d7d5" stroke="#555c60" stroke-width="1"><circle cx="601" cy="474" r="4.5"/><circle cx="601" cy="514" r="4.5"/><circle cx="601" cy="553" r="4.5"/><circle cx="601" cy="593" r="4.5"/><circle cx="601" cy="624" r="4.5"/></g>
      </g>
    </g>

    <!-- Stronger assembly silhouettes across the remaining machine. -->
    <g id="global-outline-reinforcement" fill="none" stroke="#343a3e" stroke-linejoin="round" style="pointer-events: none">
      <rect x="605" y="490" width="838" height="125" rx="6" stroke-width="2.25"/>
      <rect x="605" y="474" width="11" height="181" rx="2" stroke-width="2.1"/>
      <rect x="1438" y="476" width="21" height="178" stroke-width="2.2"/>
      <path d="M1500 477H1520L1572 526V610L1520 653H1500Z" stroke-width="2.35"/>
    </g>
  </g>`;
}

