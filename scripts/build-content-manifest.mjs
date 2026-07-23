import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const contentRoot = path.resolve(__dirname, '../public/content')

function svgAspectRatio(absPath) {
  try {
    const text = fs.readFileSync(absPath, 'utf8')
    const vb = text.match(/viewBox\s*=\s*["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']/i)
    if (vb) {
      const w = Number(vb[3])
      const h = Number(vb[4])
      if (w > 0 && h > 0) return w / h
    }
    const wAttr = text.match(/\bwidth\s*=\s*["']([\d.]+)(?:px)?["']/i)
    const hAttr = text.match(/\bheight\s*=\s*["']([\d.]+)(?:px)?["']/i)
    if (wAttr && hAttr) {
      const w = Number(wAttr[1])
      const h = Number(hAttr[1])
      if (w > 0 && h > 0) return w / h
    }
  } catch {
    // ignore
  }
  return undefined
}

function listFiles(dir, exts) {
  const abs = path.join(contentRoot, dir)
  if (!fs.existsSync(abs)) return []
  return fs
    .readdirSync(abs)
    .filter((name) => exts.some((ext) => name.toLowerCase().endsWith(ext)))
    .sort()
    .map((name) => {
      const entry = {
        id: path.parse(name).name,
        name,
        label: path.parse(name).name.replace(/[_-]+/g, ' '),
        path: `content/${dir}/${name}`,
      }
      if (dir === 'logos' && name.toLowerCase().endsWith('.svg')) {
        const aspectRatio = svgAspectRatio(path.join(abs, name))
        if (aspectRatio) entry.aspectRatio = Number(aspectRatio.toFixed(4))
      }
      return entry
    })
}

const manifest = {
  generatedAt: new Date().toISOString(),
  logos: listFiles('logos', ['.svg', '.png', '.jpg', '.jpeg', '.webp']),
  fonts: listFiles('fonts', ['.ttf', '.otf']),
  products: listFiles('products', ['.jpg', '.jpeg', '.png', '.tif', '.tiff']),
  sizecharts: listFiles('sizecharts', ['.json']),
  models: listFiles('models', ['.json']),
  icc: listFiles('icc', ['.icc', '.icm']),
}

const out = path.join(contentRoot, 'manifest.json')
fs.writeFileSync(out, JSON.stringify(manifest, null, 2))
console.log(
  `Wrote ${out} (${manifest.logos.length} logos, ${manifest.models.length} models, ${manifest.sizecharts.length} sizecharts)`,
)
