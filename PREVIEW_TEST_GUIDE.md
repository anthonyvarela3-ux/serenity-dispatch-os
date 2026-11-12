# Serenity Dispatch OS — protected development preview

**NOT FOR LIVE MANIFESTS / REAL PATIENT DATA**

## Quick test (fictional records only)
1. Open the branch ZIP: https://github.com/anthonyvarela3-ux/serenity-dispatch-os/archive/refs/heads/dev/approved-manifest-v2.zip
2. Extract ZIP on a computer. Open `index.html` in Chrome. Keep the `src` folder beside the HTML file.
3. Choose **Load fictional demo**; expand a row and inspect scheduled pickup, ETA pickup, ETA drop-off, delay color, trip controls and notes.
4. Inspect color boundaries: Outbound 0 green; +1 through +15 yellow; +16 red. Late Return purple.
5. In **Import**, paste **fictional** pipe-delimited lines:
   `Fictional Rider | 6315550101 | Outbound | 9:00 AM | 100 Example St, Bay Shore NY | 200 Sample Ave, Islip NY | 8`
   Select **Validate and preview**, then **Apply reviewed merge**.
6. Try screenshot OCR only with a fictional screenshot. It needs internet to load Tesseract.js and returns editable text. Correct into the described pipe-separated format before applying.
7. Test trip status changes: **Arrived** is required before **Canceled at Door**.
8. Start/end a fictional shift, save a daily summary, export CSV, and try print/PDF.
9. In Settings, allow optional GPS and weather access to test position polling and the Open-Meteo 3-period forecast.
10. Report any issue with the section, device, the action taken, and what appeared.

## Explicit limitations / release blockers
- **No live traffic-aware routing provider** is connected. Any ETA is manual or labeled FICTIONAL DEMO. Fifteen-second polling currently updates the driver's location while active, NOT traffic estimates. Do not use the demo's ETA colors for dispatch decisions.
- Screenshot OCR is experimental. It does not guarantee direct structured extraction from RoutingBox screenshots; it must be reviewed and corrected, and currently relies on an external CDN.
- Data is stored locally for fictional testing only. There is no secure cloud database, HIPAA-reviewed storage, encryption-backed sync, offline conflict resolution, or multi-user access control.
- No authenticated login, backend, secure SMS service, official weather alert feed, or real road-distance mileage calculation.
- Payment reports are estimated straight-time figures; overtime requires historical workweek integration.
- The app is NOT certified/tested on the driver's device or production-ready. GitHub Actions only checks syntax and pure manifest timing rules.
- Never paste real patient, trip, phone, address or other protected information into this public development preview.

## Approved requirements
See `docs/APPROVED_REQUIREMENTS.md`.

## Test command
`node tests/manifest-timing.test.cjs`

## Branch protection
The stable `main` branch has not been edited in this work. Do not merge this preview until all release blockers are resolved and relevant tests pass.
