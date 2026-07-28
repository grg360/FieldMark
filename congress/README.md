# Congress source data

Raw congress abstract exports. Not tracked in git — bulk source data, same
treatment as Medicare/ and NPPES/. Derived data lives in Postgres.

## Files

### asco_2026_abstracts.csv
- Source: ASCO Annual Meeting "Download Full Abstract List", public
  unauthenticated download from meetings.asco.org
- Downloaded: 2026-07-27
- 7,295 abstracts; 3,451 presented, 3,844 publication-only
- Columns: AbstractNumber, PresentationStartDate, PresentationEndDate,
  PresentationTimeZone, SpeakerDisplayName, SessionTitle, SessionType,
  PresentationTitle, Tracks, AbstractBody

## Terms

ASCO terms of use have NOT been reviewed. Abstracts are published as a JCO
supplement and carry JCO citations. Before displaying abstract body text in
the product, confirm what redistribution is permitted — the public download
does not by itself grant republication rights.