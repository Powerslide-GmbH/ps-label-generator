# PS Labels Generator

Herramienta est�tica (Vite + React + TypeScript) para generar etiquetas de patines Powerslide:

- Size label single / dual ? PDF (negro K)
- Box label ? PDF (CMYK vectorial + foto)
- Size chart ? JPG 1200�600

## Desarrollo local

```bash
npm install
npm run dev
```

Abre la URL de Vite (Chrome/Edge). No hace falta GitHub Pages para probar.

```bash
npm test
npm run build
npm run preview
```

## Contenido (JSON puro)

Cat�logo en `public/content/`:

```text
public/content/
  models/           # un JSON por modelo (preset)
  sizecharts/       # un JSON por last / tabla de tallas
  logos/            # SVG compartidos
  fonts/            # Gilroy TTF
  products/         # fotos JPG/PNG/TIF
  icc/              # CoatedFOGRA39.icc
  manifest.json     # generado con npm run content:manifest
```

**No se usa XLSX en runtime.** El Excel de `documentation/` es solo referencia hist�rica.

### A�adir un size chart

1. Crea `public/content/sizecharts/mi-last.json` con `{ id, name, mode, rows }`.
2. Ejecuta `npm run content:manifest`.
3. Reinicia / recarga la app.

### A�adir un modelo

1. Crea `public/content/models/mi-modelo.json` con el esquema `ModelPreset`.
2. Aseg�rate de que `sizeChartId` y los IDs de logos/foto existen.
3. Ejecuta `npm run content:manifest`.

Desde la UI tambi�n puedes **Export / Import model JSON** y **Export / Import size chart JSON**. Los imports quedan en la sesi�n (`localStorage`); para publicarlos globalmente c�pialos a las carpetas anteriores.

## Flujo

1. Elige un preset de modelo (rellena tallas, logos, outputs�).
2. Edita SKU, t�tulo (rich text WYSIWYG), foto y **tabla de tallas**.
3. Ajusta logos/materiales (selectores compactos + modal).
4. Marca outputs (cards) y Export.

Varias salidas ? ZIP. Una sola ? archivo directo.

## Referencias

Los ejemplos de referencia est�n en `documentation/` (PDFs / JPG / masters).
