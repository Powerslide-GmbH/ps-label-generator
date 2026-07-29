# Comparación con las etiquetas de referencia

Los PDF de `documentation/referencias` se renderizaron y revisaron visualmente, uno por uno. Cuando el PDF contenía una imagen de producto reutilizable, se extrajo y se incorporó al catálogo local.

| Referencia | Preset de la aplicación | Composición reproducida |
| --- | --- | --- |
| `904722_PS_RACING_ACCEL_Ti_BootOnly_boxlabel.pdf` | ACCEL Boot Only | Tabla dividida, logos junto a la tabla, marca y título abajo a la izquierda, producto a la derecha |
| `Combine of 904723_904724_PS_RACING_ACCEL_PDS_BootOnly_boxlabel.pdf` | ACCEL EVO PDS Dual 120×100 | Tabla ancha, marca alineada a la derecha, dos columnas de producto y logos en el pie |
| `940711_940712_PS_KIDS_boxlabels_Rocket_20250225.pdf` | Rocket Kids Dual 120x100 | Tabla compacta de tres columnas, marca centrada, dos productos y bloque legal inferior |
| `904719_904720_PS_TripleX_adjustableEVO_KIDS_boxlabel.pdf` | Triple X Adjustable 125x110 | Encabezado lateral con tabla compacta, dos productos y logos en el pie |
| `908468_HC_EVO_2026_BOOT_Box_labels.pdf` | HC EVO Pro Boot | Tabla superior, bloque de marca y datos a la izquierda, producto a la derecha |
| `908472_ZOOM_Torelli_Pro_80_Boxlabels.pdf` | ZOOM Torelli Pro 80 | Tabla superior, bloque de marca y datos a la izquierda, producto a la derecha |
| `908489_Next_Outback_150_PDS_2026_Box_label.pdf` | NEXT Outback 150 PDS | Tabla superior, bloque de marca y datos a la izquierda, producto a la derecha |
| `908468_HC_EVO_2026_BOOT_Size_labels.pdf` | HC EVO Pro Boot · Size normal | Distribución de etiquetas en cuatro columnas |
| `908472_ZOOM_Torelli_Pro_80_Size_labels.pdf` | ZOOM Torelli Pro 80 · Size normal | Distribución de etiquetas en cuatro columnas |
| `908489_Next_Outback_150_PDS_2026_Size_label.pdf` | NEXT Outback 150 PDS · Size normal | Distribución de etiquetas en cuatro columnas |

Los dos PDF de Triple X son copias idénticas y comparten el mismo preset.

## Mejoras incorporadas

- Plantillas explícitas para composiciones simples, de tabla dividida y de dos productos.
- Ajustes persistentes por preset para posición de logos, alineación y escala de marca, escala de producto, ancho de la columna de título, separación y márgenes.
- Número de columnas configurable para hojas de etiquetas normales y dobles.
- Imágenes de producto extraídas de los PDF y guardadas en `public/content/products`.
- Selección del formulario adaptada al modo de producto simple o doble, con ajustes avanzados plegables y botón de restauración.
- Migración de documentos y presets antiguos a los nuevos valores sin romper datos guardados.
- Carga de logos PDF/SVG y conversión de imágenes rasterizadas a `/DeviceCMYK` al generar PDF.
- Size chart web rediseñado y exportado como WebP de 1200 × 630 px.

## Diferencias deliberadamente aproximadas

- Algunas ilustraciones, logos y detalles legales dependen de los recursos disponibles en el catálogo; la composición y las proporciones son editables aunque el arte no sea idéntico.
- Las imágenes extraídas conservan su recorte y espacio interno originales. La escala de producto permite compensarlo por preset.
- La tipografía de previsualización puede variar ligeramente respecto al PDF final según las fuentes instaladas o cargadas en el navegador.
- Los PDF de logo conservan sus vectores y espacios de color de origen; para producción deben suministrarse ya en CMYK. Los SVG, PNG y JPG se rasterizan y convierten a DeviceCMYK durante la exportación.
