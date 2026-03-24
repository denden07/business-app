# Setup Page

## Current Scope

The setup page is part of the current implementation scope.

It should be built only for the single-business template-driven onboarding case.

The setup page should not yet include:

- multi-business creation
- business switching
- separate database selection per business
- combined analytics setup

## Purpose

The setup page is the **first-time onboarding screen** that prepares the app for the user’s business. It ensures:

- Template selection
- Basic business information
- Optional cloud setup
- Default configurations for POS, inventory, and analytics

---

## Goals

1. Guide the user through **first launch configuration**
2. Persist the configuration globally (Vuex + IndexedDB)
3. Avoid hardcoding template-specific logic
4. Provide ability to **re-open setup** from Settings
5. Enable future cloud backup integration

---

## Main Sections

### 1. Business Profile

- Business name
- Business type (linked to template)
- Currency / local settings
- Optional logo

### 2. Template Selection

- Present available templates:
  - Sari-sari store
  - Pharmacy
  - Food cart
  - Car wash
  - Repair shop
- Save `template_id` to Vuex + IndexedDB
- Load template capabilities globally

### 3. Basic Configuration

- Enable / disable loyalty points
- Default page visibility
- Optional default tax rate
- Optional expense categories

### 4. Cloud Service (Optional, Future)

- Email / account setup
- Backup toggle
- Synchronization configuration

---

## Implementation Notes

- Run **once on first launch**
- Should be **re-openable from Settings** if user wants to change business info or template
- Use **wizard-style screens** if multiple steps:
  1. Business info
  2. Template selection
  3. Optional cloud setup
- Saves data to **Vuex + IndexedDB** so the app reads template & settings globally
- Template ID and capabilities should dictate:
  - POS behavior
  - Inventory display and rules
  - Analytics & reporting
  - Customer / loyalty options

---

## Relation to Template System

- Setup page **feeds into Phase 5A: Template Registry**
- Template config determines all business-specific behavior dynamically
- Future templates can be added without changing setup page code

---

## Future Enhancements

- Add **step progress indicator** for wizard-style onboarding
- Add **validation** for required fields (business name, template)
- Integrate **cloud backup signup** seamlessly
- Provide **“skip for now”** option and allow setup later from Settings

---

## Phase Scope

### Phase 2 MVP

The initial setup-page delivery should stay narrow.

Include:
- business name
- template selection
- Generic template option
- lightweight customization for core capabilities
- save active template and onboarding completion state

Do not include yet:
- cloud signup
- advanced branding
- multi-business switching
- cross-business analytics

### Later Phases

After the setup page is stable, later phases can add:

- deeper template customization
- re-open and edit flow from Settings
- business creation for multi-business owners
- optional cloud features

This keeps the setup page small enough to ship early while still fitting the larger roadmap.