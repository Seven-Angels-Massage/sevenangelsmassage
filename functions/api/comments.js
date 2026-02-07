export async function onRequest({ request }) {
  const url = new URL(request.url);

  // required query params
  const portalId = url.searchParams.get("portalId");
  const contentId = url.searchParams.get("contentId");
  const collectionId = url.searchParams.get("collectionId");

  if (!portalId || !contentId || !collectionId) {
    return new Response(JSON.stringify({ error: "Missing portalId/contentId/collectionId" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Build NON-JSONP HubSpot URL (no callback param!)
  const hubspot = new URL("https://api-na2.hubapi.com/comments/v3/comments/thread/public");
  hubspot.searchParams.set("portalId", portalId);
  hubspot.searchParams.set("contentId", contentId);
  hubspot.searchParams.set("collectionId", collectionId);
  hubspot.searchParams.set("limit", url.searchParams.get("limit") || "100");
  hubspot.searchParams.set("offset", url.searchParams.get("offset") || "0");

  // Forward request
  const resp = await fetch(hubspot.toString(), {
    method: "GET",
    headers: {
      "accept": "application/json",
      // optional: forward user-agent
      "user-agent": request.headers.get("user-agent") || "cf-pages",
    },
  });

  const text = await resp.text();

  // Return as JSON with permissive CORS (so your page can fetch it)
  return new Response(text, {
    status: resp.status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}
