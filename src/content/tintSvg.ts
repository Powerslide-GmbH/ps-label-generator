/** Recolor SVG fills and return a blob URL. Skips none/transparent. */
export async function recolorSvgUrl(
  href: string,
  tintHex: string,
): Promise<string> {
  const res = await fetch(href)
  if (!res.ok) throw new Error(`Failed to fetch SVG ${href}`)
  let text = await res.text()
  const hex = tintHex.startsWith('#') ? tintHex : `#${tintHex}`

  text = text.replace(
    /fill:\s*(?!none\b)(?!transparent\b)(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|[a-zA-Z]+)/g,
    `fill:${hex}`,
  )
  text = text.replace(
    /fill="(?!none\b)(?!transparent\b)(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|[a-zA-Z]+)"/g,
    `fill="${hex}"`,
  )
  text = text.replace(
    /fill='(?!none\b)(?!transparent\b)(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|[a-zA-Z]+)'/g,
    `fill='${hex}'`,
  )
  // Legacy black→tint helpers still useful when source is near-black
  text = text
    .replace(/#1d1d1b/gi, hex)
    .replace(/#000000/gi, hex)
    .replace(/#000(?![0-9a-f])/gi, hex)

  const blob = new Blob([text], { type: 'image/svg+xml' })
  return URL.createObjectURL(blob)
}

/** @deprecated use recolorSvgUrl */
export async function tintSvgUrl(
  href: string,
  tintHex: string,
): Promise<string> {
  return recolorSvgUrl(href, tintHex)
}
