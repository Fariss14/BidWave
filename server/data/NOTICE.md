# Philippine address directory

The four CSV snapshots are vendored from:
https://github.com/altcoder/philippines-psgc-shapefiles/tree/main/dist

Retrieved 2026-10-25. The source describes its PSGC basis as 31 December 2023, with geographic codes and names drawn from Philippine Statistics Authority updates and OCHA boundary data. This is a pinned historical snapshot, not a live or guaranteed-current directory. It contains 17 regions, 82 provinces, 1,642 cities/municipalities/special geographic units, and 42,001 named barangays. It predates subsequent administrative changes.

Source documentation:
https://github.com/altcoder/philippines-psgc-shapefiles
Official updates:
https://psa.gov.ph/classification/psgc/summary

Copyright (c) James Faeldon. Distributed under MIT; see LICENSE.

Runtime normalization pads numeric PSGC identifiers to ten digits, omits non-province districts from the province selector, groups Manila sub-municipality barangays under the City of Manila, and omits unnamed non-barangay geometries. Original CSV snapshots remain unmodified. Manual address entry is available for missing or renamed areas.

To update, replace all four CSV files from a consistent, licensed PSGC release, update source/date/count metadata here and the completeness assertions in server/locations.js, and run the hierarchy tests. Do not mix releases or infer parent codes by substring except the documented Manila grouping.
