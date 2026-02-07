export async function onRequest(context) {
  const { request, params } = context;

  // params.path can be undefined, string, or array
  const raw = params.path ?? "";
  const rest = Array.isArray(raw) ? raw.join("/") : String(raw);

  // Build upstream URL: https://spa.sevenangelsmassage.com/_hcms/<rest>?<query>
  const incoming = new URL(request.url);
  const upstream = new URL(request.url);
  upstream.protocol = "https:";
  upstream.hostname = "spa.sevenangelsmassage.com";
  upstream.pathname = "/_hcms/" + rest;
  upstream.search = incoming.search;

  // Copy headers safely
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("connection");

  const init = {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  };

  const resp = await fetch(upstream.toString(), init);

  // Pass response back (and optionally rewrite redirect locations)
  const outHeaders = new Headers(resp.headers);
  const loc = outHeaders.get("location");
  if (loc) {
    try {
      const u = new URL(loc);
      if (u.hostname === "spa.sevenangelsmassage.com") {
        u.hostname = incoming.hostname; // rewrite redirect back to www
        outHeaders.set("location", u.toString());
      }
    } catch {}
  }

  // Light caching for static assets (optional)
  if (upstream.pathname.endsWith(".js") || upstream.pathname.endsWith(".css")) {
    outHeaders.set("cache-control", "public, max-age=3600");
  }

  return new Response(resp.body, {
    status: resp.status,
    headers: outHeaders,
  });
}
