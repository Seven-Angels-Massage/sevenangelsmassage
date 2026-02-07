export async function onRequest(context) {
  const { request, params } = context;

  // Cloudflare Pages will put the rest of the path into params.path
  // It can be a string or array depending on runtime.
  const raw = params.path ?? "";
  const rest = Array.isArray(raw) ? raw.join("/") : String(raw);

  const upstream = new URL(request.url);
  upstream.protocol = "https:";
  upstream.hostname = "spa.sevenangelsmassage.com";
  upstream.pathname = `/_hcms/${rest}`;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  const init = {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.arrayBuffer(),
    redirect: "manual",
  };

  const resp = await fetch(upstream.toString(), init);

  const outHeaders = new Headers(resp.headers);

  // Rewrite Location redirects back to current host (optional but helpful)
  const loc = outHeaders.get("location");
  if (loc) {
    try {
      const u = new URL(loc);
      if (u.hostname === "spa.sevenangelsmassage.com") {
        u.hostname = new URL(request.url).hostname;
        outHeaders.set("location", u.toString());
      }
    } catch {}
  }

  // Light caching for static assets
  if (upstream.pathname.endsWith(".js") || upstream.pathname.endsWith(".css")) {
    outHeaders.set("cache-control", "public, max-age=3600");
  }

  return new Response(resp.body, {
    status: resp.status,
    headers: outHeaders,
  });
}
