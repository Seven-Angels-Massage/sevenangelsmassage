export async function onRequest(context) {
  const { request } = context;

  // Allow only GET
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: jsonHeaders(),
    });
  }

  const url = new URL(request.url);
  const portalId = url.searchParams.get("portalId");
  const contentId = url.searchParams.get("contentId");
  const collectionId = url.searchParams.get("collectionId");
  const limit = url.searchParams.get("limit") || "10000";
  const offset = url.searchParams.get("offset") || "0";

  if (!portalId || !contentId || !collectionId) {
    return new Response(
      JSON.stringify({
        error: "Missing required params",
        required: ["portalId", "contentId", "collectionId"],
      }),
      { status: 400, headers: jsonHeaders() }
    );
  }

  // ✅ IMPORTANT: do NOT use JSONP (no callback param)
  const upstream = new URL("https://api-na2.hubapi.com/comments/v3/comments/thread/public");
  upstream.searchParams.set("portalId", portalId);
  upstream.searchParams.set("contentId", contentId);
  upstream.searchParams.set("collectionId", collectionId);
  upstream.searchParams.set("limit", limit);
  upstream.searchParams.set("offset", offset);

  // Forward a clean Accept header to HubSpot
  const upstreamHeaders = new Headers();
  upstreamHeaders.set("accept", "application/json");
  upstreamHeaders.set("user-agent", request.headers.get("user-agent") || "Mozilla/5.0");
  // Optional but sometimes helps:
  upstreamHeaders.set("referer", "https://spa.sevenangelsmassage.com/");

  let resp;
  try {
    resp = await fetch(upstream.toString(), { headers: upstreamHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Upstream fetch failed", details: String(err) }), {
      status: 502,
      headers: jsonHeaders(),
    });
  }

  const bodyText = await resp.text();

  // If upstream is not OK, surface upstream body for debugging
  if (!resp.ok) {
    return new Response(
      JSON.stringify({
        error: "Upstream error",
        upstreamStatus: resp.status,
        upstreamBody: bodyText.slice(0, 2000),
      }),
      { status: 502, headers: jsonHeaders() }
    );
  }

  // Return as JSON
  return new Response(bodyText, {
    status: 200,
    headers: jsonHeaders({
      // Cache lightly (optional)
      "cache-control": "public, max-age=30",
    }),
  });
}

function jsonHeaders(extra = {}) {
  return {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type, accept",
    ...extra,
  };
}