import type { CSSProperties } from 'react'
import type { LabelScene, SceneNode } from './scenes'

function fontFamily(bold?: boolean) {
  return bold ? 'GilroyBold, Gilroy, sans-serif' : 'Gilroy, sans-serif'
}

function renderNode(node: SceneNode, i: number) {
  switch (node.type) {
    case 'rect':
      return (
        <rect
          key={i}
          x={node.x}
          y={node.y}
          width={node.w}
          height={node.h}
          fill={node.fill ?? 'none'}
          stroke={node.stroke ?? 'none'}
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
          stroke={node.stroke}
          strokeWidth={node.strokeWidth ?? 1}
          strokeDasharray={node.dash}
        />
      )
    case 'image':
      return (
        <image
          key={i}
          href={node.href}
          x={node.x}
          y={node.y}
          width={node.w}
          height={node.h}
          preserveAspectRatio={
            node.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'
          }
        />
      )
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
              fill={node.fill}
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
}: {
  scene: LabelScene
  className?: string
}) {
  const vb = `0 0 ${scene.width} ${scene.height}`
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
      {scene.nodes.map(renderNode)}
    </svg>
  )
}
