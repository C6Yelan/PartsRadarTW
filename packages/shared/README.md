# @partsradar/shared

This package is the boundary for contracts that must stay identical across app
packages.

Allowed exports:

- source identity and source URL helpers used by both crawler and web/API code;
- product-facet definitions and filter-tag contracts shared by crawler and web/API
  code;
- price-report keyword normalization and grouping shared by crawler input and
  database queries;
- public URL constructors whose output is part of API responses, metadata, or ops
  smoke output.

Do not add app-private helpers here. Build-list formatting, chart helpers, price
display formatting, Discord message formatting, API query logic, and browser/UI
state helpers should stay in their owning app.
