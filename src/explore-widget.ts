import { POST_MESSAGE_ORIGIN } from './utils'
import { captureFromMesh2MotionIframe, captureVideoFromMesh2MotionIframe, uploadMesh2MotionTempImage } from './capture'

/**
 * Persisted-project schema v2. Mirrors mesh2motion-app's
 * src/lib/comfyui/ProjectState.ts — keep in sync. Bump PROJECT_STATE_VERSION
 * on both sides if you change the shape.
 */
const PROJECT_STATE_VERSION = 2
const PROJECT_KEY = 'mesh2motion_project'

interface PersistedTrack {
  id: string
  kind: 'camera' | 'animation'
  offset: number
  speed: number
  loop: boolean
}

interface ProjectStateV2 {
  version: typeof PROJECT_STATE_VERSION
  skeleton: string | null
  cameraPreset: string | null
  presetTuning: Record<string, unknown>
  timeline: {
    tracks: PersistedTrack[]
    zoom: number
    loopPlayback: boolean
    startFrame: number
    endFrame: number
  }
  panelState: { right: string | null; left: string | null }
  animationIndex: number
}

/** Read the v2 project blob from node.properties. Returns null on a fresh
 *  node (no saved project yet) or a version mismatch (treated as fresh). */
function loadProject (props: Record<string, unknown> | undefined): ProjectStateV2 | null {
  if (!props) return null
  const v2 = props[PROJECT_KEY] as ProjectStateV2 | undefined
  if (v2 && typeof v2 === 'object' && (v2 as { version?: number }).version === PROJECT_STATE_VERSION) {
    return v2
  }
  return null
}

function saveProject (node: any, state: ProjectStateV2): void {
  if (!node.properties) node.properties = {}
  node.properties[PROJECT_KEY] = state
}

export function createMesh2MotionExploreWidget(node: any) {
  const container = document.createElement('div')
  container.style.cssText = 'width:100%;height:100%;position:relative;overflow:hidden;'

  const iframe = document.createElement('iframe')
  iframe.src = '/mesh2motion/index-comfyui.html?comfyui=true&theme=dark'
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;'
  iframe.allow = 'cross-origin-isolated'
  container.appendChild(iframe)

  node._mesh2motionIframe = iframe
  node._mesh2motionReady = false

  // Listen for iframe ready + state persistence
  const readyHandler = (event: MessageEvent) => {
    if (event.origin !== POST_MESSAGE_ORIGIN || event.source !== iframe.contentWindow) return

    if (event.data?.type === 'mesh2motion:ready') {
      node._mesh2motionReady = true

      // Send saved project blob; mesh2motion side reapplies skeleton, camera
      // preset, timeline tracks, tuning, panel state, zoom, animation index
      // in the right order.
      const project = loadProject(node.properties)
      if (project) {
        iframe.contentWindow?.postMessage(
          { type: 'mesh2motion:restoreProject', data: project },
          POST_MESSAGE_ORIGIN,
        )
      }

      // Push current boolean widget values — callbacks don't fire when ComfyUI
      // restores them from a saved workflow, so without this the iframe would
      // be out of sync with widget state (e.g. checker_room=true not taking effect).
      sendInitialBooleanStates()
      sendPreviewState()
    }

    // Persist v2 project blob from iframe.
    if (event.data?.type === 'mesh2motion:projectStateChanged' && event.data?.data) {
      saveProject(node, event.data.data as ProjectStateV2)
    }
  }
  window.addEventListener('message', readyHandler)

  // Clean up event listener when node is removed
  const origOnRemovedExplore = node.onRemoved
  node.onRemoved = function () {
    window.removeEventListener('message', readyHandler)
    origOnRemovedExplore?.call(this)
  }

  // Skeleton selection, camera preset, and panel visibility are all owned
  // by mesh2motion's own UI inside the iframe. Plugin-side we only persist
  // those choices to node.properties (consolidated v2 blob) and replay them
  // on iframe ready — see readyHandler above.

  // (widget name, postMessage type) for boolean widgets hooked via hookBooleanWidget.
  // Used both to install callbacks and to re-push the initial value on iframe ready
  // (widget callbacks don't fire when ComfyUI restores values from a saved workflow).
  const BOOLEAN_WIDGETS: Array<{ widget: string; type: string }> = [
    { widget: 'show_skeleton',     type: 'mesh2motion:setShowSkeleton' },
    { widget: 'mirror_animations', type: 'mesh2motion:setMirrorAnimations' },
    { widget: 'checker_room',      type: 'mesh2motion:setCheckerRoom' },
  ]

  const hookBooleanWidget = (widgetName: string, messageType: string) => {
    const widget = node.widgets?.find((w: any) => w.name === widgetName)
    if (widget) {
      const origCallback = widget.callback
      widget.callback = (value: boolean) => {
        origCallback?.(value)
        if (node._mesh2motionReady) {
          iframe.contentWindow?.postMessage(
            { type: messageType, data: { value } },
            POST_MESSAGE_ORIGIN
          )
        }
      }
    }
  }

  const sendInitialBooleanStates = () => {
    for (const { widget: name, type } of BOOLEAN_WIDGETS) {
      const w = node.widgets?.find((x: any) => x.name === name)
      if (!w) continue
      iframe.contentWindow?.postMessage(
        { type, data: { value: !!w.value } },
        POST_MESSAGE_ORIGIN
      )
    }
  }

  // fps is a user-set int widget. It only affects the output VIDEO's
  // frame_rate metadata on the backend — timeline display and recording
  // stay at the preset's native cadence, so fps doesn't need to be
  // propagated into the iframe at all.

  const sendPreviewState = () => {
    if (!node._mesh2motionReady) return
    const previewWidget = node.widgets?.find((w: any) => w.name === 'preview_output')
    const widthWidget = node.widgets?.find((w: any) => w.name === 'width')
    const heightWidget = node.widgets?.find((w: any) => w.name === 'height')
    iframe.contentWindow?.postMessage({
      type: 'mesh2motion:setPreviewOverlay',
      data: {
        enabled: !!previewWidget?.value,
        width: widthWidget?.value ?? 1024,
        height: heightWidget?.value ?? 1024,
      }
    }, POST_MESSAGE_ORIGIN)
  }

  const hookPreviewWidgets = () => {
    const widthWidget = node.widgets?.find((w: any) => w.name === 'width')
    const heightWidget = node.widgets?.find((w: any) => w.name === 'height')
    const previewWidget = node.widgets?.find((w: any) => w.name === 'preview_output')

    if (widthWidget) {
      widthWidget.callback = () => { sendPreviewState() }
    }
    if (heightWidget) {
      heightWidget.callback = () => { sendPreviewState() }
    }
    if (previewWidget) {
      previewWidget.callback = () => { sendPreviewState() }
    }
  }

  node.addDOMWidget('mesh2motion_view', 'mesh2motion-explore', container, {
    getMinHeight: () => 450,
    hideOnZoom: false,
    serialize: false,
  })

  const hookHiddenWidget = (widgetName: string, serializeFn: () => Promise<string>) => {
    const widget = node.widgets?.find((w: any) => w.name === widgetName)
    if (widget) {
      widget.serializeValue = serializeFn
    }
  }

  setTimeout(() => {
    hookBooleanWidget('show_skeleton', 'mesh2motion:setShowSkeleton')
    hookBooleanWidget('mirror_animations', 'mesh2motion:setMirrorAnimations')
    hookBooleanWidget('checker_room', 'mesh2motion:setCheckerRoom')
    hookPreviewWidgets()

    hookHiddenWidget('image', async () => {
      try {
        const dataUrl = await captureFromMesh2MotionIframe(node._mesh2motionIframe)
        const result = await uploadMesh2MotionTempImage(dataUrl)
        return `mesh2motion/${result.name} [temp]`
      } catch (err) {
        console.error('[Mesh2Motion] Capture failed:', err)
        return ''
      }
    })

    // Signature of every piece of state that affects the rendered video:
    // node widgets + the project blob. serializeValue fires on every Queue,
    // so without this cache we'd retrigger the ~1s WebCodecs render pass on
    // clicks where nothing has actually changed. Returning the previously
    // uploaded videoPath makes ComfyUI's default input-hash cache match the
    // prior run, so execute() is skipped too.
    //
    // preview_output is deliberately absent — it only toggles the on-screen
    // crop overlay and has no effect on the captured frames.
    const computeVideoSignature = (): string | null => {
      const project = node.properties?.[PROJECT_KEY] as ProjectStateV2 | undefined
      const presetFile = project?.cameraPreset ?? null
      if (!presetFile) return null  // free mode: no video anyway

      const w = (name: string) => node.widgets?.find((x: any) => x.name === name)?.value
      return JSON.stringify({
        presetFile,
        skeleton: project?.skeleton ?? null,
        timeline: project?.timeline ?? null,
        tuning: project?.presetTuning?.[presetFile] ?? null,
        animationIndex: project?.animationIndex ?? 0,
        width:    w('width'),
        height:   w('height'),
        fps:      w('fps'),
        showSkel: !!w('show_skeleton'),
        mirror:   !!w('mirror_animations'),
        checker:  !!w('checker_room'),
      })
    }

    hookHiddenWidget('video_frames', async () => {
      const project = node.properties?.[PROJECT_KEY] as ProjectStateV2 | undefined
      const presetFile = project?.cameraPreset ?? null
      if (!presetFile) return ''

      // If nothing changed since last successful capture, skip the render
      // + upload and hand ComfyUI the prior payload. Cache lives on the
      // node instance (underscore prefix = not persisted to the workflow
      // JSON, so reloading the workflow on another machine / after a
      // ComfyUI restart correctly forces a fresh capture).
      const signature = computeVideoSignature()
      if (
        signature != null &&
        signature === node._mesh2motionVideoSig &&
        typeof node._mesh2motionVideoSerialized === 'string' &&
        node._mesh2motionVideoSerialized
      ) {
        return node._mesh2motionVideoSerialized
      }

      // VideoFrameRecorder keys presets by id (registered as item.id in
      // CameraPresetBridge.loadPresetPack). Derive it from the file name.
      const fileName = presetFile.split('/').pop() ?? ''
      const presetId = fileName.replace(/\.json$/, '')
      if (!presetId) return ''

      const widthWidget = node.widgets?.find((w: any) => w.name === 'width')
      const heightWidget = node.widgets?.find((w: any) => w.name === 'height')
      const w = widthWidget?.value ?? 1024
      const h = heightWidget?.value ?? 1024

      try {
        const result = await captureVideoFromMesh2MotionIframe(
          node._mesh2motionIframe, presetId, w, h
        )
        // VideoEncodedRecorder (WebCodecs) returns { videoPath, fps }.
        const serialized = JSON.stringify({ video: result.videoPath, fps: result.fps })

        if (signature != null) {
          node._mesh2motionVideoSig = signature
          node._mesh2motionVideoSerialized = serialized
        }
        return serialized
      } catch (err) {
        console.error('[Mesh2Motion] Video capture failed:', err)
        return ''
      }
    })
  }, 100)

  const [w, h] = node.size
  node.setSize([Math.max(w, 500), Math.max(h, 700)])
}
