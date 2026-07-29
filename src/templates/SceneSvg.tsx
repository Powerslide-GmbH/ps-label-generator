import type { CSSProperties } from 'react'
import type { LabelScene, SceneNode } from './scenes'

function fontFamily(bold?: boolean) {
  return bold ? 'GilroyBold, Gilroy, sans-serif' : 'Gilroy, sans-serif'
}

function renderNode(node: SceneNode, i: number, transformColor: (color: string) => string) {
  switch (node.type) {
    case 'rect':
      return (
        <rect
          key={i}
          x={node.x}
          y={node.y}
          width={node.w}
          height={node.h}
          fill={node.fill ? transformColor(node.fill) : 'none'}
          stroke={node.stroke ? transformColor(node.stroke) : 'none'}
          strokeWidth={node.strokeWidth ?? 0}
          rx={node.radius ?? 0}
          ry={node.radius ?? 0}
        />
      )
    case 'line':
      return (
        <line
          key={i}
          x1={node.x1}
          y1={node.y1}
          x2={node.x2}
          y2={node.y2}
          stroke={transformColor(node.stroke)}
          strokeWidth={node.strokeWidth ?? 1}
          strokeDasharray={node.dash}
        />
      )
    case 'image':
      {
        const xAlign =
          node.alignX === 'left' ? 'xMin' : node.alignX === 'right' ? 'xMax' : 'xMid'
        const yAlign =
          node.alignY === 'top' ? 'YMin' : node.alignY === 'bottom' ? 'YMax' : 'YMid'
      return (
        <image
          key={i}
          href={node.href}
          x={node.x}
          y={node.y}
          width={node.w}
          height={node.h}
          preserveAspectRatio={
            `${xAlign}${yAlign} ${node.fit === 'cover' ? 'slice' : 'meet'}`
          }
        />
      )
      }
    case 'text': {
      const transform = node.rotate
        ? `rotate(${node.rotate} ${node.x} ${node.y})`
        : undefined
      return (
        <text
          key={i}
          x={node.x}
          y={node.y}
          textAnchor={node.anchor ?? 'start'}
          transform={transform}
          style={{ whiteSpace: 'pre' } as CSSProperties}
        >
          {node.runs.map((run, ri) => (
            <tspan
              key={ri}
              fill={transformColor(node.fill)}
              fontFamily={fontFamily(run.bold)}
              fontSize={run.fontSize ?? 10}
              fontWeight={run.bold ? 700 : 400}
            >
              {run.text}
            </tspan>
          ))}
        </text>
      )
    }
  }
}

export function SceneSvg({
  scene,
  className,
  colorTransform,
}: {
  scene: LabelScene
  className?: string
  colorTransform?: (color: string) => string
}) {
  const vb = `0 0 ${scene.width} ${scene.height}`
  const transformColor = colorTransform ?? ((color: string) => color)
  return (
    <svg
      className={className}
      viewBox={vb}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      style={{
        aspectRatio: `${scene.width} / ${scene.height}`,
        width: '100%',
        height: 'auto',
        maxHeight: '70vh',
      }}
    >
      {scene.nodes.map((node, index) => renderNode(node, index, transformColor))}
    </svg>
  )
}
