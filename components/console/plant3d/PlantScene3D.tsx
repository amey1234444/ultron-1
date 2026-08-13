/**
 * Shared entry point for the 3D plant map.
 *
 * Isolates the rest of the console from three.js: the WebGL canvas is loaded
 * lazily *after mount* (so it never runs during Next's SSR pass) and only on
 * web. A WebGL failure or a missing/corrupt GLB degrades to a readable message
 * instead of taking the dashboard down with it.
 */
import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';

import type { PartNode, PlantScene3DCanvasProps } from './PlantScene3DCanvas';

const LazyCanvas = lazy(() => import('./PlantScene3DCanvas'));

export type { PartNode };

function Notice({ dark, message, spinner = false }: { dark: boolean; message: string; spinner?: boolean }) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {spinner ? <ActivityIndicator size="small" color={dark ? '#F5F5F5' : '#111827'} /> : null}
      <Text style={{ fontSize: 11.5, textAlign: 'center', paddingHorizontal: 24, color: dark ? 'rgba(245,245,245,0.62)' : 'rgba(17,24,39,0.55)' }}>
        {message}
      </Text>
    </View>
  );
}

class CanvasBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[plant-3d] scene failed to render', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function PlantScene3D(props: PlantScene3DCanvasProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (Platform.OS !== 'web') {
    return <Notice dark={props.dark} message="The 3D plant map is available in the web console." />;
  }
  if (!mounted) {
    return <Notice dark={props.dark} message="Preparing plant model…" spinner />;
  }
  if (props.scene.components.length === 0) {
    return <Notice dark={props.dark} message="No components placed. Use “Edit map” to add one." />;
  }

  return (
    <CanvasBoundary fallback={<Notice dark={props.dark} message="The 3D plant map could not be displayed on this device." />}>
      <Suspense fallback={<Notice dark={props.dark} message="Loading plant model…" spinner />}>
        <LazyCanvas {...props} />
      </Suspense>
    </CanvasBoundary>
  );
}
