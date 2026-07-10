const HUES = ['blue', 'teal', 'purple', 'pink', 'orange', 'green', 'yellow'] as const
export type PlatformHue = typeof HUES[number]

/**
 * Mapping filière → couleur, imposé par la DITSI pour cohérence visuelle
 * dans toute l'appli. L'ordre compte : le premier motif qui matche gagne.
 * Fallback (hash) uniquement pour les plateformes qui ne correspondent à
 * aucune filière connue.
 */
const CODE_TO_HUE: Array<[RegExp, PlatformHue]> = [
  [/\bMASTER\b/i,   'purple'],  // P6 MASTER, P8 Master, …
  [/\bLSHE\b/i,     'green'],   // P13 LSHE
  [/\bSEJA\b/i,     'orange'],  // P13 SEJA
  [/\bSTNC?\d*\b/i, 'blue'],    // P13 STN, P10 STNC1, P10 STNC2
]

/**
 * Assigne une couleur à une plateforme :
 *  1) Si son nom contient un code filière connu → couleur imposée.
 *  2) Sinon, hash déterministe → une des 7 pastels (même plateforme = même couleur).
 */
export function hueForPlatform(name: string): PlatformHue {
  for (const [re, hue] of CODE_TO_HUE) {
    if (re.test(name)) return hue
  }
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]
}
