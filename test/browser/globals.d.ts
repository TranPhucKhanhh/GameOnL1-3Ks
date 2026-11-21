interface Window {
  __lantern: {
    map: {
      game: { scene: { getScene(key: string): any }; canvas: HTMLCanvasElement; scale: { width: number; height: number } };
      scene: any;
      tileScreen(tile: number, center: boolean): { x: number; y: number } | null;
    };
  };
  /** Standalone map fixture built by map.spec.mjs. */
  mapFixture: any;
}

/** App modules imported inside page.evaluate (served by Vite, not resolved by tsc). */
declare module '/src/*';
