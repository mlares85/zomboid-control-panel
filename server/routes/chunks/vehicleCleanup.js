// Build tile bboxes for vehicles.db cleanup after a chunk-list deletion.
// chunkdata-source entries cover a whole cell (not just one chunk) — expand
// them so we don't miss vehicles in the other 1023 chunks of that cell.
// Also supply wx/wy (chunk-coord) bounds so vehicles with drifted tile
// coords but valid chunk coords still get matched.
export function buildChunkDeletionBoxes(chunks, cellDivisor, tilesPerChunk) {
  const cellTileSpan = cellDivisor * tilesPerChunk;
  return chunks
    .filter((c) => c.cellX != null && c.cellY != null)
    .map((c) => {
      if (c.source === "chunkdata") {
        const x0 = c.cellX * cellTileSpan;
        const y0 = c.cellY * cellTileSpan;
        // chunkdata covers the whole cell, so wx spans cellDivisor chunks.
        const wx0 = c.cellX * cellDivisor;
        const wy0 = c.cellY * cellDivisor;
        return {
          x0,
          x1: x0 + cellTileSpan,
          y0,
          y1: y0 + cellTileSpan,
          wx0,
          wx1: wx0 + cellDivisor,
          wy0,
          wy1: wy0 + cellDivisor,
        };
      }
      const x0 = c.x * tilesPerChunk;
      const y0 = c.y * tilesPerChunk;
      return {
        x0,
        x1: x0 + tilesPerChunk,
        y0,
        y1: y0 + tilesPerChunk,
        wx0: c.x,
        wx1: c.x + 1,
        wy0: c.y,
        wy1: c.y + 1,
      };
    });
}

// Build tile bboxes for vehicles.db cleanup after a region deletion.
export function buildRegionDeletionBoxes(chunksToDelete, tilesPerChunk) {
  return chunksToDelete.map((c) => {
    const x0 = c.x * tilesPerChunk;
    const y0 = c.y * tilesPerChunk;
    return {
      x0,
      x1: x0 + tilesPerChunk,
      y0,
      y1: y0 + tilesPerChunk,
      wx0: c.x,
      wx1: c.x + 1,
      wy0: c.y,
      wy1: c.y + 1,
    };
  });
}
