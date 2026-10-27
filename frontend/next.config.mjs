/*
 * The API behind this app's own origin, where API_ORIGIN is set
 * (docs/DEPLOYMENT.md).
 *
 * Sign-in is a Sanctum session cookie (ADR-002), which only works when the
 * browser sees the app and the API on one site. On a custom domain that is two
 * sibling subdomains. Where there is no domain of one's own — the public demo,
 * on Vercel's addresses — the two deployments cannot share a cookie at all
 * (vercel.app is a public suffix), so the app forwards the API's two paths to
 * it instead: the browser only ever talks to this origin, and the cookie is
 * this origin's. NEXT_PUBLIC_API_URL is then this app's own address, so the
 * client asks for `/api/v1/…` on the page's own origin and lands here.
 *
 * API_ORIGIN is read at build time, on the server, and never reaches the
 * browser bundle.
 */
const apiOrigin = process.env.API_ORIGIN?.replace(/\/+$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  /*
   * Next's floating dev indicator, off.
   *
   * It is a development-only badge — it never ships — but it sits in the
   * bottom corner of every screen while the application is being looked at,
   * which is the one thing a design pass cannot have in the frame. It has
   * also cost real time once already: it is a button labelled "Next", and it
   * made `getByRole('button', { name: 'Next' })` ambiguous in the sign-up
   * spec's wizard (TESTING_STRATEGY.md §5).
   *
   * Nothing is lost that is not a keystroke away: the same panel opens from
   * the browser's own devtools.
   */
  devIndicators: false,

  async rewrites() {
    if (!apiOrigin) return [];

    return [
      { source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` },
      { source: '/sanctum/:path*', destination: `${apiOrigin}/sanctum/:path*` },
    ];
  },
};

export default nextConfig;
