// @ts-ignore - ComfyUI external module
import { api } from '../../../scripts/api.js'
import { POST_MESSAGE_ORIGIN } from './utils'

export function captureFromMesh2MotionIframe(iframe: HTMLIFrameElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler)
      reject(new Error('Mesh2Motion capture timeout'))
    }, 15000)

    const handler = (event: MessageEvent) => {
      if (event.origin !== POST_MESSAGE_ORIGIN || event.source !== iframe.contentWindow) return
      if (event.data?.type === 'mesh2motion:captureResult') {
        clearTimeout(timeout)
        window.removeEventListener('message', handler)
        resolve(event.data.data as string)
      }
    }

    window.addEventListener('message', handler)
    iframe.contentWindow?.postMessage({ type: 'mesh2motion:capture' }, POST_MESSAGE_ORIGIN)
  })
}

/**
 * Ask the iframe to capture the active camera preset as a single webm
 * blob (via WebCodecs VideoEncoder). Resolves with { videoPath, fps }.
 */
export interface CaptureVideoResult {
  videoPath: string
  fps: number
}

export function captureVideoFromMesh2MotionIframe(
  iframe: HTMLIFrameElement,
  presetName: string,
  width: number,
  height: number,
): Promise<CaptureVideoResult> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler)
      reject(new Error('Video capture timeout (120s)'))
    }, 120000)

    const handler = (event: MessageEvent) => {
      if (event.origin !== POST_MESSAGE_ORIGIN || event.source !== iframe.contentWindow) return
      if (event.data?.type === 'mesh2motion:captureVideoResult') {
        clearTimeout(timeout)
        window.removeEventListener('message', handler)
        const result = event.data.data
        if (result.error) {
          reject(new Error(result.error))
        } else {
          resolve({ videoPath: result.videoPath, fps: result.fps })
        }
      }
    }

    window.addEventListener('message', handler)
    iframe.contentWindow?.postMessage({
      type: 'mesh2motion:captureVideoFrames',
      data: { presetName, width, height }
    }, POST_MESSAGE_ORIGIN)
  })
}

export async function uploadMesh2MotionTempImage(dataUrl: string): Promise<{ name: string }> {
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
