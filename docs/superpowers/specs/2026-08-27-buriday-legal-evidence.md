# 버리데이 Legal & Data Evidence

Updated: 2026-08-27
Owner: Team Sakura Security / Data & Marketing
Purpose: Evidence companion for `2026-08-27-buriday-design.md`

> This document is a product-risk evidence record, not legal advice. Re-check the then-current law and dataset terms immediately before public release.

## 1. Public dataset

### 전국생활쓰레기배출정보표준데이터

Official page:
- https://www.data.go.kr/data/15025450/standard.do

Verified on 2026-08-27:
- Official Korean government public-data portal.
- Provides local household waste, food waste, recycling, management-area, disposal method, disposal weekday/time, no-collection-day, department and contact information.
- Nationwide local-government data are collected into one standard dataset.
- Large bulky-waste information is excluded because it is handled through prior reporting and collection.
- File type: CSV.
- Current listed row count: 7,398.
- Portal modification date: 2026-02-10.
- Portal states the data are refreshed daily using data current to two days prior.
- Cost: free.
- Usage permission: `이용허락범위 제한 없음`.

Product implication:
- The dataset is suitable as the first canonical source for regional waste schedules.
- We still persist source metadata, import date and source updated date because individual local-government records can be incomplete or inconsistent.
- Additional municipality webpages are not automatically assumed to have the same reuse terms.

## 2. Waste-management boundary

### 폐기물관리법 제25조

Official current provision checked on 2026-08-27:
- https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1029874969

Verified current law page states:
- Act effective 2026-08-20.
- `폐기물 수집·운반업` means the business of collecting waste and transporting it to a recycling/disposal location or collecting/transporting it for export.

Product implication:
- 버리데이 MVP must remain an information service.
- It must not collect, transport or dispose of waste.
- `수거 예약`, `기사 배정`, paid collection, or a private collection marketplace require a fresh legal/product review before implementation.

## 3. Privacy-minimization boundary

### 개인정보 보호법 제16조

Official provision checked on 2026-08-27:
- https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029335669

Verified rule:
- A personal-information controller must collect only the minimum personal information necessary for the stated purpose.

Product implication:
- MVP asks the user to select a region/management area only.
- Exact road address, building/unit number, phone number and account identity are unnecessary for the first workflow and must not be required.
- The selected region is stored locally unless a later approved feature genuinely requires server persistence.

## 4. Location-information boundary

### 위치정보의 보호 및 이용 등에 관한 법률 제9조

Official provision checked on 2026-08-27:
- https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029559751

Verified rule:
- A location-based service business targeting personal location information is subject to the statutory reporting framework described by Article 9.

Related restriction checked:
- https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029559623

Product implication:
- MVP does not request GPS, latitude/longitude, or realtime device location.
- Manual administrative-area selection avoids making personal-location processing necessary to deliver the product's core job.
- Any future `현재 위치로 찾기` feature is a new architectural/legal scope and cannot be slipped into the MVP as a small UI enhancement.

## 5. Product policy gates derived from the evidence

The following are hard MVP review gates:

1. No GPS or realtime-location permission request.
2. No exact home-address requirement.
3. No direct waste collection/transport/disposal functionality.
4. No paid collection or private collector matching.
5. Every displayed regional rule has traceable source metadata.
6. If source data are missing, stale or conflicting, the UI says so instead of guessing.
7. Bulky-waste results point to official municipality reporting/guidance rather than pretending 버리데이 handles the disposal.
8. Release review rechecks the current public-data license and current statutory text.

## 6. Review status

- Product/PM: GO within the defined information-service scope.
- Security/privacy: GO with manual region selection and local-first settings.
- Data: GO with official public-data provenance and explicit stale/conflict handling.
- Legal risk: Low-to-moderate for the defined MVP; materially increases if location tracking, collection, payment, or intermediary functions are introduced.
