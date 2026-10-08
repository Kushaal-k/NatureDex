/** Keep pairing in the fragment; never send it to the static site's server. */
export function computerLink(value: string, currentOrigin: string): string {
  let link: URL;
  try { link = new URL(value.trim()); }
  catch { throw new Error('Paste the complete HTTPS phone link from your laptop.'); }
  if (link.protocol !== 'https:' || link.username || link.password) {
    throw new Error('Use the private HTTPS phone link from your laptop.');
  }
  if (link.origin === currentOrigin) {
    throw new Error('Use your laptop’s phone link, rather than this website’s address.');
  }
  return link.href;
}
