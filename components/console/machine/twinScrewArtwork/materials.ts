/**
 * The lighting materials the drawing is lit by.
 *
 * The reference binds these to parts through a CSS block. react-native-svg has
 * no cascade, so the binding lives on the part groups as `filter` attributes
 * instead, in `geometry.ts`. Which parts it reaches is unchanged: the CSS named
 * the motor, coupling and gearbox layers that the rebuild pass paints over, so
 * the visible drive train carries no specular pass in the reference render
 * either.
 *
 * Every primitive here — specular lighting, distant light, turbulence, blends —
 * round-trips through react-native-svg, which is why the machine can be lit the
 * same way on the web console and on a device.
 */
export const TSE_LIGHTING_DEFS = String.raw`
<defs>
  <filter id="tse14-ground-blur" x="-20%" y="-100%" width="140%" height="300%">
    <feGaussianBlur stdDeviation="10" />
  </filter>

  <filter id="tse14-metal-depth" x="-20%" y="-20%" width="150%" height="155%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="1.55" result="alphaBlur"/>
    <feSpecularLighting
      in="alphaBlur"
      surfaceScale="4.3"
      specularConstant=".55"
      specularExponent="24"
      lighting-color="#ffffff"
      result="specular"
    >
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
    <feSpecularLighting
      in="alphaBlur"
      surfaceScale="4.8"
      specularConstant=".72"
      specularExponent="32"
      lighting-color="#ffffff"
      result="specular"
    >
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

  <!-- The barrel's own contact shadow. The reference applies this through a
       CSS drop-shadow(), which has no equivalent outside the browser. -->
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
`;
