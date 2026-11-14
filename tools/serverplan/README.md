Server-side run of the app's own planner (admin/planner.js + worker/src/plancore.js + zensus.js), bundled by esbuild into
bundle.js. A temporary Supabase Edge Function loads it and calls globalThis.FMRun({ start:[lat,lng], flyers, n, hours, days })
to plan an order without the admin page (same steps as "Genau N": walking, then dense cores by car, then nearest towns).
