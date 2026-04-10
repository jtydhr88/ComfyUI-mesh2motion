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

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, zh }
})

let mountContainer: HTMLDivElement | null = null
let vueApp: VueApp | null = null
let rootInstance: InstanceType<typeof Root> | null = null

const MODEL_3D_NODES = ['Load3D', 'Preview3D', 'SaveGLB']

const IMAGE_NODES = ['LoadImage']

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

interface ImageNode {
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
  }>
  widgets_values?: unknown[]
  properties?: Record<string, unknown>
  constructor?: { comfyClass?: string }
}

function isModel3DNode(node: unknown): node is Model3DNode {
  if (!node || typeof node !== 'object') return false
  const n = node as Model3DNode
  const typedNode = node as { constructor?: { comfyClass?: string } }
  const nodeClass = typedNode?.constructor?.comfyClass

  if (nodeClass && MODEL_3D_NODES.includes(nodeClass)) {
    return true
  }

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

function isImageNode(node: unknown): node is ImageNode {
  if (!node || typeof node !== 'object') return false
  const typedNode = node as { constructor?: { comfyClass?: string } }
  const nodeClass = typedNode?.constructor?.comfyClass
  return nodeClass ? IMAGE_NODES.includes(nodeClass) : false
}

function getModelUrlFromNode(node: Model3DNode): string | null {
  const nodeClass = node.constructor?.comfyClass

  if (nodeClass === 'Preview3D') {
    const lastModelFile = node.properties?.['Last Time Model File'] as string | undefined
    if (lastModelFile) {
      return buildModelUrl(lastModelFile, 'output')
    }
  }

  if (node.images?.[0]) {
    const model = node.images[0]
    const params = new URLSearchParams({
      filename: model.filename,
      type: model.type || 'input',
      subfolder: model.subfolder || ''
    })
    return api.apiURL(`/view?${params.toString()}`)
  }

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

  mountContainer = document.createElement('div')
  mountContainer.id = 'mesh2motion-editor-root'
  document.body.appendChild(mountContainer)

  vueApp = createApp(Root)
  vueApp.use(i18n)
  vueApp.use(PrimeVue)

  rootInstance = vueApp.mount(mountContainer) as InstanceType<typeof Root>

  rootInstance.setSaveCallback(handleSaveToComfyUI)
  rootInstance.setImageExportCallback(handleImageExportToComfyUI)

  return rootInstance
}

async function handleSaveToComfyUI(
  modelData: ArrayBuffer,
  filename: string,
  node: Model3DNode | null
): Promise<void> {
  try {
    const blob = new Blob([modelData], { type: 'model/gltf-binary' })

    const finalFilename = filename || `mesh2motion-${Date.now()}.glb`

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

    if (node) {
      const widgetValue = result.subfolder
        ? `${result.subfolder}/${result.name} [input]`
        : `${result.name} [input]`

      node.images = [
        {
          filename: result.name,
          subfolder: result.subfolder || '',
          type: 'input'
        }
      ]

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
        if (modelWidget.options?.values && !modelWidget.options.values.includes(widgetValue)) {
          modelWidget.options.values.push(widgetValue)
        }

        modelWidget.value = widgetValue

        modelWidget.callback?.(widgetValue)
      }

      app.graph.setDirtyCanvas(true, true)
    }

    console.log('[Mesh2Motion] Model saved successfully:', result)

    // If there's an active editor task from a ComfyUI node, complete it
    const editorTaskId = (window as any).__mesh2motion_editor_task_id
    if (editorTaskId) {
      const filePath = result.subfolder
        ? `${result.subfolder}/${result.name}`
        : result.name
      try {
        await api.fetchApi('/mesh2motion/api/task-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: editorTaskId,
            status: 'ok',
            file_path: filePath,
          }),
        })
        console.log(`[Mesh2Motion] Editor task ${editorTaskId} completed`)
      } catch (err) {
        console.error('[Mesh2Motion] Failed to complete editor task:', err)
      }
      delete (window as any).__mesh2motion_editor_task_id
    }
  } catch (error) {
    console.error('[Mesh2Motion] Failed to save model:', error)
    throw error
  }
}

function findLoadImageNode(): ImageNode | null {
  const graph = app.graph
  if (!graph) return null

  const selectedNodes = graph.list_of_graphcanvas?.[0]?.selected_nodes

  if (selectedNodes) {
    for (const nodeId of Object.keys(selectedNodes)) {
      const node = graph.getNodeById(Number(nodeId))
      const nodeClass = node?.constructor?.comfyClass
      if (nodeClass && IMAGE_NODES.includes(nodeClass)) {
        return node as ImageNode
      }
    }
  }

  const nodes = graph._nodes || []
  for (const node of nodes) {
    const nodeClass = node?.constructor?.comfyClass
    if (nodeClass && IMAGE_NODES.includes(nodeClass)) {
      return node as ImageNode
    }
  }

  return null
}

async function handleImageExportToComfyUI(
  imageDataUrl: string,
  filename: string,
  width: number,
  height: number,
  _node: Model3DNode | null
): Promise<void> {
  try {
    const response = await fetch(imageDataUrl)
    const blob = await response.blob()

    const finalFilename = filename || `mesh2motion-render-${Date.now()}.png`

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
      throw new Error('Failed to upload image')
    }

    const result = await uploadResponse.json()

    const imageNode = findLoadImageNode()

    if (imageNode) {
      const widgetValue = result.subfolder
        ? `${result.subfolder}/${result.name}`
        : result.name

      imageNode.images = [
        {
          filename: result.name,
          subfolder: result.subfolder || '',
          type: 'input'
        }
      ]

      const imageWidget = imageNode.widgets?.find((w) => w.name === 'image') as
        | {
            name: string
            value: string
            options?: { values?: string[] }
            callback?: (value: string) => void
          }
        | undefined

      if (imageWidget) {
        if (imageWidget.options?.values && !imageWidget.options.values.includes(widgetValue)) {
          imageWidget.options.values.push(widgetValue)
        }

        imageWidget.value = widgetValue

        if (imageNode.widgets_values && imageNode.widgets) {
          const widgetIndex = (imageNode.widgets as { name: string }[]).findIndex(
            (w) => w.name === 'image'
          )
          if (widgetIndex >= 0) {
            imageNode.widgets_values[widgetIndex] = widgetValue
          }
        }

        if (imageNode.properties) {
          imageNode.properties['image'] = widgetValue
        }

        imageWidget.callback?.(widgetValue)
      }

      // Refresh node preview image
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = imageDataUrl
      await new Promise((resolve) => {
        img.onload = resolve
      })
      imageNode.imgs = [img]

      app.graph.setDirtyCanvas(true, true)

      console.log('[Mesh2Motion] Image exported and LoadImage node updated:', result, `(${width}x${height})`)
    } else {
      console.log('[Mesh2Motion] Image exported (no LoadImage node found):', result, `(${width}x${height})`)
    }
  } catch (error) {
    console.error('[Mesh2Motion] Failed to export image:', error)
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

function openMesh2MotionExplore(node?: ImageNode): void {
  const instance = ensureMesh2MotionInstance()
  instance.openExplore(node as unknown as Model3DNode)
}

// ── Mesh2MotionExplore node: embedded 3D scene + screenshot output ──────────

function captureFromMesh2MotionIframe(iframe: HTMLIFrameElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler)
      reject(new Error('Mesh2Motion capture timeout'))
    }, 15000)

    const handler = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return
      if (event.data?.type === 'mesh2motion:captureResult') {
        clearTimeout(timeout)
        window.removeEventListener('message', handler)
        resolve(event.data.data as string)
      }
    }

    window.addEventListener('message', handler)
    iframe.contentWindow?.postMessage({ type: 'mesh2motion:capture' }, '*')
  })
}

async function uploadMesh2MotionTempImage(dataUrl: string): Promise<{ name: string }> {
  const blob = await fetch(dataUrl).then((r) => r.blob())
  const name = `mesh2motion_${Date.now()}.png`
  const file = new File([blob], name, { type: 'image/png' })

  const body = new FormData()
  body.append('image', file)
  body.append('subfolder', 'mesh2motion')
  body.append('type', 'temp')

  const resp = await api.fetchApi('/upload/image', {
    method: 'POST',
    body,
  })

  if (resp.status !== 200) {
    throw new Error(`Upload failed: ${resp.status}`)
  }

  return await resp.json()
}

function createMesh2MotionExploreWidget(node: any) {
  const container = document.createElement('div')
  container.style.cssText = 'width:100%;height:100%;position:relative;overflow:hidden;'

  const iframe = document.createElement('iframe')
  iframe.src = '/mesh2motion/index-comfyui.html?comfyui=true&theme=dark'
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;'
  iframe.allow = 'cross-origin-isolated'
  container.appendChild(iframe)

  node._mesh2motionIframe = iframe
  node._mesh2motionReady = false
  node._mesh2motionPendingSkeleton = null as string | null

  // Listen for iframe ready
  const readyHandler = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow) return
    if (event.data?.type === 'mesh2motion:ready') {
      node._mesh2motionReady = true
      // Apply pending skeleton change
      if (node._mesh2motionPendingSkeleton) {
        iframe.contentWindow?.postMessage(
          { type: 'mesh2motion:setSkeletonType', data: { skeleton_type: node._mesh2motionPendingSkeleton } },
          '*'
        )
        node._mesh2motionPendingSkeleton = null
      }
      // Apply initial panel state from the show_animations widget
      const showWidget = node.widgets?.find((w: any) => w.name === 'show_animations')
      if (showWidget) {
        iframe.contentWindow?.postMessage(
          { type: 'mesh2motion:setPanelVisible', data: { visible: !!showWidget.value } },
          '*'
        )
      }
    }
  }
  window.addEventListener('message', readyHandler)

  // Wire skeleton_type widget → iframe
  const hookSkeletonWidget = () => {
    const skeletonWidget = node.widgets?.find((w: any) => w.name === 'skeleton_type')
    if (skeletonWidget) {
      const origCallback = skeletonWidget.callback
      skeletonWidget.callback = (value: string) => {
        origCallback?.(value)
        if (node._mesh2motionReady) {
          iframe.contentWindow?.postMessage(
            { type: 'mesh2motion:setSkeletonType', data: { skeleton_type: value } },
            '*'
          )
        } else {
          node._mesh2motionPendingSkeleton = value
        }
      }
    }
  }

  // Wire show_animations widget → iframe panel toggle
  const hookShowAnimationsWidget = () => {
    const showWidget = node.widgets?.find((w: any) => w.name === 'show_animations')
    if (showWidget) {
      const origCallback = showWidget.callback
      showWidget.callback = (value: boolean) => {
        origCallback?.(value)
        if (node._mesh2motionReady) {
          iframe.contentWindow?.postMessage(
            { type: 'mesh2motion:setPanelVisible', data: { visible: value } },
            '*'
          )
        }
      }
    }
  }

  // Wire show_skeleton widget → iframe checkbox
  const hookBooleanWidget = (widgetName: string, messageType: string) => {
    const widget = node.widgets?.find((w: any) => w.name === widgetName)
    if (widget) {
      const origCallback = widget.callback
      widget.callback = (value: boolean) => {
        origCallback?.(value)
        if (node._mesh2motionReady) {
          iframe.contentWindow?.postMessage(
            { type: messageType, data: { value } },
            '*'
          )
        }
      }
    }
  }

  setTimeout(() => {
    hookSkeletonWidget()
    hookShowAnimationsWidget()
    hookBooleanWidget('show_skeleton', 'mesh2motion:setShowSkeleton')
    hookBooleanWidget('mirror_animations', 'mesh2motion:setMirrorAnimations')
  }, 100)

  node.addDOMWidget('mesh2motion_view', 'mesh2motion-explore', container, {
    getMinHeight: () => 450,
    hideOnZoom: false,
    serialize: false,
  })

  // Hidden image widget — serializeValue captures screenshot on execution
  const imageWidget = node.addWidget('text', 'image', '', () => {})
  imageWidget.type = 'hidden'
  imageWidget.serialize = true
  imageWidget.serializeValue = async () => {
    try {
      const dataUrl = await captureFromMesh2MotionIframe(node._mesh2motionIframe)
      const result = await uploadMesh2MotionTempImage(dataUrl)
      return `mesh2motion/${result.name} [temp]`
    } catch (err) {
      console.error('[Mesh2Motion] Capture failed:', err)
      return ''
    }
  }

  node.addWidget('button', 'Fullscreen', 'fullscreen', () => {
    openMesh2MotionExplore()
  })

  const [w, h] = node.size
  node.setSize([Math.max(w, 500), Math.max(h, 700)])
}

function createMesh2MotionCreateWidget(node: any) {
  const container = document.createElement('div')
  container.style.cssText = 'width:100%;height:100%;position:relative;overflow:hidden;'

  const iframe = document.createElement('iframe')
  iframe.src = '/mesh2motion/create-comfyui.html?comfyui=true&theme=dark'
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;'
  iframe.allow = 'cross-origin-isolated'
  container.appendChild(iframe)

  node._mesh2motionIframe = iframe

  // Track iframe readiness
  let iframeReady = false
  let pendingModelUrl: string | null = null

  const messageHandler = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow) return
    if (event.data?.type === 'mesh2motion:ready') {
      iframeReady = true
      if (pendingModelUrl) {
        iframe.contentWindow?.postMessage(
          { type: 'comfyui:loadModel', data: { url: pendingModelUrl } },
          '*'
        )
        pendingModelUrl = null
      }
    }
  }
  window.addEventListener('message', messageHandler)

  // Load model into iframe when model_file widget changes
  function loadModelIntoIframe(filename: string) {
    if (!filename || filename === 'none') return
    const params = new URLSearchParams({
      filename,
      type: 'input',
      subfolder: '',
    })
    const modelUrl = api.apiURL(`/view?${params.toString()}`)

    if (iframeReady) {
      iframe.contentWindow?.postMessage(
        { type: 'comfyui:loadModel', data: { url: modelUrl } },
        '*'
      )
    } else {
      pendingModelUrl = modelUrl
    }
  }

  // Watch model_file widget for changes
  const checkModelWidget = () => {
    const modelWidget = node.widgets?.find((w: any) => w.name === 'model_file')
    if (modelWidget) {
      const origCallback = modelWidget.callback
      modelWidget.callback = (value: string) => {
        origCallback?.(value)
        loadModelIntoIframe(value)
      }
      // Load initial value if any
      if (modelWidget.value && modelWidget.value !== 'none') {
        loadModelIntoIframe(modelWidget.value)
      }
    }
  }
  // Defer to ensure ComfyUI has created the model_file widget
  setTimeout(checkModelWidget, 100)

  node.addDOMWidget('mesh2motion_view', 'mesh2motion-create', container, {
    getMinHeight: () => 450,
    hideOnZoom: false,
    serialize: false,
  })

  // Hidden image widget — serializeValue captures screenshot on execution
  const imageWidget = node.addWidget('text', 'image', '', () => {})
  imageWidget.type = 'hidden'
  imageWidget.serialize = true
  imageWidget.serializeValue = async () => {
    try {
      const dataUrl = await captureFromMesh2MotionIframe(node._mesh2motionIframe)
      const result = await uploadMesh2MotionTempImage(dataUrl)
      return `mesh2motion/${result.name} [temp]`
    } catch (err) {
      console.error('[Mesh2Motion] Create capture failed:', err)
      return ''
    }
  }

  node.addWidget('button', 'Fullscreen', 'fullscreen', () => {
    openMesh2MotionEditor()
  })

  const [w, h] = node.size
  node.setSize([Math.max(w, 500), Math.max(h, 700)])
}

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

  nodeCreated(node: any) {
    if (node.constructor?.comfyClass === 'Mesh2MotionExplore') {
      createMesh2MotionExploreWidget(node)
    } else if (node.constructor?.comfyClass === 'Mesh2MotionCreate') {
      createMesh2MotionCreateWidget(node)
    }
  },

  getNodeMenuItems(node: unknown) {
    const typedNode = node as { constructor?: { comfyClass?: string } }
    const nodeClass = typedNode?.constructor?.comfyClass

    if (nodeClass && IMAGE_NODES.includes(nodeClass)) {
      return [
        null, // Separator
        {
          content: 'Open in Mesh2Motion',
          callback: () => {
            openMesh2MotionExplore(node as ImageNode)
          }
        }
      ]
    }

    // Check if it's a 3D model node
    if (nodeClass && MODEL_3D_NODES.includes(nodeClass)) {
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

    // Check if node has 3D model data
    if (isModel3DNode(node)) {
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

    return []
  }
})

export { openMesh2MotionEditor, openMesh2MotionExplore }
