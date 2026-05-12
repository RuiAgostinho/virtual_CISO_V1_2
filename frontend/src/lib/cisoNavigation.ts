type VulnerabilityOccurrenceUrlParams = {
    assetId?: string | number | null;
    cveId?: string | null;
    status?: string | null;
    severity?: string | null;
    focus?: boolean;
};

export function buildVulnerabilityOccurrenceUrl({
    assetId,
    cveId,
    status,
    severity,
    focus = false,
}: VulnerabilityOccurrenceUrlParams = {}) {
    const params = new URLSearchParams();

    if (assetId) params.set("asset", String(assetId));
    if (cveId) params.set("search", cveId);
    if (status) params.set("status", status);
    if (severity) params.set("severity", severity);
    if (focus) params.set("focus", "1");

    const query = params.toString();
    return `/vulnerabilities${query ? `?${query}` : ""}`;
}