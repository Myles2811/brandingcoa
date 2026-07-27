# Public Contracts Scotland API integration

Research verified on 1 July 2026 against the official PCS website and live API.

## Official access

- Documentation: <https://api.publiccontractsscotland.gov.uk/v1>
- Monthly notice list: `GET https://api.publiccontractsscotland.gov.uk/v1/Notices`
- Notice family: `GET https://api.publiccontractsscotland.gov.uk/v1/Notice?id={ocid}`
- Manual export fallback: <https://www.publiccontractsscotland.gov.uk/NoticeDownload/Download.aspx>

The public read API requires no API key, login, or registration. No authentication headers are used by this integration. PCS does not publish a numerical rate limit on its API help page and the live response exposes no rate-limit headers. Requests are therefore made once per award category and month, concurrently, with a 150-second timeout and isolated error handling.

## Parameters and format

`/v1/Notices` accepts:

- `dateFrom=MM-YYYY`: publication month; defaults to the current month.
- `noticeType={number}`: defaults to `2` (contract notices).
- `outputType=0|1`: `0` is OCDS JSON and `1` is PCS's TED/custom representation.

The API returns a complete monthly OCDS release package, not a paginated result. Live responses identify themselves as OCDS `1.1`, use `Content-Type: text/json`, and contain a top-level `releases` array. The manual download page also offers JSON, XML, XLSX, and CSV.

This integration requests only explicit award/result categories:

- `3`: F3 Contract Award Notice
- `6`: F6 Contract Award Notice (Utilities)
- `25`: F25 Concession Award Notice
- `103`: Website Contract Award Notice
- `104`: Quick Quote Award

## Mapping

PCS releases use the same internal `NormalizedNotice` structure as Find a Tender and Contracts Finder. Buyer comes from `buyer.name`; supplier from `awards[].suppliers`; publication date from `release.date`; award date falls back from `award.date` to the related `contract.dateSigned`; value similarly falls back from `award.value` to `contract.value`; the canonical URL comes from the `awardNotice` document. Tender and award descriptions plus `procurementMethodRationale` are searched for known Y-number framework references.

## Error behaviour

Each notice type is independent and transient failures are retried up to three times. A final timeout, invalid JSON, or non-2xx response is logged with its notice type and returns an empty group without discarding successful categories or breaking the other UK sources. The API's public availability means there is currently no registration blocker.

The PCS host currently omits the Sectigo R36 intermediate certificate from its TLS handshake. Node rejects that incomplete chain by default. The connector supplies the public Sectigo intermediate bundled in `certs/` alongside Node's normal root store; hostname and certificate verification remain enabled. It does not use the unsafe `rejectUnauthorized: false` workaround.

## Live verification

Run `npm run test-pcs-api -- 2026 6`. It prints the normalized record count, publication-date coverage, and five real records as JSON. The production search now calls PCS automatically alongside Find a Tender; Contracts Finder remains controlled by its existing cross-check option.
