import { POST_MESSAGE_ORIGIN } from './utils'
import { captureFromMesh2MotionIframe, captureVideoFromMesh2MotionIframe, uploadMesh2MotionTempImage } from './capture'

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

      // Restore skeleton selection from saved workflow (if any).
      // mesh2motion owns the skeleton picker UI; we just hand back what we
      // stored last time via mesh2motion:skeletonChanged.
      const savedSkeleton = node.properties?.['mesh2motion_skeleton']
      if (savedSkeleton) {
        iframe.contentWindow?.postMessage(
          { type: 'mesh2motion:restoreSkeleton', data: { value: savedSkeleton } },
          POST_MESSAGE_ORIGIN,
        )
      }

      // Restore camera preset selection from saved workflow (if any).
      // Value is either a manifest file path (e.g. "Locomotion/walking.json")
      // or null for free mode. Only send if the key exists — absence means
      // "no choice persisted yet", leave whatever default the panel has.
      if (node.properties && 'mesh2motion_camera_preset' in node.properties) {
        iframe.contentWindow?.postMessage(
          { type: 'mesh2motion:restoreCameraPreset', data: { value: node.properties['mesh2motion_camera_preset'] } },
          POST_MESSAGE_ORIGIN,
        )
      }

      // Restore timeline zoom (UI preference persisted per workflow). Value
      // is the raw zoom number as understood by the timeline library.
      if (node.properties && 'mesh2motion_timeline_zoom' in node.properties) {
        iframe.contentWindow?.postMessage(
          { type: 'mesh2motion:restoreTimelineZoom', data: { value: node.properties['mesh2motion_timeline_zoom'] } },
          POST_MESSAGE_ORIGIN,
        )
      }

      // Restore per-preset tuning map (fovScale / reverse per preset file).
      if (node.properties && 'mesh2motion_preset_tuning' in node.properties) {
        iframe.contentWindow?.postMessage(
          { type: 'mesh2motion:restorePresetTuning', data: { map: node.properties['mesh2motion_preset_tuning'] } },
          POST_MESSAGE_ORIGIN,
        )
      }

      // Restore activity-bar panel open/closed state (both sides).
      if (node.properties && 'mesh2motion_panel_state' in node.properties) {
        iframe.contentWindow?.postMessage(
          { type: 'mesh2motion:restorePanelState', data: { state: node.properties['mesh2motion_panel_state'] } },
          POST_MESSAGE_ORIGIN,
        )
      }

      // Push current boolean widget values — callbacks don't fire when ComfyUI
      // restores them from a saved workflow, so without this the iframe would
      // be out of sync with widget state (e.g. checker_room=true not taking effect).
      sendInitialBooleanStates()
      sendPreviewState()

      // Queue timeline restore — will apply once animations finish loading
      const saved = node.properties?.['mesh2motion_timeline']
      if (saved) {
        node._mesh2motionPendingTimeline = saved
      }
    }

    // Restore timeline when iframe signals animations are ready (replaces hardcoded 2s delay)
    if (event.data?.type === 'mesh2motion:animationsReady') {
      const pending = node._mesh2motionPendingTimeline
      if (pending) {
        iframe.contentWindow?.postMessage(
          { type: 'mesh2motion:restoreTimeline', data: pending }, POST_MESSAGE_ORIGIN
        )
        node._mesh2motionPendingTimeline = null
      }
    }

    // Persist timeline state from iframe
    if (event.data?.type === 'mesh2motion:timelineState' && event.data?.data) {
      if (!node.properties) node.properties = {}
      node.properties['mesh2motion_timeline'] = event.data.data
    }

    // Persist skeleton selection from iframe
    if (event.data?.type === 'mesh2motion:skeletonChanged' && event.data?.data?.value) {
      if (!node.properties) node.properties = {}
      node.properties['mesh2motion_skeleton'] = event.data.data.value
    }

    // Persist camera preset selection from iframe.
    // Value is the manifest `file` string, or null for free mode.
    if (event.data?.type === 'mesh2motion:cameraPresetChanged' && 'value' in (event.data?.data ?? {})) {
      if (!node.properties) node.properties = {}
      node.properties['mesh2motion_camera_preset'] = event.data.data.value
    }

    // Persist timeline zoom (UI preference).
    if (event.data?.type === 'mesh2motion:timelineZoomChanged' && typeof event.data?.data?.value === 'number') {
      if (!node.properties) node.properties = {}
      node.properties['mesh2motion_timeline_zoom'] = event.data.data.value
    }

    // Persist per-preset tuning map. Iframe sends the full map on every change.
    if (event.data?.type === 'mesh2motion:presetTuningChanged' && event.data?.data?.map) {
      if (!node.properties) node.properties = {}
      node.properties['mesh2motion_preset_tuning'] = event.data.data.map
    }

    // Persist activity-bar panel state. Iframe sends the full {right, left} blob on toggle.
    if (event.data?.type === 'mesh2motion:panelStateChanged' && event.data?.data?.state) {
      if (!node.properties) node.properties = {}
      node.properties['mesh2motion_panel_state'] = event.data.data.state
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
  // those choices to node.properties and replay them on iframe ready — see
  // readyHandler above.

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
    // node widgets + iframe-persisted properties. serializeValue fires on
    // every Queue, so without this cache we'd retrigger the ~1s WebCodecs
    // render pass on clicks where nothing has actually changed. Returning
    // the previously uploaded videoPath makes ComfyUI's default input-hash
    // cache match the prior run, so execute() is skipped too.
    //
    // preview_output is deliberately absent — it only toggles the on-screen
    // crop overlay and has no effect on the captured frames.
    const computeVideoSignature = (): string | null => {
      const presetFile = node.properties?.['mesh2motion_camera_preset'] as string | null | undefined
      if (!presetFile) return null  // free mode: no video anyway

      // tune-panel controls that affect captured frames (fovScale, reverse,
      // pathScale, yaw, roll, offset) land in mesh2motion_preset_tuning[file].
      // Speed is excluded because it's timeline-level and already covered by
      // the timeline entry below.
      const tuningMap = node.properties?.['mesh2motion_preset_tuning'] as Record<string, unknown> | undefined
      const tuning = tuningMap?.[presetFile] ?? null

      const w = (name: string) => node.widgets?.find((x: any) => x.name === name)?.value
      return JSON.stringify({
        presetFile,
        skeleton: node.properties?.['mesh2motion_skeleton'] ?? null,
        timeline: node.properties?.['mesh2motion_timeline'] ?? null,
        tuning,
        width:    w('width'),
        height:   w('height'),
        fps:      w('fps'),
        showSkel: !!w('show_skeleton'),
        mirror:   !!w('mirror_animations'),
        checker:  !!w('checker_room'),
      })
    }

    hookHiddenWidget('video_frames', async () => {
      // Camera preset is persisted under node.properties by the iframe.
      // File format: "<category>/<presetId>.json" (or null for free mode).
      const presetFile = node.properties?.['mesh2motion_camera_preset'] as string | null | undefined
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
