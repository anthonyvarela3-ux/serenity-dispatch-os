# Serenity Dispatch OS — Approved Master Requirements
Status: APPROVED REQUIREMENTS / NOT IMPLEMENTATION CERTIFICATION
Revision: 2026-11-12
Source: driver confirmations 1–30, including later modifications.
Purpose: Personal driver-side NEMT operational tool; not a dispatcher or passenger portal.
Rule: No approved feature is silently removed or altered. Preserve last functioning release and verify regressions before deployment.

## Full-day manifest (C01, C02, C07, C19–C23, C27)
- Show all office-assigned trips in original order in one compact vertically scrollable manifest; completed rows remain in place, dimmed with a checkmark; highlight active trip.
- Collapsed rows show customer, direction, scheduled pickup, **routing-estimated pickup ETA**, **routing-estimated drop-off ETA**, and exact signed pickup variance. Use two compact timing columns: scheduled + GPS pickup side by side, and GPS drop-off alone. MAS scheduled drop-off times are NOT operational ETAs and must not drive routing/gap/delay logic.
- Summary shows next-pickup ahead/behind variance; every trip shows its own expected variance. Predict later trips using route sequence, pickup/drop-off estimates and repositioning, not independent naive comparisons.
- Outbound appointment-related pickups: GREEN if <=0 minutes late; YELLOW if 1–15 minutes late; RED if >15 minutes late. Return/medical facility-to-home pickups: GREEN if early/on time; PURPLE if late, with exact lateness value. Missing/stale ETA is UNKNOWN/STALE, not falsely color-coded as on time or late.
- Preserve office pickup times. Corrections require confirmation, recording original value, updated value, reason/category (OCR correction vs authorized office change), and timestamp. Never rewrite a scheduled time merely to hide lateness.
- No unnecessary alert banners or popups: manifest itself is the glanceable warning surface.
- Expand a manifest row in place for full customer control: pickup/drop-off addresses, Google Maps/Waze navigation, verified phone, four SMS templates, customer/facility notes, trip event buttons. No reordering upon expansion.
- Trip direction labels and direction-specific scheduling intelligence; do not invent office restrictions.

## GPS, navigation, gap analysis (C06, C11, C12, C18)
- Request position/traffic-aware routing updates every 15 seconds while active and permitted; capture actual freshness timestamps. Browser background limits and routing provider update cadence mean this interval is a target, never guaranteed.
- Route externally with Google Maps or Waze; Serenity independently computes its own ETA where its routing integration supports it. One-tap navigation to pickup and drop-off.
- Estimate usable downtime = scheduled next pickup minus projected prior drop-off and travel to next pickup, incorporating actual trip progress. Identify tight connections, risk, and long gaps.
- Detect pickup/drop-off GPS proximity and suggest status transitions; driver confirms arrival, passenger boarding, and completion. GPS proximity alone never completes a trip.

## Weather (C03)
- Full morning, afternoon, and evening forecast with temperature, conditions, precipitation probability, and significant driving weather warnings.

## Customer intelligence, communications (C04, C05, C08, C23)
- Persistent customer, facility and per-trip operational notes, including doors, entrances, pickup instructions.
- Verified saved customer phone takes precedence over changed screenshot-import phone, with subtle mismatch indication and preservation of imported alternative; never silently overwrite verified numbers.
- Four preloaded SMS messages; one tap opens device messaging app with verified recipient and prepared message for driver review/send.
- Customer information protected during new imports, merges, shift closures, and application updates.

## Screenshot import and updates (C09, C10, C27)
- Import one or two RoutingBox/MAS screenshots with real extraction, confidence/uncertainty review, duplicate detection, and explicit verification preview.
- Later screenshot(s) intelligently merge new/changed trips, flag removed/canceled trips, preserve completed event records, and require review before applying.
- **Critical blocker in previous main:** image selection currently populates DEFAULT_MANIFEST instead of reading actual screenshot. Must never report 'parsed successfully' without extracting the real image. Never substitute sample riders for actual imported ones.

## Trip outcomes (C24)
- Completed, canceled in advance, canceled at door, no-show, unable to complete; status and original assignment retained in history.
- Canceled at Door is available only after confirmed arrival, with one-tap driver confirmation. Record arrival and outcome timestamps and available location/distance; do not assume this is office approval or payable trip. Recompute future route from outcome.

## Shift and financial records (C13–C15, C25)
- Leave Work / Arrive Home lifecycle, timestamps, driving activity, paid/unpaid breaks, manual corrections, completed counts, shift mileage.
- Editable hourly pay (previous code rate 22.50 is unconfirmed), configurable overtime, estimated gross earnings. No unsupported overtime assumptions.
- Protected searchable daily history and PDF/CSV exports; retain shift, outcomes, earnings when importing next day.

## Persistence, offline, privacy, location sharing (C16, C17, C28)
- Secure cloud database architecture with authenticated individual accounts, access separation for potential future multiple drivers, encrypted protected offline storage and queued synchronization.
- Handle offline edits and conflict reconciliation; stale GPS estimates explicitly labeled. Offline access must not imply offline traffic routing.
- No real NEMT/patient information in unreviewed public repo, logs, unsecured files, or demo fixtures. Review HIPAA and authorization/BAAs, retention/security before actual patient information is stored.
- External location sharing via Google Maps shortcut, controlled by driver; no Serenity sharing service.

## UI settings, release management (C29, C26, C30)
- Driver-focused compact dark default; adjustable font size, row density, optional light theme; lateness colors retain fixed meaning.
- Protected feature requirements, separate development branch, saved last stable build, regression suite, rollback strategy.
- Full validation of screenshot parsing, manifest chronology, boundary colors, routing freshness, weather, customer numbers, trip events, offline sync, financial accuracy, exports, mobile/device handoffs before live-use designation.
- Maintain states APPROVED, IMPLEMENTED, TESTED, RELEASED distinctly. Do not declare live-ready until integration, security, and device checks pass.

## Release acceptance edge cases
1. Exactly on time => outbound GREEN; +1 and +15 => YELLOW; +16 => RED.
2. Late return at +1 or +45 => PURPLE; on-time return GREEN.
3. Missing routing => ETA unknown, never invented; stale routing => show last successful update.
4. Office pickup unchanged by ETA change; original import and edit history preserved.
5. Imported screenshots must not silently load pre-filled sample manifest.
6. Cancel at door available only after driver confirms arrival.
7. Completed runs retain original position even when later screenshot is merged.
8. No credentials, rider data, or unprotected PHI committed to GitHub.
