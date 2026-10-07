/** Versioned illustration paths also refresh artwork in existing offline guides. */
export function specimenArtwork(source: string): string {
  return /^\/specimens\/[^/]+\.svg$/.test(source)
    ? source.replace('/specimens/', '/pixel-specimens-v2/')
    : source;
}
