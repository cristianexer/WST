/** Absolute public-file URLs also work inside CSS variables resolved from a bundled stylesheet. */
export function publicAssetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}${path}`, document.baseURI).href;
}
