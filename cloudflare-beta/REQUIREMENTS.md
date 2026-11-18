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

- Daily checkpoint controls show Wake Up and Arrive Home.
- Both controls stay in a fixed upper-right dock on every main screen, with tap to log and long press to correct.
- Keep morning back-calculation and garage timing assumptions in the forecast.
- A neighboring control cycles Day, Dusk and Night. Dusk uses a muted warm palette.
- Store the display preference independently of the manifest so imports, reset and Undo preserve the chosen appearance.
