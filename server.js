// server.js
// Seven Angels Massage – Node/Express web service
// Serves static site from /public, applies HSTS + vCard headers,
// and reproduces all redirects that were in Netlify's _redirects file.

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// So Render / proxies don't break protocol detection
app.set("trust proxy", true);

/**
 * 1) Global HSTS header (from your _headers)
 *    Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
 */
app.use((req, res, next) => {
  res.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );
  next();
});

/**
 * 2) Optional host normalization:
 *    If request comes in on apex, send 301 → https://www.sevenangelsmassage.com
 *    (preserving path + query).
 *    This mirrors what Render / Netlify do for "apex → www".
 */
const CANONICAL_HOST = "www.sevenangelsmassage.com";

app.use((req, res, next) => {
  const host = (req.headers.host || "").toLowerCase();

  if (host === "sevenangelsmassage.com") {
    const targetUrl = `https://${CANONICAL_HOST}${req.originalUrl}`;
    return res.redirect(301, targetUrl);
  }

  next();
});

app.get('/healthz', (req, res) => {
  res.type('text/plain').send('OK');
});

/**
 * 3) Special headers for the vCard file
 *    Matches your _headers block exactly.
 *
 *    /files/seven-angels-massage.vcf
 *      Content-Type: text/vcard; charset=utf-8
 *      Content-Disposition: attachment; filename="seven-angels-massage.vcf"
 *      Cache-Control: public, max-age=864000
 *      X-Content-Type-Options: nosniff
 */
app.get("/files/seven-angels-massage.vcf", (req, res) => {
  res.set({
    "Content-Type": "text/vcard; charset=utf-8",
    "Content-Disposition": 'attachment; filename="seven-angels-massage.vcf"',
    "Cache-Control": "public, max-age=864000",
    "X-Content-Type-Options": "nosniff",
  });

  res.sendFile(
    path.join(__dirname, "public", "files", "seven-angels-massage.vcf")
  );
});

/**
 * Helper to define simple redirects.
 * status defaults to 302 if not provided.
 */
function redirect(fromPath, toPath, status) {
  app.get(fromPath, (req, res) => {
    res.redirect(status || 302, toPath);
  });
}

/**
 * 4) Redirects – mirror of your _redirects file
 * --------------------------------------------------
 * I’m grouping them by section, but every rule you had
 * is covered 1:1 (same target + same status code).
 */

/* ----- Clean /home normalization ----- */
// /home          → /  (301)
// /home/         → /  (301)
// /home/jp(/)    → /  (302)
// /home/kr(/)    → /  (302)
// /home/cn(/)    → /  (302)
redirect("/home", "/", 301);
redirect("/home/", "/", 301);
["jp", "kr", "cn"].forEach((lang) => {
  redirect(`/home/${lang}`, "/", 302);
  redirect(`/home/${lang}/`, "/", 302);
});

/* ----- /about-us trailing slash + language versions ----- */
// /about-us/        → /about-us        (301)
// /about-us/jp(/)   → /about-us        (302)
// /about-us/kr(/)   → /about-us        (302)
// /about-us/cn(/)   → /about-us        (302)
redirect("/about-us/", "/about-us", 301);
["jp", "kr", "cn"].forEach((lang) => {
  redirect(`/about-us/${lang}`, "/about-us", 302);
  redirect(`/about-us/${lang}/`, "/about-us", 302);
});

/* ----- /articles trailing slash ----- */
// /articles/        → /articles        (301)
redirect("/articles/", "/articles", 301);

/* ----- /homecondo-massage → /services-details ----- */
// /homecondo-massage/        → /services-details   (301)
// /homecondo-massage/jp(/)   → /services-details   (302)
// /homecondo-massage/kr(/)   → /services-details   (302)
// /homecondo-massage/cn(/)   → /services-details   (302)
redirect("/homecondo-massage/", "/services-details", 301);
["jp", "kr", "cn"].forEach((lang) => {
  redirect(`/homecondo-massage/${lang}`, "/services-details", 302);
  redirect(`/homecondo-massage/${lang}/`, "/services-details", 302);
});

/* ----- /hotel-massage → /services-details ----- */
// /hotel-massage/        → /services-details   (301)
// /hotel-massage/jp(/)   → /services-details   (302)
// /hotel-massage/kr(/)   → /services-details   (302)
// /hotel-massage/cn(/)   → /services-details   (302)
redirect("/hotel-massage/", "/services-details", 301);
["jp", "kr", "cn"].forEach((lang) => {
  redirect(`/hotel-massage/${lang}`, "/services-details", 302);
  redirect(`/hotel-massage/${lang}/`, "/services-details", 302);
});

/* ----- /services-details trailing slash ----- */
// /services-details/     → /services-details    (301)
redirect("/services-details/", "/services-details", 301);

/* ----- /contact-us trailing slash + language versions ----- */
// /contact-us/        → /contact-us        (301)
// /contact-us/jp(/)   → /contact-us        (302)
// /contact-us/kr(/)   → /contact-us        (302)
// /contact-us/cn(/)   → /contact-us        (302)
redirect("/contact-us/", "/contact-us", 301);
["jp", "kr", "cn"].forEach((lang) => {
  redirect(`/contact-us/${lang}`, "/contact-us", 302);
  redirect(`/contact-us/${lang}/`, "/contact-us", 302);
});

/* ----- /privacy-policy trailing slash + language versions ----- */
// /privacy-policy/        → /privacy-policy        (301)
// /privacy-policy/jp(/)   → /privacy-policy        (302)
// /privacy-policy/kr(/)   → /privacy-policy        (302)
// /privacy-policy/cn(/)   → /privacy-policy        (302)
redirect("/privacy-policy/", "/privacy-policy", 301);
["jp", "kr", "cn"].forEach((lang) => {
  redirect(`/privacy-policy/${lang}`, "/privacy-policy", 302);
  redirect(`/privacy-policy/${lang}/`, "/privacy-policy", 302);
});

/* ----- /terms-and-conditions trailing slash + language versions ----- */
// /terms-and-conditions/        → /terms-and-conditions        (301)
// /terms-and-conditions/jp(/)   → /terms-and-conditions        (302)
// /terms-and-conditions/kr(/)   → /terms-and-conditions        (302)
// /terms-and-conditions/cn(/)   → /terms-and-conditions        (302)
redirect("/terms-and-conditions/", "/terms-and-conditions", 301);
["jp", "kr", "cn"].forEach((lang) => {
  redirect(`/terms-and-conditions/${lang}`, "/terms-and-conditions", 302);
  redirect(`/terms-and-conditions/${lang}/`, "/terms-and-conditions", 302);
});

/**
 * 5) Static files from /public
 *    This is the equivalent of what your Render Static site / Netlify
 *    were serving from the "public" directory.
 */
app.use(express.static(path.join(__dirname, "public")));

/**
 * 6) Optional 404 fallback to public/404.html
 *    (matches your commented SPA-style fallback idea, but as a server 404)
 */
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

app.listen(PORT, () => {
  console.log(`Seven Angels Massage server listening on port ${PORT}`);
});