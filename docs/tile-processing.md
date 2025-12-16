# Tile Processing and Overlay Workflow

This document outlines the current step-by-step flow for preparing and serving hex-based score tiles to the client while allowing live simulations to refine the view locally.

## Nightly precomputation and caching
1. **Batch scoring per hex cell**: A nightly job calculates the scores for every hex cell in the grid, aggregating any necessary source data.
2. **Tile generation**: The computed scores are packaged into map tiles (e.g., XYZ or vector formats) keyed by zoom level and hex index.
3. **Distribution via cache**: The tiles are published to a CDN or tile server so clients can fetch them with low latency.

## Client consumption and live refinement
1. **Tile fetch and overlay**: The client requests the relevant tiles for the current viewport and overlays them on the map using the cached scores.
2. **Local live simulation**: Interactive simulations run in the client adjust the displayed scores locally, allowing the user to see updated results without waiting for new tiles.
3. **Reconciliation**: When fresh tiles arrive or simulations conclude, the client reconciles the local adjustments with the cached baseline.

## Operational notes
- Keep tile cache invalidation aligned with the nightly job so clients receive updated scores after each run.
- Consider short client-side caching (ETags/Last-Modified) to avoid redundant tile downloads while still picking up nightly updates.
- If live simulations can diverge significantly, provide a reset control to restore the view to the cached baseline from the CDN.
