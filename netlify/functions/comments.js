export async function handler(event) {
  try {
    // Read query params
    const qs = new URLSearchParams(event.rawQuery || "");
    const portalId = qs.get("portalId");
    const contentId = qs.get("contentId");
    const collectionId = qs.get("collectionId");
    const limit = qs.get("limit") || "10000";
    const offset = qs.get("offset") || "0";

    if (!portalId || !contentId || !collectionId) {
      return json(400, { error: "Missing portalId/contentId/collectionId" });
    }

    // HubSpot public comments endpoint (JSONP-capable, but we will call WITHOUT callback)
    // IMPORTANT: do NOT include callback=... so it returns JSON, not JSONP.
    const upstream =
      `https://api-na2.hubapi.com/comments/v3/comments/thread/public` +
      `?portalId=${encodeURIComponent(portalId)}` +
      `&offset=${encodeURIComponent(offset)}` +
      `&limit=${encodeURIComponent(limit)}` +
      `&contentId=${encodeURIComponent(contentId)}` +
      `&collectionId=${encodeURIComponent(collectionId)}`;

    const resp = await fetch(upstream, {
      headers: {
        "accept": "application/json",
        // Optional but helps some edge cases:
        "user-agent": "netlify-function/hs-comments-proxy",
      },
    });

    const ct = resp.headers.get("content-type") || "";
    const text = await resp.text();

    if (!resp.ok) {
      return json(resp.status, {
        error: "HubSpot upstream failed",
        status: resp.status,
        body: text.slice(0, 500),
      });
    }

    // If upstream somehow returned JSONP, strip it (defensive)
    const normalizedText = stripJsonpIfNeeded(text);

    // Validate JSON
    let data;
    try {
      data = JSON.parse(normalizedText);
    } catch (e) {
      return json(502, {
        error: "Upstream did not return valid JSON",
        contentType: ct,
        sample: normalizedText.slice(0, 500),
      });
    }

    // Optionally: normalize shape if you want strict output
    // We'll keep it as-is because your renderer expects { objects: [...] }.
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=30",
        "access-control-allow-origin": "*",
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return json(500, { error: "Server error", message: String(err?.message || err) });
  }
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
    body: JSON.stringify(obj),
  };
}

function stripJsonpIfNeeded(text) {
  const t = text.trim();
  // Looks like: jsonp_123(...);
  const m = t.match(/^[a-zA-Z_$][\w$]*\(([\s\S]*)\)\s*;?\s*$/);
  if (!m) return text;
  return m[1];
}
