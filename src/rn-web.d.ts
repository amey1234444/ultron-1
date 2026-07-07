// The shared components render through react-native-web, which accepts a handful of
// web-only style props that React Native's core types don't declare. Augment the RN
// style interfaces so the shared tree type-checks under the Next build.
import 'react-native';

declare module 'react-native' {
  interface ViewStyle {
    userSelect?: 'auto' | 'none' | 'text' | 'contain' | 'all';
    cursor?: string;
    transition?: string;
    transitionProperty?: string;
    transitionDuration?: string;
  }
  interface TextStyle {
    userSelect?: 'auto' | 'none' | 'text' | 'contain' | 'all';
    cursor?: string;
    transition?: string;
    whiteSpace?: string;
    wordBreak?: string;
  }
}
