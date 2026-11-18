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

- English and Spanish previews include Anthony, the rider's first-name label, pickup address, scheduled pickup and current ETA when available.
- One-tap templates include 10m Out, Running Early, At Curb, Running Late and Confirm Pickup.
- Use calculated ETA instead of assuming ten minutes. Expired drop-off forecasts and unfinished handoffs produce an ETA-confirmation message.
- Save the message language per trip. Refresh the preview from the current forecast.
- Open a device SMS draft with encoded recipient and message, with copy fallback.
- Google Voice opens its Messages page and copies the draft for the driver to paste and send. Account selection stays with the driver.
- Recipient phone numbers and manifests remain in browser storage. Opening messaging apps is a deliberate driver action.
