# Serenity beta requirements

## Revenue

- Current operating type is livery, confirmed by Anthony on November 18, 2026.
- Populate trip revenue automatically from the published Suffolk livery schedule and estimated loaded mileage. Identify estimates and their mileage source.
- Use saved fares when present. Finish Run moves that trip into completed revenue. Cancellations, corrections and Undo update totals.
- Keep Revenue collapsed until opened.
- Before the finished build, add a vehicle/service type selector so the appropriate pricing schedule can be selected, including livery and ambulette.
- Provider-specific billing amounts require the applicable agreement, service codes and authorized loaded mileage.

## Published beta rate source

eMedNY transportation fee schedule, downloaded November 18, 2026, spreadsheet dated April 5, 2026. Unmodified Suffolk Taxi/Livery/Van entries A0100 and S0215 are $6.89 per trip and $3.87 per loaded mile, effective April 1, 2022.

https://www.emedny.org/ProviderManuals/Transportation/PDFS/Transportation_Fee_Schedule.xls

## Distance assumptions

Reuse original CV4 town centers. Prefer saved loaded mileage. Otherwise estimate between towns using great-circle distance multiplied by 1.25 for roads. Within one town use saved drive minutes at 30 mph, or a three-mile assumption when no duration is provided. Keep these planning estimates labeled in the beta.

## Customer messaging

- English and Spanish courtesy messages use Anthony’s relaxed introduction. Confirm Pickup includes scheduled time and pickup location.
- One-tap templates include 10m Out, Running Early, At Curb, Running Late and Confirm Pickup.
- 10m Out always states approximately ten minutes. Running Early, At Curb and Running Late are fixed driver-selected messages, independent of the route forecast.
- Save the message language per trip. Courtesy wording stays stable across clock updates, trip states, missing forecasts and completed runs.
- Open a device SMS draft with encoded recipient and message, with copy fallback.
- Google Voice opens its Messages page and copies the draft for the driver to paste and send. Account selection stays with the driver.
- Recipient phone numbers and manifests remain in browser storage. Opening messaging apps is a deliberate driver action.

## Persistent daily controls and display

- Daily read-only information displays show calculated Wake Up, Leave Garage and estimated Arrive Home.
- All three displays appear together on Overview; the theme control stays available on every screen. They have no tap or hold actions, no diamond indicators and no manual logging. Values follow the manifest forecast and timing settings, ignoring legacy checkpoint logs.
- Leave Garage means depart the garage in the work truck: first scheduled pickup minus the saved early-arrival target and garage-to-first-pickup drive estimate. It updates with the imported schedule and timing settings, and remains information-only.
- Keep morning back-calculation and garage timing assumptions in the forecast.
- A neighboring control cycles Day, Dusk and Night. Dusk uses a muted warm palette.
- Store the display preference independently of the manifest so imports, reset and Undo preserve the chosen appearance.

## Cockpit timing alignment

- Align scheduled pickup/drop-off on one row, planned forecasts on the next, and sequential live pickup/drop-off estimates on the next.
- Wrapped labels in either timing column must expand the shared row together. Keep same-location notes below the timing rows.
- This is a presentation change; preserve forecast values, event timestamps and trip controls.

## Cockpit towns

- Show the pickup town and destination town immediately above their scheduled times in the full-day manifest and cockpit trip summary.
- Read towns from explicit imported town fields when present, otherwise from the address locality. Do not guess from street names.
- Keep both town rows and all timing rows aligned when a town name wraps.

## Available-time bars

- Insert a yellow, full-width information bar before an upcoming run when usable time is strictly greater than 45 minutes.
- Usable time ends at scheduled pickup minus the saved early-arrival buffer and travel to that pickup. It starts at the later of now and the prior stop's projected availability or recorded Finish Run.
- Show available minutes, driving minutes and leave-by time. Identify projections, rough travel assumptions and unconfirmed drop-off handoffs.
- Refresh with the forecast, status changes, corrections, cancellation, Undo and elapsed time. Same-location returns have zero connecting drive.
- Exclude cancellations and trips already en route/arrived; suppress uncertain-order gaps. Bars are information, never trips, revenue or editable status controls.

## Restored weather

- Keep the Bay Shore weather card on the right of Overview, with daily timing displays above it. Show hourly forecast temperature/conditions/wind, morning/afternoon/evening outlook and NWS alerts for the town center.
- Fetch from the National Weather Service points, hourly forecast and active alert endpoints, automatically on opening/resuming and every 30 minutes while visible, with manual Refresh.
- Weather uses the actual New York date/time independently of the route simulation clock. Forecast-based driving cautions must not claim measured road or traffic conditions.
- Cache weather separately from manifests. Label saved/stale forecasts and failed alert checks; failed weather requests must preserve trip controls, drafts, timestamps, revenue and display preferences. No passenger data or device GPS is sent.
- Source documentation: https://www.weather.gov/documentation/services-web-api

## Four-tab workspace

- Exactly four tabs in this order: Overview, Dispatch, Customer, Settings. Default to Dispatch and preserve the existing local-storage key and manifest schema.
- Overview contains daily progress, completions/cancellations, shift control, read-only checkpoints, weather, revenue (collapsed initially), selected-trip summary and schedule notes.
- Dispatch uses full width for the original-order manifest, towns, scheduled/rolling estimates, conflicts, available-time bars, filters and colored statuses. No revenue/weather sidebar. Filtered rows keep their original run numbers.
- Each row exposes one-step back/forward arrows and tappable/holdable status correction options. Back removes the reversed event timestamp, recalculates affected connections, can reopen completed runs, and remains undoable. Forward uses the same timing engine as Customer and intentionally starts a pending handoff. Undo restores the handoff as well as status and timestamps.
- Tapping a rider opens Customer; row control taps do not navigate. Customer shows large aligned scheduled and live pickup/drop-off times, towns, recorded waits, status controls, messages and verified contact/notes tools.
- Settings contains rates, timing assumptions, JSON import/export/add/edit/reset controls, audit log and simulation tools. Keep Update Day, Undo and the theme control reachable across tabs.
- Preserve existing rolling forecast, timestamp history, cancellation outcomes, Revenue controls, fixed friendly EN/ES SMS drafts, weather cache and themes. Routing API integration is a separate task.

- Dispatch labels its live drop-off estimate “Estimated Drop-Off Time” instead of “If next”; this wording change preserves all forecast calculations.

## Sequential remaining-day estimates

- Dispatch, Overview and Customer main estimates use the same sequential pickup/drop-off forecast through every preceding uncanceled trip. Do not expose direct-to-any-run “Leave now”/“If next” alternatives as the operational ETA.
- Include a preceding trip even while it is only En Route to Pickup or Arrived at Pickup. Preserve office pickup/drop-off times and recorded actuals; live estimates refresh with elapsed time and status changes. On Board and Finish Run anchor the remaining chain.
- Same-location connecting travel remains zero; canceling/adding runs invalidates stale connection assumptions. Keep conflict alternatives clearly labeled when dispatch order is undecided.
- Imported town-estimate-v1 manifests may provide estimated loaded/connecting miles, using town centers, a 1.25 road allowance and 30 mph. Explicit drive minutes have priority; unknown legs retain clearly disclosed generic fallback assumptions. These values are never represented as live traffic, measured road mileage or confirmed billing.
- A future service-date import previews at its planning clock until that New York date arrives, then uses device time automatically. Import is undoable and can restore the replaced day. Published source must never contain a passenger manifest.
- Tomorrow's screenshot is transcribed into a private JSON file with first names and the exact shown schedule. No OCR/upload integration or external API is added.

- Deferred until the timing foundation is reliable: a question-only Ask Serenity assistant, future shared dispatcher Q&A, and the previously requested graded daily review. These are requirements, not connected features in this release.

## Pickup-anchored start and early-arrival limits

- Anchor a future service-day preview to the first scheduled, non-advance-canceled pickup minus ten minutes, back-calculating garage departure from the saved approach time. Do not use tonight's clock or a stale imported clock as tomorrow's forecast baseline.
- Default later planned arrivals to the saved target, capped at fifteen minutes early. Preserve real lateness and recorded early arrivals; never clamp an actual timestamp. A per-trip early-arrival exception is editable in the existing trip correction form and is undoable.
- The first pickup, morning departure/wake-up calculations, remaining trip chain and gap buffers share these targets. Keep actual device time active on the service date; late starts must still produce honest delays.
- Refresh preview/device mode on a New York service-date transition even if the displayed minute is unchanged. Existing JSON imports remain compatible; no new manifest download is required for this fix.
# Runtime secret foundation — November 20, 2026

- [x] Preserve `autumn-hill-2d59` and the permanent workers.dev address.
- [x] Add an ES module Worker entry point so Cloudflare runtime secrets can be configured.
- [x] Keep the tested HTML, browser-local manifest, timing engine and status controls unchanged.
- [x] Serve existing assets through the `ASSETS` binding; run the Worker first only for `/api/*`.
- [x] Provide `/api/health` with configuration booleans only; never return secret values.
- [x] Initial foundation kept `/api/routes` disabled. The Google beta now requires an owner session, same-origin request and global usage allowance before any paid provider call.
- [x] Include runtime asset-serving, secret-leak prevention and zero-outbound-request checks in the normal Cloudflare build verification.
- [x] Director saved the private `GOOGLE_MAPS_API_KEY` in Worker runtime settings; live health check detected it.
- [x] Authenticated, usage-limited routing is connected to the forecast adapter; live Google results remain gated on the private browser probe listed below.


## Google routing beta — November 20, 2026

- [x] Runtime Google key detected on the permanent Worker; no key is copied into source, notes, application assets or exported manifests.
- [x] Owner unlock exchanges the matching runtime key for a signed, Secure, HttpOnly, SameSite session. Key input clears immediately; rotation invalidates sessions. This is an interim single-driver beta unlock, not a multi-user authentication system.
- [x] No unauthenticated or cross-origin billable routing. Fixed Google endpoint and restricted request/response fields prevent arbitrary proxy use; passenger names, phones and notes are omitted.
- [x] A SQLite-backed Durable Object atomically limits Google request attempts across Worker instances to 150 per New York day and 20 per minute. It stores only counters. Google usage elsewhere in the account is outside this application's limit.
- [x] Full ride and connecting-drive quotes are labeled Google traffic while current. Older same-route quotes remain available as rough saved estimates between manual checks. Quotes remain in memory, not backups or durable route history.
- [x] Future legs use the projected departure time in New York. Pending arrivals retain first-minus-ten and normal maximum-fifteen-minute-early planning.
- [x] Live GPS is opt-in. An active route from GPS uses remaining duration from the observation time; actual stage timestamps remain unchanged. Location uncertainty or provider failure keeps the manual fallback.
- [x] Google traffic checks are manual only. Refresh Traffic and Unlock and Test Connection are the only actions that request routes. Clock, status, location, page resume/reload and manifest changes make no automatic Google route calls. Weather refresh remains independent.
- [x] Settings provides Connect, Refresh Traffic, optional iPad location and garage starting address. Update Day requests traffic updates when connected.
- [x] Existing status, Back, Undo, cancellation, handoff, scheduled drop-off, revenue, theme, SMS and weather regression checks pass with routing disconnected.
- [x] Mocked provider integration verifies sequential future ETAs, actual events, GPS remaining duration, future departure timezone conversion, private unlock, key privacy, provider errors and persistent request limits.
- [x] Driver unlocked routing on iPad; Google Routes probe and full refresh confirmed connected on Nov 20 at 5:46 AM. Runtime credentials remain private.
- [ ] Compare real Google trip and connecting-leg results with RoutingBox/Google Maps during the beta day. Existing vehicle revenue calculations have not been converted to Google billing mileage.


## Screenshot import and intraday merge — Nov 20

- Upload New Manifest and Change Existing Manifest remain available beside Update Day and Undo. Existing JSON backup restore remains available in Settings.
- Tesseract.js 6.0.1 runs image OCR in the browser with a single sequential worker; pinned CDN engine/core downloads require a connection on first use. Images are not uploaded to an OCR service. No additional API key is required.
- Supports up to four PNG/JPEG/WebP screenshots or one Serenity JSON manifest; overlapping screenshots deduplicate. PDFs and HEIC are not supported.
- Review service date, each rider, scheduled pickup/drop-off, addresses, leg type and existing-run match before applying. Ambiguous matches require a selection. OCR text can be corrected and parsed again.
- Intraday merge preserves absent runs, protected active/completed/canceled rows, actual timestamps, verified contacts, notes, selected ride, shift, settings and fares. Missing rows never imply cancellation. Pending corrections retain before/after schedule revisions. New rows receive unique IDs and join the remaining schedule.
- Save a browser-local pre-import snapshot before applying. Undo restores the complete previous day; JSON export remains available for durable user backups. A new-day import retains driver settings and starts fresh operational history.
- Recalculate the rolling forecast from current device time and preserved progress. Changed Google route plans invalidate in-flight results and reuse unaffected fresh quotes.
- Tested real OCR on a fictional browser screenshot and the supplied Nov 20 RoutingBox screenshot locally, plus matching/duplicate/history regressions. Never publish private manifests or test screenshots in source.


## Manual Google request budget control — Nov 20

- Refresh Traffic is available globally beside Update Day after browser unlock. Update Day only recalculates locally. A requested traffic refresh checks the remaining ride and connecting legs; one click may consume multiple Google requests.
- Opening or resuming the page only reads free session status. Enabling location, changing status, saving a garage address and merging a manifest never trigger billable Google routes. No timer polling or automatic retry is scheduled.
- Unlock and Test Connection remains an explicit request for a public-route test followed by the remaining plan. Resuming a paused connection alone does not request traffic.
- Preserve older Google route durations for the same route and date, flag them as rough after 30 minutes (10 minutes for GPS remaining quotes), and retain the actual last-check timestamp. Changed routes use the existing fallback until manually refreshed.
- Keep the daily 150-attempt and per-minute 20-attempt guards. Rate-limit messages direct the driver to retry manually. Pausing interrupts the rest of an in-flight refresh after its current request.
- Regression tests prove no Google requests on clock/status/import/GPS/reload, correct manual route refresh, local Update Day, preserved chained forecasts and actual timestamps, and clear older-quote handling.


## Pickup ETA heads-up reminder — Nov 20

- A foreground banner appears once per current service-day run when exactly one uncanceled run is En Route to Pickup and its projected pickup is within ten minutes. It uses the rolling ETA, not the scheduled pickup clock.
- Suppress future-day previews, simulation, ambiguous en-route targets, conflicts, canceled/arrived/finished runs, and any heads-up while another passenger is still on board/in handoff.
- Review Pickup Message opens an independent friendly EN/ES draft for the correct rider without replacing the selected trip or unsaved notes. Existing SMS and Google Voice draft fallbacks remain available; no recipient is contacted automatically.
- A nearby draft avoids claiming ten minutes when under five remain; an overdue estimate uses a neutral on-the-way draft. Missing verified phone numbers keep SMS disabled while allowing copy/Google Voice contact selection.
- Reviewed/dismissed reminders persist in a browser-local, service-day/run ledger. Preparing the regular 10-minute macro also handles the reminder. Neither draft opening nor copying claims delivery or marks the text sent.
- Uses existing clock/status/ETA refresh and makes zero Google traffic or messaging API calls. The page must be open; background push, unattended SMS delivery and phone-line/provider integration are not connected.
- Regression checks cover threshold timing, wrong-run suppression, persistence, recipient/language accuracy, short/overdue wording and preservation of selection, notes and actual event timestamps.
