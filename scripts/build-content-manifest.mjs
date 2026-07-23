import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const contentRoot = path.resolve(__dirname, '../public/content')

function listFiles(dir, exts) {
  const abs = path.join(contentRoot, dir)
  if (!fs.existsSync(abs)) return []
  return fs
    .readdirSync(abs)
    .filter((name) => exts.some((ext) => name.toLowerCase().endsWith(ext)))
    .sort()
    .map((name) => ({
      id: path.parse(name).name,
      name,
      label: path.parse(name).name.replace(/[_-]+/g, ' '),
      path: `content/${dir}/${name}`,
    }))
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
