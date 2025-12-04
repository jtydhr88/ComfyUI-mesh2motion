import { createApp, type App as VueApp } from 'vue'
import PrimeVue from 'primevue/config'
import { createI18n } from 'vue-i18n'
import Root from './Root.vue'
import en from '../locales/en/main.json'
import zh from '../locales/zh/main.json'

// @ts-ignore - ComfyUI external module
import { app } from '../../../scripts/app.js'
// @ts-ignore - ComfyUI external module
import { api } from '../../../scripts/api.js'

declare global {
  interface Window {
    comfyAPI: {
      button: {
        ComfyButton: new (options: {
          icon?: string
          tooltip?: string
          content?: string
          action?: () => void
        }) => { element: HTMLElement }
      }
    }
  }
}

// i18n setup
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, zh }
})

// Vue app instance management
let mountContainer: HTMLDivElement | null = null
let vueApp: VueApp | null = null
let rootInstance: InstanceType<typeof Root> | null = null

// 3D model nodes that support the editor
const MODEL_3D_NODES = ['Load3D', 'Preview3D', 'SaveGLB']

interface Model3DNode {
  id: number
  widgets?: Array<{
    name: string
    value: string
  }>
  images?: Array<{
    filename: string
    subfolder?: string
    type?: string
  }>
  properties?: Record<string, unknown>
  constructor?: { comfyClass?: string }
}

function isModel3DNode(node: unknown): node is Model3DNode {
  if (!node || typeof node !== 'object') return false
  const n = node as Model3DNode
  const typedNode = node as { constructor?: { comfyClass?: string } }
  const nodeClass = typedNode?.constructor?.comfyClass

  // Check if it's a known 3D model node type
  if (nodeClass && MODEL_3D_NODES.includes(nodeClass)) {
    return true
  }

  // Check if node has 3D model related widgets
  if (n.widgets) {
    const has3DWidget = n.widgets.some(
      (w) =>
        w.name === 'model_file' ||
        w.name === 'mesh' ||
        w.name === '3d_model' ||
        (w.value && typeof w.value === 'string' && /\.(glb|gltf|fbx|obj)$/i.test(w.value))
    )
    if (has3DWidget) return true
  }

  return false
}

function getModelUrlFromNode(node: Model3DNode): string | null {
  const nodeClass = node.constructor?.comfyClass

  // For Preview3D, check properties['Last Time Model File'] first (output folder)
  if (nodeClass === 'Preview3D') {
    const lastModelFile = node.properties?.['Last Time Model File'] as string | undefined
    if (lastModelFile) {
      return buildModelUrl(lastModelFile, 'output')
    }
  }

  // Try node.images first (server-stored models)
  if (node.images?.[0]) {
    const model = node.images[0]
    const params = new URLSearchParams({
      filename: model.filename,
      type: model.type || 'input',
      subfolder: model.subfolder || ''
    })
    return api.apiURL(`/view?${params.toString()}`)
  }

  // Try model-related widgets
  const modelWidget = node.widgets?.find(
    (w) =>
      w.name === 'model_file' ||
      w.name === 'mesh' ||
      w.name === '3d_model' ||
      w.name === 'model'
  )

  if (modelWidget?.value) {
    return buildModelUrl(modelWidget.value, 'input')
  }

  return null
}

function buildModelUrl(value: string, defaultType: string): string | null {
  // Parse format: "subfolder/filename [type]" or "filename"
  const match = value.match(/^(.+?)(?:\s*\[(\w+)\])?$/)
  if (match) {
    const fullPath = match[1]
    const type = match[2] || defaultType
    const lastSlash = fullPath.lastIndexOf('/')
    const subfolder = lastSlash > -1 ? fullPath.substring(0, lastSlash) : ''
    const filename = lastSlash > -1 ? fullPath.substring(lastSlash + 1) : fullPath

    const params = new URLSearchParams({
      filename,
      type,
      subfolder
    })
    return api.apiURL(`/view?${params.toString()}`)
  }
  return null
}

function ensureMesh2MotionInstance(): InstanceType<typeof Root> {
  if (rootInstance) {
    return rootInstance
  }

  // Create mount container
  mountContainer = document.createElement('div')
  mountContainer.id = 'mesh2motion-editor-root'
  document.body.appendChild(mountContainer)

  // Create Vue app
  vueApp = createApp(Root)
  vueApp.use(i18n)
  vueApp.use(PrimeVue)

  rootInstance = vueApp.mount(mountContainer) as InstanceType<typeof Root>

  // Set save callback
  rootInstance.setSaveCallback(handleSaveToComfyUI)

  return rootInstance
}

async function handleSaveToComfyUI(
  modelData: ArrayBuffer,
  filename: string,
  node: Model3DNode | null
): Promise<void> {
  try {
    // Create blob from ArrayBuffer
    const blob = new Blob([modelData], { type: 'model/gltf-binary' })

    // Generate filename with timestamp if not provided
    const finalFilename = filename || `mesh2motion-${Date.now()}.glb`

    // Upload to ComfyUI
    const formData = new FormData()
    formData.append('image', blob, finalFilename)
    formData.append('type', 'input')
    formData.append('subfolder', 'mesh2motion')
    formData.append('overwrite', 'true')

    const uploadResponse = await api.fetchApi('/upload/image', {
      method: 'POST',
      body: formData
    })

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload model')
    }

    const result = await uploadResponse.json()

    // Update node with new model reference
    if (node) {
      const widgetValue = result.subfolder
        ? `${result.subfolder}/${result.name} [input]`
        : `${result.name} [input]`

      // Update node.images
      node.images = [
        {
          filename: result.name,
          subfolder: result.subfolder || '',
          type: 'input'
        }
      ]

      // Find and update model widget
      const modelWidget = node.widgets?.find(
        (w) =>
          w.name === 'model_file' ||
          w.name === 'mesh' ||
          w.name === '3d_model' ||
          w.name === 'model'
      ) as
        | {
            name: string
            value: string
            options?: { values?: string[] }
            callback?: (value: string) => void
          }
        | undefined

      if (modelWidget) {
        // Add to widget options if not exists
        if (modelWidget.options?.values && !modelWidget.options.values.includes(widgetValue)) {
          modelWidget.options.values.push(widgetValue)
        }

        // Update widget value
        modelWidget.value = widgetValue

        // Trigger widget callback to update UI
        modelWidget.callback?.(widgetValue)
      }

      // Mark graph as dirty to trigger re-render
      app.graph.setDirtyCanvas(true, true)
    }

    console.log('[Mesh2Motion] Model saved successfully:', result)
  } catch (error) {
    console.error('[Mesh2Motion] Failed to save model:', error)
    throw error
  }
}

function openMesh2MotionEditor(node?: Model3DNode): void {
  const instance = ensureMesh2MotionInstance()

  if (node) {
    const modelUrl = getModelUrlFromNode(node)
    if (modelUrl) {
      instance.loadModel(modelUrl, node)
    } else {
      instance.openNew(node)
    }
  } else {
    instance.openNew()
  }
}

// Register extension
app.registerExtension({
  name: 'ComfyUI.Mesh2Motion',

  setup() {
    const { ComfyButton } = window.comfyAPI.button

    // Add button to top menu
    const button = new ComfyButton({
      icon: 'cube',
      tooltip: 'Mesh2Motion 3D Editor',
      content: 'Mesh2Motion',
      action: () => openMesh2MotionEditor()
    })

    app.menu?.settingsGroup.append(button)
  },

  getNodeMenuItems(node: unknown) {
    const typedNode = node as { constructor?: { comfyClass?: string } }
    const nodeClass = typedNode?.constructor?.comfyClass

    // Check if it's a 3D model node
    if (!nodeClass || !MODEL_3D_NODES.includes(nodeClass)) {
      // Also check if node has 3D model data
      if (!isModel3DNode(node)) {
        return []
      }
    }

    return [
      null, // Separator
      {
        content: 'Open in Mesh2Motion',
        callback: () => {
          openMesh2MotionEditor(node as Model3DNode)
        }
      }
    ]
  }
})

export { openMesh2MotionEditor }
