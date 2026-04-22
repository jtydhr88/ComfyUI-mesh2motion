// @ts-ignore - ComfyUI external module
import { api } from '../../../scripts/api.js'

export const POST_MESSAGE_ORIGIN = window.location.origin

export const MODEL_3D_NODES = ['Load3D', 'Preview3D', 'SaveGLB']
export const IMAGE_NODES = ['LoadImage']

export interface Model3DNode {
  id: number
  widgets?: Array<{
    name: string
    value: string
    options?: { values?: string[] }
    callback?: (value: string) => void
  }>
  images?: Array<{
    filename: string
    subfolder?: string
    type?: string
  }>
  properties?: Record<string, unknown>
  constructor?: { comfyClass?: string }
}

export interface ImageNode {
  id: number
  imgs?: HTMLImageElement[]
  images?: Array<{
    filename: string
    subfolder?: string
    type?: string
  }>
  widgets?: Array<{
    name: string
    value: string
    options?: { values?: string[] }
    callback?: (value: string) => void
  }>
  widgets_values?: unknown[]
  properties?: Record<string, unknown>
  constructor?: { comfyClass?: string }
}

export function isModel3DNode (node: unknown): node is Model3DNode {
  if (!node || typeof node !== 'object') return false
  const n = node as Model3DNode
  const typedNode = node as { constructor?: { comfyClass?: string } }
  const nodeClass = typedNode?.constructor?.comfyClass

  if (nodeClass && MODEL_3D_NODES.includes(nodeClass)) return true

  if (n.widgets) {
    const has3DWidget = n.widgets.some(
      (w) =>
        w.name === 'model_file' ||
        w.name === 'mesh' ||
        w.name === '3d_model' ||
        (w.value && typeof w.value === 'string' && /\.(glb|gltf|fbx|obj)$/i.test(w.value)),
    )
    if (has3DWidget) return true
  }

  return false
}

export function isImageNode (node: unknown): node is ImageNode {
  if (!node || typeof node !== 'object') return false
  const typedNode = node as { constructor?: { comfyClass?: string } }
  const nodeClass = typedNode?.constructor?.comfyClass
  return nodeClass ? IMAGE_NODES.includes(nodeClass) : false
}

export function getModelUrlFromNode (node: Model3DNode): string | null {
  const nodeClass = node.constructor?.comfyClass

  if (nodeClass === 'Preview3D') {
    const lastModelFile = node.properties?.['Last Time Model File'] as string | undefined
    if (lastModelFile) return buildModelUrl(lastModelFile, 'output')
  }

  if (node.images?.[0]) {
    const model = node.images[0]
    const params = new URLSearchParams({
      filename: model.filename,
      type: model.type || 'input',
      subfolder: model.subfolder || '',
    })
    return api.apiURL(`/view?${params.toString()}`)
  }

  const modelWidget = node.widgets?.find(
    (w) =>
      w.name === 'model_file' ||
      w.name === 'mesh' ||
      w.name === '3d_model' ||
      w.name === 'model',
  )

  if (modelWidget?.value) return buildModelUrl(modelWidget.value, 'input')

  return null
}

export function buildModelUrl (value: string, defaultType: string): string | null {
  const match = value.match(/^(.+?)(?:\s*\[(\w+)\])?$/)
  if (!match) return null

  const fullPath = match[1]
  const type = match[2] || defaultType
  const lastSlash = fullPath.lastIndexOf('/')
  const subfolder = lastSlash > -1 ? fullPath.substring(0, lastSlash) : ''
  const filename = lastSlash > -1 ? fullPath.substring(lastSlash + 1) : fullPath

  const params = new URLSearchParams({ filename, type, subfolder })
  return api.apiURL(`/view?${params.toString()}`)
}
