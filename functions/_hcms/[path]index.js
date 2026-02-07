export async function onRequest(context) {
  const { request, params } = context;

  // Catch-all path after /_hcms/
  const pathParts = params.path || [];
  const path = Array.isArray(pathParts) ? pathParts.join("/") : String(pathParts);

  const upstream = new URL(request.url);
  upstream.hostname = "spa.sevenangelsmassage.com";
  upstream.protocol = "https:";
  upstream.pathname = `/_hcms/${path}`;

  // Clone headers, but drop hop-by-hop headers that can break proxies
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  const init = {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  };

  const resp = await fetch(upstream.toString(), init);

  // Copy response headers (and keep Set-Cookie if HubSpot sends it)
  const outHeaders = new Headers(resp.headers);

  // If upstream returns absolute redirects to spa, rewrite them back to www
  const loc = outHeaders.get("location");
  if (loc) {
    try {
      const u = new URL(loc);
      if (u.hostname === "spa.sevenangelsmassage.com") {
        u.hostname = new URL(request.url).hostname;
        outHeaders.set("location", u.toString());
      }
    } catch (_) {}
  }

  // Cache static-ish assets a bit (optional but nice)
  // You can tune this later.
  if (upstream.pathname.endsWith(".js") || upstream.pathname.endsWith(".css")) {
    outHeaders.set("cache-control", "public, max-age=3600");
  }

  return new Response(resp.body, {
    status: resp.status,
    headers: outHeaders,
  });
}
