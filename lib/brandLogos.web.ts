// Web/Next asset resolution — static image imports become a URL (StaticImageData
// under Next), which react-native-web's Image accepts as a string `source`.
import logoDark from '../assets/brand/logo-dark.png';
import logoLight from '../assets/brand/logo-light.png';

function toUri(img: unknown): string {
  if (typeof img === 'string') return img;
  if (img && typeof img === 'object' && 'src' in img) {
    return (img as { src: string }).src;
  }
  return img as string;
}

export const LOGO_DARK = toUri(logoDark);
export const LOGO_LIGHT = toUri(logoLight);
