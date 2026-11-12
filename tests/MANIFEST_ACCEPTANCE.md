# Manifest Timing Acceptance Tests
Generated for approved manifest timing. These cases must pass in browser integration; this file is the authoritative manual test catalog.

| Scenario | Expected |
|---|---|
| outbound GPS 10:30; office 10:30 | GREEN, On time |
| outbound GPS 10:31; office 10:30 | YELLOW, +1 min late |
| outbound GPS 10:45; office 10:30 | YELLOW, +15 min late |
| outbound GPS 10:46; office 10:30 | RED, +16 min late |
| return GPS 10:31; office 10:30 | PURPLE, +1 min late |
| return GPS 11:15; office 10:30 | PURPLE, +45 min late |
| return GPS 10:30; office 10:30 | GREEN, On time |
| Missing routing ETA | UNKNOWN, no fabricated timing/color |
| Last valid ETA 60 seconds old (threshold 45s) | STALE, not falsely green |
| GPS dropoff 10:00; next pickup 10:45; reposition 18 minutes | usable gap 27 minutes |
| GPS dropoff 10:30; next pickup 10:45; reposition 20 minutes | conflict, -5 minutes |
| Schedule field changes automatically when GPS updates | MUST NEVER OCCUR |
| Two screenshot images overlap same trip | Single trip after reviewed merge |
| Screenshot import with no readable trip text | Error/review; MUST NOT substitute sample manifest |
| Completed trip receives new manifest | Completed history preserved |
| Cancel at Door before confirmed arrival | Action disabled |
| Browser background suspends refresh | ETA marked stale and update timestamp visible |
