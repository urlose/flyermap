# Circular delivery territory

## Preserved router

Before this change, the full application and router were preserved on GitHub:

- Branch: `backup/router-before-circle-2026-11-17`
- Commit: `8771c78dfb2be76bfd49924375aba55805ac07e2`
- Contains routing PR #29 and the subsequently released PRs #28, #30–34.

Keep that branch unchanged. Compare it with `feature/circular-delivery-area`
to review this feature. Reverting the feature requires a reviewed revert commit,
not a force push to main or any database rollback. No SQL migration is included.

## Agreed behaviour

New time-first / near-first orders default to a geographic circle. The initial
radius is 10 km, editable from 0.5 to 10 km in the wizard (the current map loader
supports areas up to 10 km). It can also be switched off. The initial 10 km is an
approximation motivated by 15 minutes at 40 km/h, NOT a road travel-time guarantee.
Only the circle is drawn on the map; no travel-time label is added.

The circle restricts automatic expansion and places marked `auto:true`.
Automatically suggested town centres must be inside; their delivery points are
also clipped individually. Manual places (`auto:false` or missing), mandatory
areas and hand-drawn areas remain eligible in full, subject to the existing
working-time budget. The wizard warns when a manual selection extends outside.
This does not guarantee delivery to every house in a manually selected area.

Connecting roads are retained. A route may need a detour outside the circle to
reach delivery points inside. No new mailboxes or road access permissions are
invented. Existing time allocation and transfer accounting remain unchanged.

The radius is saved as `days[0].delivery_radius_km` on each route, alongside the
existing budget metadata. The drawing is saved in `tasks.zone_polygon` as a
128-point circle; exact spherical distance, not that polygon, filters delivery.
Existing orders without the field stay in the previous mode. Customer export
continues to describe the actually served streets, not the entire circle.

## Coordination

Claude owns the follow-up fix for unused automatic towns being persisted without
a travel time. This feature does not change `expand.js` or that save behaviour.
It constrains the suggestion radius in `admin.js`, and ignores automatic towns
with centres outside the circle before reserving transfer time in `plancore.js`.
Manual entries remain exceptions. No production order is automatically replanned.

## Checks

`node test/circlearea.mjs`: exact boundary, mixed inside/outside buildings, source
graph immutability, connecting roads, automatic versus manual towns and polygons,
time accounting, radius serialization/restoration, legacy behaviour, expansion.
`node test/nearfirst-service.mjs`: existing time/transfer integration regressions.
The time-first Chromium workflow checks circle drawing, configurable radius,
save and reopen. The separate atomic-replan workflow must remain green.
