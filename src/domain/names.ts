export function kebab(parts: Array<string | null | undefined>): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function exportBasename(sku: string, title: string, kind: string): string {
  return kebab([sku, title, kind])
}
