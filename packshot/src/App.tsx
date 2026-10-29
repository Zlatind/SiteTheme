import { useEffect } from 'react';
import { useStore } from './state/store';
import { requestRender } from './lib/viewer';
import { Viewport } from './components/Viewport';
import { BusyOverlay, Header, ImportScreen, PresetBar, ReadySheet, TabBar, ThumbStrip, Toast } from './components/Chrome';
import { BackgroundPanel } from './components/panels/BackgroundPanel';
import { AdjustPanel } from './components/panels/AdjustPanel';
import { FramePanel } from './components/panels/FramePanel';
import { ExportPanel } from './components/panels/ExportPanel';

export default function App() {
  const hasImages = useStore((s) => s.images.length > 0);
  const tab = useStore((s) => s.tab);

  useEffect(() => useStore.subscribe((s, p) => {
    if (s.images !== p.images || s.activeId !== p.activeId || s.tab !== p.tab ||
        s.brush.enabled !== p.brush.enabled || s.interacting !== p.interacting) requestRender();
  }), []);
  useEffect(() => { requestRender(); }, [hasImages]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-ink-950">
      <Header />
      {hasImages ? (
        <>
          <Viewport />
          <ThumbStrip />
          <div className="flex h-[42%] max-h-[420px] min-h-[240px] shrink-0 flex-col bg-ink-900">
            <PresetBar />
            <div className="scroll-thin flex-1 overflow-y-auto px-4 pb-4 pt-2">
              {tab === 'bg' && <BackgroundPanel />}
              {tab === 'adjust' && <AdjustPanel />}
              {tab === 'frame' && <FramePanel />}
              {tab === 'export' && <ExportPanel />}
            </div>
          </div>
          <TabBar />
        </>
      ) : (
        <ImportScreen />
      )}
      <BusyOverlay />
      <ReadySheet />
      <Toast />
    </div>
  );
}
