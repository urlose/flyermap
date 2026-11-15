Server-side run of the app's own planner (admin/planner.js + worker/src/plancore.js + zensus.js): entry.mjs, bundled by esbuild into
bundle.js. run.mjs (GitHub Action "Server plan") calls globalThis.FMRun({ start:[lat,lng], flyers, n, hours, days, quota }) for req.json
and writes the plan to the branch serverplan-out – an order planned without the admin page (same steps as "Genau N": on foot around
the start, then the nearest towns as ordinary Nebenstädte).
