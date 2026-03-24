# Template Foundation

## Overview

The application is a modular, mobile-first business companion app.

Current execution scope:
- Phase 1: Template foundation
- Phase 2: First-run setup page

Deferred for later:
- multi-business support
- separate database per business
- combined analytics across businesses

Templates are not separate applications.

Templates are configurations layered on top of a shared core engine:
- Items (products + services)
- Sales / POS
- Customers / CRM
- Analytics

This ensures:
- Single codebase
- Consistent behavior
- Scalable feature development

Templates should be treated as business profiles that tune the shared engine.
They should not introduce separate runtime stacks, separate databases, or separate route trees.

---

## Core Principle

> Templates configure behavior; they do not fork logic.

- No separate database per template
- No duplicated UI flows
- No hardcoded business-specific branches

All behavior must be driven by configuration flags and shared resolver logic.

---

## Design Rules

The template system must follow these rules:

- Templates can enable, disable, or require behavior, but they must not fork core flows.
- Database structure remains shared across all templates.
- Template selection should come from app settings and be changeable without creating a new app instance.
- Existing item, sales, customer, analytics, and draft flows remain the platform foundation.
- Complex template-specific workflows should be layered incrementally after the shared template contract is stable.

---

## First-Run Setup Page

The app should include a setup page for first-time users.

This setup page should appear when the user first opens the app and has not yet selected or created a business profile.

The goal of the setup page is to help the user start quickly without forcing a rigid business type too early.

The setup flow should allow the user to:

- choose a premade business template
- start with a generic template
- customize the selected template before finishing setup

### Setup Flow Goals

- Reduce friction during first login or first app open
- Let non-technical users start with a sensible default
- Keep templates flexible instead of locked presets
- Preserve the shared-core architecture while allowing business-specific tuning

### Setup Flow Options

1. Select a premade template
  - Example: sari-sari store, pharmacy, food cart, car wash, repair shop

2. Start with a generic template
  - Used when the user's business does not fit an existing preset
  - Should provide balanced defaults that are safe to customize later

3. Customize before entering the app
  - Toggle capabilities
  - Adjust labels or business terminology
  - Choose which pages or modules are visible by default

### Generic Template Requirement

If the user does not want a premade template, the app should provide a generic baseline template.

This generic template should:

- enable the shared business engine without strong assumptions
- allow both products and services as a starting point
- allow the user to enable or disable inventory-related behaviors
- be customizable after setup

### Premade Template Customization

Premade templates must not be treated as fixed presets.

They should be editable starting points.

That means a user can:

- choose Pharmacy, then relax or change some behaviors
- choose Sari-sari store, then enable extra options later
- use the template only as an initial recommendation, not as a permanent restriction

### Post-Setup Editing

After setup, the user should still be able to revisit and adjust the active template configuration.

Examples:

- enable loyalty later
- turn on expiry tracking later
- rename labels to match the business
- hide or reveal pages based on actual usage

This keeps the app practical for businesses that evolve over time.

### Sample First-Run UX Flow
Suggested onboarding sequence:

1. Welcome screen
  - Explain that the app can be tailored to the user's business

2. Business name step
  - User enters the business name

3. Template selection step
  - Choose a premade template
  - Or choose Generic

4. Quick customization step
  - Select whether the business sells products, services, or both
  - Enable or disable stock tracking
  - Enable or disable batch and expiry tracking
  - Choose the default pages to show first

5. Review step
  - Show the selected template and chosen customizations

6. Finish setup
  - Save the active template config in app settings
  - Enter the main app with that template active

The setup flow should remain lightweight.

It should help the user start quickly, not force them through a long configuration wizard.

---

## Template Rollout Order

1. Sari-sari store (baseline retail)
2. Pharmacy (complex inventory validation)
3. Food carts (mixed product + service)
4. Car wash (service-focused)
5. Repair shop (most complex, deferred)

---

## Capability Matrix

Each template defines its behavior using capabilities.

Capability values must be normalized. Avoid ambiguous values like `limited`, `strong`, or `low priority` in the final config.

Use these value types:

- Boolean: `true` or `false` for simple support flags
- Mode enum: `off`, `optional`, or `required` for behaviors that need policy levels
- Focus enum: small string sets like `sales`, `inventory`, `services`, or `mixed` for reporting and dashboard emphasis

### Capability Questions

- Does it sell products?
- Does it sell services?
- Does it track stock?
- Does it track batches?
- Does it track expiry?
- Does it use customer loyalty?
- Does it support item variants or sizes?
- Does it require notes?
- Does it support labor + parts in one transaction?
- Does it require specialized reporting?

---

## Capability Model

To keep the config maintainable, separate the template contract into these layers:

1. Capabilities
   - What the business profile supports conceptually

2. Workflow rules
   - What the app should allow, prefer, or require in POS and operational flows

3. Defaults
   - What should be preselected or preconfigured when the user creates records

4. UI and reporting
   - What screens are emphasized or visible by default

This prevents one flat config object from mixing support flags with runtime policy.

---

## Template Behavior Principles

Templates should behave as recommendation profiles, not hard locks.

This means:

- premade templates provide sensible defaults
- generic template provides a neutral starting point
- users can customize either path
- template choice should guide the initial experience, not permanently limit the app

The system should prefer configuration inheritance:

- base shared defaults
- selected template defaults
- user customizations

This allows the app to keep a stable template contract while still supporting business-specific adjustments.

---

## Template Definitions

### 0. Generic

- Products: true
- Services: true
- Stock tracking: optional
- Batch tracking: optional
- Expiry tracking: optional
- Loyalty: optional
- Variants: optional
- Notes: optional
- Mixed labor + parts transaction: optional
- Reporting focus: mixed
- Purpose: neutral starting point for businesses that do not match a premade template

---

### 1. Sari-sari Store

- Products: true
- Services: false
- Stock tracking: required
- Batch tracking: false
- Expiry tracking: optional
- Loyalty: optional
- Variants: optional
- Notes: optional
- Mixed labor + parts transaction: false
- Reporting focus: sales

---

### 2. Pharmacy

- Products: true
- Services: optional
- Stock tracking: required
- Batch tracking: required
- Expiry tracking: required
- Loyalty: optional
- Variants: false
- Notes: required
- Mixed labor + parts transaction: false
- Reporting focus: inventory

---

### 3. Food Carts

- Products: true
- Services: optional
- Stock tracking: required
- Batch tracking: optional
- Expiry tracking: optional
- Loyalty: optional
- Variants: optional
- Notes: required
- Mixed labor + parts transaction: false
- Reporting focus: mixed

---

### 4. Car Wash

- Products: optional
- Services: true
- Stock tracking: optional
- Batch tracking: false
- Expiry tracking: false
- Loyalty: optional
- Variants: false
- Notes: required
- Mixed labor + parts transaction: false
- Reporting focus: services

---

### 5. Repair Shop

- Products: true
- Services: true
- Stock tracking: required for parts
- Batch tracking: false
- Expiry tracking: false
- Loyalty: optional
- Variants: optional
- Notes: required
- Mixed labor + parts transaction: true
- Reporting focus: mixed
- Extra workflow: job tracking in a later phase

---

## Template Config Schema

Each template should follow this structure:

```js
{
  id: 'pharmacy',
  label: 'Pharmacy',

  capabilities: {
    products: true,
    services: true,
    stockTracking: 'required',
    batchTracking: 'required',
    expiryTracking: 'required',
    loyalty: 'optional',
    variants: false,
    notes: 'required',
    mixedTransaction: false,
    specializedReporting: true
  },

  workflow: {
    allowProductSales: true,
    allowServiceSales: true,
    allowMixedItems: false,
    requireBatchSelection: true,
    requireCustomer: false,
    requireNotes: true
  },

  itemDefaults: {
    itemType: 'product',
    trackStock: true,
    trackBatch: true,
    trackExpiry: true
  },

  customer: {
    enableLoyalty: true,
    requireCustomerDetails: false
  },

  pages: {
    showHome: true,
    showItems: true,
    showInventory: true,
    showCustomers: true,
    showDrafts: true,
    showAnalytics: true,
    showSettings: true
  },

  reporting: {
    focus: 'inventory'
  },

  labels: {
    catalog: 'Items',
    catalogEntry: 'Item'
  }
}
```

### Example Generic Template

```js
{
  id: 'generic',
  label: 'Generic',

  capabilities: {
    products: true,
    services: true,
    stockTracking: 'optional',
    batchTracking: 'optional',
    expiryTracking: 'optional',
    loyalty: 'optional',
    variants: 'optional',
    notes: 'optional',
    mixedTransaction: true,
    specializedReporting: false
  },

  workflow: {
    allowProductSales: true,
    allowServiceSales: true,
    allowMixedItems: true,
    requireBatchSelection: false,
    requireCustomer: false,
    requireNotes: false
  },

  itemDefaults: {
    itemType: 'product',
    trackStock: false,
    trackBatch: false,
    trackExpiry: false
  },

  customer: {
    enableLoyalty: true,
    requireCustomerDetails: false
  },

  pages: {
    showHome: true,
    showItems: true,
    showInventory: true,
    showCustomers: true,
    showDrafts: true,
    showAnalytics: true,
    showSettings: true
  },

  reporting: {
    focus: 'mixed'
  },

  labels: {
    catalog: 'Items',
    catalogEntry: 'Item'
  }
}
```

The generic template should act as a balanced default, not as an empty or weak mode.

It should allow the user to start immediately and refine the behavior after setup.

---

## Active Template Model

The app should treat one template as active at a time.

The active template should:

- be stored in app settings
- drive default page visibility
- drive default item creation behavior
- influence workflow validation in POS and inventory
- remain separate from the underlying shared database schema

---

## Phased Delivery

### Phase 1: Template Contract

- finalize shared template schema
- finalize Generic template
- finalize premade template defaults
- keep one active template in app settings

### Phase 2: First-Run Setup

- show setup page when no business profile exists
- collect business name
- let the user select a premade or Generic template
- save the chosen template as the initial active template

### Phase 3: Template Customization

- allow lightweight capability changes during setup
- allow post-setup editing in Settings
- support page visibility and labels as editable configuration

### Phase 4: Template-Driven App Behavior

- wire template config into item defaults
- wire template config into POS rules
- wire template config into inventory behavior
- wire template config into analytics emphasis and page defaults

### Phase 5: Multi-Business Layer

- add business registry
- support active business switching
- keep template choice attached to each business profile

### Phase 6: Business Isolation And Consolidation

- move to one operational database per business
- preserve one shared template engine
- add consolidated analytics across businesses only after business isolation is stable

This order keeps templates as the foundation and treats multi-business support as a later expansion, not the starting point.

For the current implementation cycle, work should stop after Phase 2 unless a later phase is explicitly approved.

Changing the active template should not delete or rebuild data.

---

## Phase 5 Plan

### Phase 5A: Template Registry Foundation

Goal

- Introduce a template registry and an active template setting

Scope

- Add a central template definition source
- Add app setting for active template
- Add shared resolver helpers for template behavior
- Do not change sales or inventory logic yet beyond wiring the active template source

### Phase 5B: Sari-sari Store Baseline

Goal

- Establish the first non-pharmacy retail template as the shared baseline

Scope

- Default to product-first item creation
- Keep stock tracking on by default
- Keep batch tracking off by default
- Keep expiry optional

### Phase 5C: Pharmacy Template Rules

Goal

- Reintroduce pharmacy behavior through template config instead of legacy medicine runtime

Scope

- Batch and expiry become required by default
- Notes become required where needed
- Inventory-oriented reporting emphasis

### Phase 5D: Food Cart and Car Wash Templates

Goal

- Validate mixed retail-service and service-first template behavior

Scope

- Food cart focuses on quick sales and optional order notes
- Car wash focuses on service flows with optional inventory usage

### Phase 5E: Repair Template Extension

Goal

- Add support for mixed labor and parts workflows after the template foundation is stable

Scope

- Introduce repair-specific workflow only after the generic template engine is proven
- Job tracking remains a later subphase, not part of the first template foundation milestone

---

## Immediate Next Step

Before app code changes begin, Phase 5 should start with the template registry contract and active template setting.

The first implementation target should be:

1. A central template registry
2. One active template stored in app settings
3. Shared helpers that resolve template capabilities, defaults, and page visibility
4. Sari-sari store as the first enabled baseline template

