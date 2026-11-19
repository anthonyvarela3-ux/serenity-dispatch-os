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

- Daily read-only information displays show calculated Wake Up and estimated Arrive Home.
- Both displays stay in a fixed upper-right dock on every main screen. They have no tap or hold actions, no diamond indicators and no manual logging. Values follow the manifest forecast and timing settings, ignoring legacy checkpoint logs.
- Keep morning back-calculation and garage timing assumptions in the forecast.
- A neighboring control cycles Day, Dusk and Night. Dusk uses a muted warm palette.
- Store the display preference independently of the manifest so imports, reset and Undo preserve the chosen appearance.

## Cockpit timing alignment

- Align scheduled pickup/drop-off on one row, planned forecasts on the next, and Leave now/If next estimates on the next.
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
