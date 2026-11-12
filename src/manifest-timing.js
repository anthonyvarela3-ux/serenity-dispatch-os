/* Serenity Dispatch OS: pure manifest timing logic.
   No GPS data is fabricated here. All ETA values must come from a routing provider
   or separately identified manual entries. Times are ISO timestamps with offsets.
   Safe for direct browser import (<script src="src/manifest-timing.js">). */
(function (root) {
  'use strict';
  const MINUTE = 60000;
  const minutesDiff = (eta, scheduled) => {
    const a = Date.parse(eta), b = Date.parse(scheduled);
    return Number.isFinite(a) && Number.isFinite(b)
      ? Math.ceil((a - b) / MINUTE) : null;
  };
  function classifyPickup({ direction, scheduledPickup, gpsPickupEta, etaUpdatedAt, now, staleAfterSeconds = 45 }) {
    if (!scheduledPickup || !gpsPickupEta) return { tone: 'unknown', label: 'ETA unavailable', minutesLate: null, stale: false };
    const age = etaUpdatedAt && now ? (Date.parse(now) - Date.parse(etaUpdatedAt)) / 1000 : null;
    if (age !== null && (!Number.isFinite(age) || age > staleAfterSeconds || age < -10)) {
      return { tone: 'stale', label: 'ETA stale', minutesLate: null, stale: true };
    }
    const minutesLate = minutesDiff(gpsPickupEta, scheduledPickup);
    if (minutesLate === null) return { tone: 'unknown', label: 'ETA unavailable', minutesLate: null, stale: false };
    const isReturn = String(direction || '').toLowerCase() === 'return' || String(direction || '').toLowerCase() === 'incoming';
    const tone = minutesLate <= 0 ? 'green' : isReturn ? 'purple' : minutesLate <= 15 ? 'yellow' : 'red';
    const label = minutesLate < 0 ? Math.abs(minutesLate) + ' min early' : minutesLate === 0 ? 'On time' : '+' + minutesLate + ' min late';
    return { tone, label, minutesLate, stale: false };
  }
  function computeUsableGap({ previousGpsDropoffEta, nextScheduledPickup, repositionMinutes }) {
    const a = Date.parse(previousGpsDropoffEta), b = Date.parse(nextScheduledPickup);
    const reposition = Number(repositionMinutes);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(reposition) || reposition < 0)
      return { availableMinutes: null, classification: 'unknown' };
    const availableMinutes = Math.floor((b - a) / MINUTE - reposition);
    return { availableMinutes, classification: availableMinutes < 0 ? 'conflict' : availableMinutes <= 10 ? 'tight' : 'available' };
  }
  root.SerenityManifestTiming = Object.freeze({ minutesDiff, classifyPickup, computeUsableGap });
})(typeof window !== 'undefined' ? window : globalThis);
