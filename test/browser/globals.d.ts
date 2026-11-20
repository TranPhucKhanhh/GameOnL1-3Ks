interface Window {
  __lantern: {
    map: {
      game: { scene: { getScene(key: string): any } };
      tileScreen(tile: number, center: boolean): { x: number; y: number } | null;
    };
  };
}
