# Serenity iPad-friendly preview setup

**This is a PUBLIC, fictional-data-only development preview. No real riders, manifests, phone numbers, or patient data.**

## What was prepared
- `docs/index.html` bundles the app HTML, CSS, and JavaScript in a single standalone page.
- The regular `index.html` and `src/` files remain the maintainable source.
- Test changes only on `dev/approved-manifest-v2`; production `main` is unchanged.

## Best browser test on iPad
The developer or repo owner can enable GitHub Pages for the development branch:
1. Open GitHub repository **Settings** → **Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select branch `dev/approved-manifest-v2` and folder `/docs`, then **Save**.
4. GitHub will show the published Pages URL once deployed. Use the URL *GitHub actually reports* rather than assuming it is already active.
5. Open that URL in Chrome or Safari. Press **Load fictional demo**.

**Warning:** This publishes the fictional browser preview publicly. Do not enter real patient data. A secure authenticated preview will be necessary for real manifests.

If GitHub Pages deployment isn't enabled or permitted, use the desktop ZIP and open `index.html` with its `src` directory; don't assume Files on iPad is a web server.

## Five-minute smoke test
1. Confirm the header says PREVIEW.
2. Choose **Load fictional demo**, then inspect six full-day entries.
3. Check Outbound +8 = yellow, Outbound +22 = red, Return +18 = purple.
4. Expand a row; try fake customer notes, status changes, and Canceled at Door only after Arrived.
5. In Import, use pipe-separated fictional text only, preview, then apply. No actual patient manifest yet.

## Not production-ready
The preview has no live routing/traffic ETA integration, secure backend, offline synchronization, regulatory sign-off or end-to-end mobile tests. Its GPS timer polls *position*, not traffic routing. API weather requires internet/GPS permissions. OCR returns editable text and may require correction.
