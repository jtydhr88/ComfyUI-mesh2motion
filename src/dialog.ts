// @ts-ignore - ComfyUI external module
import { app } from '../../../scripts/app.js'
// @ts-ignore - ComfyUI external module
import { api } from '../../../scripts/api.js'

import {
  IMAGE_NODES,
  POST_MESSAGE_ORIGIN,
  getModelUrlFromNode,
  type ImageNode,
  type Model3DNode,
} from './utils'

/**
 * Lightweight window-mode Dialog. Vanilla DOM (no Vue / PrimeVue) singleton
 * that wraps a full-bleed iframe pointed at the window-mode pages on the
 * mesh2motion app:
 *
 *   /mesh2motion/index-comfyui-window.html?window=true  (Explore)
 *   /mesh2motion/create-comfyui-window.html?window=true (Create)
 *
 * The iframe talks to us via the same `comfyui:*` / `mesh2motion:*` postMessage
 * protocol the Vue dialog used. Save / Save Image buttons push requests into
 * the iframe; results come back and get injected into the originating
 * ComfyUI node (upload to /upload/image, set widget value, refresh canvas).
 */

type DialogPage = 'explore' | 'create'

const CSS = `
.mesh2motion-dialog-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 10000;
  display: flex; align-items: center; justify-content: center;
}
.mesh2motion-dialog {
  width: 95vw; height: 95vh;
  background: #1e1e1e; color: #e0e0e0;
  border: 1px solid #444; border-radius: 6px;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
.mesh2motion-dialog-header {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; background: #2a2a2a;
  border-bottom: 1px solid #444; flex: 0 0 auto;
}
.mesh2motion-dialog-title { font-weight: 600; font-size: 14px; flex: 1 1 auto; }
.mesh2motion-dialog-btn {
  background: #3a3a3a; color: #eee; border: 1px solid #555;
  border-radius: 4px; padding: 6px 12px; cursor: pointer;
  font-size: 13px;
}
.mesh2motion-dialog-btn:hover:not(:disabled) { background: #4a4a4a; }
.mesh2motion-dialog-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mesh2motion-dialog-btn-primary { background: #2563eb; border-color: #3b82f6; }
.mesh2motion-dialog-btn-primary:hover:not(:disabled) { background: #1d4ed8; }
.mesh2motion-dialog-close {
  background: transparent; border: none; color: #bbb;
  cursor: pointer; font-size: 20px; line-height: 1; padding: 0 6px;
}
.mesh2motion-dialog-close:hover { color: #fff; }
.mesh2motion-dialog-body { flex: 1 1 auto; position: relative; }
.mesh2motion-dialog-iframe { width: 100%; height: 100%; border: 0; display: block; }
.mesh2motion-dialog-status {
  font-size: 12px; color: #8bc; margin-right: 8px; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
`

class Mesh2MotionDialog {
  private overlay: HTMLDivElement | null = null
  private dialog: HTMLDivElement | null = null
  private iframe: HTMLIFrameElement | null = null
  private titleEl: HTMLSpanElement | null = null
  private statusEl: HTMLSpanElement | null = null
  private saveBtn: HTMLButtonElement | null = null
  private saveImageBtn: HTMLButtonElement | null = null
  private styleInjected = false

  private currentPage: DialogPage = 'explore'
  private currentNode: ImageNode | Model3DNode | null = null
  private editorReady = false
  private pendingModelUrl: string | null = null
  private saveInFlight = false
  private saveImageInFlight = false

  openExplore (node: ImageNode | null): void {
    this.currentPage = 'explore'
    this.currentNode = node
    this.show()
  }

  openCreate (node: Model3DNode | null): void {
    this.currentPage = 'create'
    this.currentNode = node
    this.pendingModelUrl = node ? getModelUrlFromNode(node) : null
    this.show()
  }

  close (): void {
    this.editorReady = false
    this.pendingModelUrl = null
    this.currentNode = null
    this.saveInFlight = false
    this.saveImageInFlight = false
    if (this.overlay) {
      this.overlay.remove()
      this.overlay = null
      this.dialog = null
      this.iframe = null
      this.titleEl = null
      this.statusEl = null
      this.saveBtn = null
      this.saveImageBtn = null
    }
  }

  // ── Build & show ────────────────────────────────────────────────────

  private show (): void {
    this.injectStyles()
    this.buildUI()
    this.updateSaveButtonsEnabled(false)
    // Editor comes up disabled until `mesh2motion:ready` arrives from the iframe.
    if (this.statusEl) this.statusEl.textContent = 'Loading editor…'

    const pageFile = this.currentPage === 'explore'
      ? 'index-comfyui-window.html'
      : 'create-comfyui-window.html'
    const params = new URLSearchParams({ window: 'true', theme: 'dark' })
    if (this.iframe) this.iframe.src = `/mesh2motion/${pageFile}?${params.toString()}`

    if (this.titleEl) {
      const hint = this.currentPage === 'explore' ? 'Explore' : 'Create'
      this.titleEl.textContent = `Mesh2Motion — ${hint}`
    }
  }

  private injectStyles (): void {
    if (this.styleInjected) return
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)
    this.styleInjected = true
  }

  private buildUI (): void {
    if (this.overlay) return

    this.overlay = document.createElement('div')
    this.overlay.className = 'mesh2motion-dialog-overlay'
    // Click on overlay (outside the dialog) closes.
    this.overlay.addEventListener('click', (ev) => {
      if (ev.target === this.overlay) this.close()
    })

    this.dialog = document.createElement('div')
    this.dialog.className = 'mesh2motion-dialog'

    // Header
    const header = document.createElement('div')
    header.className = 'mesh2motion-dialog-header'

    this.titleEl = document.createElement('span')
    this.titleEl.className = 'mesh2motion-dialog-title'
    header.appendChild(this.titleEl)

    this.statusEl = document.createElement('span')
    this.statusEl.className = 'mesh2motion-dialog-status'
    header.appendChild(this.statusEl)

    this.saveImageBtn = document.createElement('button')
    this.saveImageBtn.className = 'mesh2motion-dialog-btn'
    this.saveImageBtn.textContent = 'Save Image'
    this.saveImageBtn.addEventListener('click', () => this.requestImageExport())
    header.appendChild(this.saveImageBtn)

    this.saveBtn = document.createElement('button')
    this.saveBtn.className = 'mesh2motion-dialog-btn mesh2motion-dialog-btn-primary'
    this.saveBtn.textContent = 'Save Model'
    this.saveBtn.addEventListener('click', () => this.requestExport())
    header.appendChild(this.saveBtn)

    const closeBtn = document.createElement('button')
    closeBtn.className = 'mesh2motion-dialog-close'
    closeBtn.setAttribute('aria-label', 'Close')
    closeBtn.textContent = '✕'
    closeBtn.addEventListener('click', () => this.close())
    header.appendChild(closeBtn)

    this.dialog.appendChild(header)

    // Body
    const body = document.createElement('div')
    body.className = 'mesh2motion-dialog-body'
    this.iframe = document.createElement('iframe')
    this.iframe.className = 'mesh2motion-dialog-iframe'
    this.iframe.allow = 'cross-origin-isolated'
    body.appendChild(this.iframe)
    this.dialog.appendChild(body)

    this.overlay.appendChild(this.dialog)
    document.body.appendChild(this.overlay)

    // One listener per dialog instance; removed on close via overlay teardown.
    // We still need to addEventListener on window — filter by iframe source so
    // other iframes don't leak messages into here.
    window.addEventListener('message', this.onMessage)
  }

  private onMessage = (event: MessageEvent): void => {
    if (event.origin !== POST_MESSAGE_ORIGIN) return
    if (!this.iframe || event.source !== this.iframe.contentWindow) return

    const { type, data } = (event.data || {}) as { type?: string; data?: any }

    switch (type) {
      case 'mesh2motion:ready':
        this.editorReady = true
        this.updateSaveButtonsEnabled(true)
        if (this.statusEl) this.statusEl.textContent = ''
        if (this.pendingModelUrl) {
          this.post('comfyui:loadModel', { url: this.pendingModelUrl })
          this.pendingModelUrl = null
        }
        break

      case 'mesh2motion:modelLoaded':
        break

      case 'mesh2motion:export':
        if (data?.modelData && data?.filename) {
          void this.handleModelExport(data.modelData, data.filename)
        }
        break

      case 'mesh2motion:imageExport':
        if (data?.imageDataUrl && data?.filename) {
          void this.handleImageExport(
            data.imageDataUrl, data.filename,
            Number(data.width) || 512, Number(data.height) || 512,
          )
        }
        break

      case 'mesh2motion:error':
        console.error('[Mesh2Motion] iframe error:', data?.message)
        if (this.statusEl) this.statusEl.textContent = String(data?.message ?? 'Error')
        this.saveInFlight = false
        this.saveImageInFlight = false
        this.updateSaveButtonsEnabled(this.editorReady)
        break
    }
  }

  private post (type: string, data?: unknown): void {
    this.iframe?.contentWindow?.postMessage({ type, data }, POST_MESSAGE_ORIGIN)
  }

  private updateSaveButtonsEnabled (enabled: boolean): void {
    if (this.saveBtn) this.saveBtn.disabled = !enabled || this.saveInFlight
    if (this.saveImageBtn) this.saveImageBtn.disabled = !enabled || this.saveImageInFlight
  }

  private requestExport (): void {
    if (!this.editorReady || this.saveInFlight) return
    this.saveInFlight = true
    this.updateSaveButtonsEnabled(true)
    if (this.statusEl) this.statusEl.textContent = 'Exporting model…'
    this.post('comfyui:requestExport')
  }

  private requestImageExport (): void {
    if (!this.editorReady || this.saveImageInFlight) return
    this.saveImageInFlight = true
    this.updateSaveButtonsEnabled(true)
    if (this.statusEl) this.statusEl.textContent = 'Open the export overlay in the editor, then confirm…'
    this.post('comfyui:requestImageExport')
  }

  // ── Back-to-ComfyUI upload + node injection ─────────────────────────

  private async handleModelExport (modelData: ArrayBuffer, filename: string): Promise<void> {
    try {
      const blob = new Blob([modelData], { type: 'model/gltf-binary' })
      const finalFilename = filename || `mesh2motion-${Date.now()}.glb`

      const formData = new FormData()
      formData.append('image', blob, finalFilename)
      formData.append('type', 'input')
      formData.append('subfolder', 'mesh2motion')
      formData.append('overwrite', 'true')

      const resp = await api.fetchApi('/upload/image', { method: 'POST', body: formData })
      if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`)
      const result = await resp.json()

      const node = this.currentNode as Model3DNode | null
      if (node && 'constructor' in node) this.injectModelIntoNode(node, result)

      if (this.statusEl) this.statusEl.textContent = 'Model saved ✓'
      this.close()
    } catch (err) {
      console.error('[Mesh2Motion] Failed to save model:', err)
      if (this.statusEl) this.statusEl.textContent = 'Save failed — see console'
    } finally {
      this.saveInFlight = false
      this.updateSaveButtonsEnabled(this.editorReady)
    }
  }

  private injectModelIntoNode (
    node: Model3DNode,
    result: { name: string; subfolder?: string },
  ): void {
    const widgetValue = result.subfolder
      ? `${result.subfolder}/${result.name} [input]`
      : `${result.name} [input]`

    node.images = [{
      filename: result.name,
      subfolder: result.subfolder || '',
      type: 'input',
    }]

    const modelWidget = node.widgets?.find(
      (w) => w.name === 'model_file' || w.name === 'mesh' ||
             w.name === '3d_model' || w.name === 'model',
    )
    if (modelWidget) {
      if (modelWidget.options?.values && !modelWidget.options.values.includes(widgetValue)) {
        modelWidget.options.values.push(widgetValue)
      }
      modelWidget.value = widgetValue
      modelWidget.callback?.(widgetValue)
    }

    app.graph.setDirtyCanvas(true, true)
  }

  private async handleImageExport (
    imageDataUrl: string, filename: string, width: number, height: number,
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

      const resp = await api.fetchApi('/upload/image', { method: 'POST', body: formData })
      if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`)
      const result = await resp.json()

      const imageNode = this.resolveImageNode()
      if (imageNode) {
        await this.injectImageIntoNode(imageNode, result, imageDataUrl)
        if (this.statusEl) this.statusEl.textContent = `Image saved → LoadImage (${width}×${height})`
      } else {
        if (this.statusEl) this.statusEl.textContent = `Image saved (no LoadImage node) — ${result.name}`
      }
    } catch (err) {
      console.error('[Mesh2Motion] Failed to export image:', err)
      if (this.statusEl) this.statusEl.textContent = 'Image export failed — see console'
    } finally {
      this.saveImageInFlight = false
      this.updateSaveButtonsEnabled(this.editorReady)
    }
  }

  private resolveImageNode (): ImageNode | null {
    // Prefer the originating node if it's already an image node.
    if (this.currentNode) {
      const n = this.currentNode as { constructor?: { comfyClass?: string } }
      if (n.constructor?.comfyClass && IMAGE_NODES.includes(n.constructor.comfyClass)) {
        return this.currentNode as ImageNode
      }
    }
    // Otherwise fall back to the first LoadImage on the graph — matches the
    // old Vue-dialog behavior for model-3D originated exports.
    const graph = app.graph
    if (!graph) return null

    const canvas = graph.list_of_graphcanvas?.[0]
    const selected = canvas?.selected_nodes
    if (selected) {
      for (const id of Object.keys(selected)) {
        const node = graph.getNodeById(Number(id))
        const cls = node?.constructor?.comfyClass
        if (cls && IMAGE_NODES.includes(cls)) return node as ImageNode
      }
    }

    for (const node of (graph._nodes || [])) {
      const cls = node?.constructor?.comfyClass
      if (cls && IMAGE_NODES.includes(cls)) return node as ImageNode
    }
    return null
  }

  private async injectImageIntoNode (
    imageNode: ImageNode,
    result: { name: string; subfolder?: string },
    imageDataUrl: string,
  ): Promise<void> {
    const widgetValue = result.subfolder
      ? `${result.subfolder}/${result.name}`
      : result.name

    imageNode.images = [{
      filename: result.name,
      subfolder: result.subfolder || '',
      type: 'input',
    }]

    const imageWidget = imageNode.widgets?.find((w) => w.name === 'image')
    if (imageWidget) {
      if (imageWidget.options?.values && !imageWidget.options.values.includes(widgetValue)) {
        imageWidget.options.values.push(widgetValue)
      }
      imageWidget.value = widgetValue

      if (imageNode.widgets_values && imageNode.widgets) {
        const idx = imageNode.widgets.findIndex((w) => w.name === 'image')
        if (idx >= 0) imageNode.widgets_values[idx] = widgetValue
      }

      if (imageNode.properties) imageNode.properties['image'] = widgetValue

      imageWidget.callback?.(widgetValue)
    }

    // Refresh the node's preview thumbnail so the change is visible without
    // re-running the workflow.
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = imageDataUrl
    await new Promise((resolve, reject) => {
      img.onload = () => resolve(null)
      img.onerror = reject
    }).catch(() => { /* preview thumbnail is best-effort */ })
    imageNode.imgs = [img]

    app.graph.setDirtyCanvas(true, true)
  }
}

const dialog = new Mesh2MotionDialog()

export function openMesh2MotionExplore (node: ImageNode | null = null): void {
  dialog.openExplore(node)
}

export function openMesh2MotionCreate (node: Model3DNode | null = null): void {
  dialog.openCreate(node)
}
