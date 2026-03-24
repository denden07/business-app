# Backlogs

## Current Execution Scope

The current implementation focus is limited to:

1. Template foundation
2. First-run setup page

The following areas are intentionally deferred until later instruction:

- multi-business support
- separate database per business
- combined analytics across businesses

This means current work should establish the shared template system first, then the onboarding/setup flow that selects and customizes a template.

## Multi-Business With Separate Databases

### Summary

Support multiple businesses owned by the same user, where each business has its own local database while analytics can still show combined revenue across all businesses.

Example:
- Business A: Pharmacy
- Business B: Sari-sari store

Each business should operate independently for day-to-day records, but the owner should be able to view consolidated analytics such as total revenue across all businesses.

### Why Consider This

- Strong separation of operational data per business
- Lower risk of mixing inventory, sales, customers, and settings
- Better fit for different business templates in the future
- Easier per-business backup and restore

### Proposed Direction

Use a multi-layer setup:

1. Central meta database
   - Stores business registry
   - Stores active business selection
   - Stores app-level preferences

2. One operational database per business
   - Items
   - Inventory and batches
   - Sales and sale items
   - Customers
   - Drafts
   - Business-specific settings

3. Shared analytics aggregation layer
   - Reads totals across business databases
   - Can be computed live or stored in a summary database

### Analytics Requirement

The owner should be able to switch analytics scope between:

- Current business only
- All businesses combined
- Selected businesses combined

Possible combined metrics:
- Total revenue
- Total items sold
- Transaction count
- Revenue trend over time
- Revenue contribution by business

### Tradeoffs

Benefits:
- Cleaner isolation between businesses
- More future-proof for business templates
- Easier to reason about backups and restores

Costs:
- Combined analytics becomes a cross-database aggregation problem
- More architecture work than a single database with business_id
- Requires careful handling of business switching and migrations

### Open Questions

- Should customers be isolated per business or optionally shared?
- Should combined analytics read all business databases live or use a summary database?
- Should business settings and page visibility be global or per business?
- How should backup and restore work for one business versus the full owner profile?

### Suggested Rollout

1. Add business registry and active business selection
2. Move operational data to one database per business
3. Add analytics scope filters
4. Add combined analytics aggregation
5. Consider cloud sync later if separate devices must contribute to the same owner dashboard

## First-Run Setup And Template Selection

### Summary

Add a first-run setup page that helps the user choose a business template before entering the app.

The setup flow should support:

- premade templates
- a generic template fallback
- quick customization before finishing setup
- continued customization after setup

### Why This Matters

- reduces first-use friction
- gives users a clearer starting point
- supports businesses that do not match a premade template
- keeps templates flexible instead of locked presets

### Backlog Scope

1. Show setup flow on first app open when no business profile is configured
2. Let the user enter a business name
3. Let the user choose a premade template or Generic
4. Let the user adjust core capabilities before finishing setup
5. Persist the active template config in app settings
6. Allow the user to edit the template later in Settings

### Key Rule

Premade templates are starting points, not fixed restrictions.

The Generic template should be a neutral baseline for businesses that need a custom setup from the start.

## Phased Rollout Plan

### Phase 1: Template Foundation

Goal:
- define the shared template contract before changing screens or flows

Scope:
- finalize template schema
- finalize Generic template behavior
- finalize premade template capability defaults
- keep one active template model in app settings

Expected outcome:
- templates become configuration objects, not hardcoded branches

### Phase 2: First-Run Setup Page

Goal:
- guide first-time users into a valid starting configuration

Scope:
- first-run setup entry condition
- business name step
- template selection step
- Generic template fallback
- lightweight review and finish step

Expected outcome:
- new users can enter the app with a valid business profile and active template

### Phase 3: Template Customization

Goal:
- let users adjust the selected template without breaking the shared engine

Scope:
- quick capability toggles
- page visibility defaults
- label customization
- post-setup editing in Settings

Expected outcome:
- premade templates remain editable starting points

### Phase 4: Shared-Core Behavior Wiring

Goal:
- connect template config into existing app behavior

Scope:
- item defaults
- page visibility
- POS validation rules
- inventory behavior flags
- customer and loyalty toggles
- analytics emphasis by reporting focus

Expected outcome:
- the existing app responds to template configuration without duplicating flows

### Phase 5: Business Registry

Goal:
- support more than one business owned by the same user

Scope:
- central business registry
- active business selection
- business creation flow
- business-level settings container

Expected outcome:
- the app can manage multiple business profiles cleanly

### Phase 6: Separate Operational Database Per Business

Goal:
- isolate day-to-day records for each business

Scope:
- one database per business
- migration strategy for existing single-business installs
- business-scoped operational stores
- per-business backup and restore behavior

Expected outcome:
- inventory, sales, customers, and drafts stay isolated per business

### Phase 7: Cross-Business Analytics

Goal:
- allow the owner to view consolidated performance across businesses

Scope:
- analytics scope selector
- combined revenue totals
- per-business contribution breakdown
- multi-database aggregation or summary-store strategy

Expected outcome:
- users can view current business analytics or combined analytics across selected businesses

### Delivery Order Notes

- Do not start separate per-business databases before template and setup foundations are stable.
- Do not build combined analytics before business registry and business isolation exist.
- Keep the current POS flow working throughout all phases.
- For the current implementation window, stop after Phase 2 unless explicitly instructed to continue.