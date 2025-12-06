<template>
  <div class="mesh2motion-wrapper h-full w-full flex">
    <div class="flex-1 relative">
      <iframe
        ref="iframeRef"
        :src="iframeSrc"
        class="mesh2motion-iframe h-full w-full"
        allow="cross-origin-isolated"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  initialModelUrl?: string | null
  theme?: 'light' | 'dark'
  page?: 'create' | 'explore'
}>()

const emit = defineEmits<{
  ready: []
  save: [modelData: ArrayBuffer, filename: string]
  imageExport: [imageDataUrl: string, filename: string, width: number, height: number]
}>()

const iframeRef = ref<HTMLIFrameElement | null>(null)
const ready = ref(false)

let pendingModelUrl: string | null = null

const iframeSrc = computed(() => {
  const params = new URLSearchParams()
  params.set('theme', props.theme || 'dark')
  params.set('comfyui', 'true') // Flag to indicate we're running inside ComfyUI

  const pageName = props.page === 'explore' ? 'index-comfyui.html' : 'create-comfyui.html'
  return `/mesh2motion/${pageName}?${params.toString()}`
})

function handleMessage(event: MessageEvent) {
  // Only handle messages from our iframe
  if (event.source !== iframeRef.value?.contentWindow) {
    return
  }

  const { type, data } = event.data || {}
  console.log('[Mesh2MotionEditor] Received message from iframe:', type, data)

  switch (type) {
    case 'mesh2motion:ready':
      console.log('[Mesh2MotionEditor] iframe is ready, pendingModelUrl:', pendingModelUrl)
      ready.value = true
      emit('ready')
      // Load pending model if any
      if (pendingModelUrl) {
        console.log('[Mesh2MotionEditor] Loading pending model:', pendingModelUrl)
        loadModelToEditor(pendingModelUrl)
        pendingModelUrl = null
      }
      break

    case 'mesh2motion:imageExport':
      if (data?.imageDataUrl && data?.filename) {
        emit('imageExport', data.imageDataUrl, data.filename, data.width || 512, data.height || 512)
      }
      break

    case 'mesh2motion:export':
      // Handle export from Mesh2Motion
      if (data?.modelData && data?.filename) {
        emit('save', data.modelData, data.filename)
      }
      break

    case 'mesh2motion:modelLoaded':
      console.log('[Mesh2Motion] Model loaded successfully')
      break

    case 'mesh2motion:error':
      console.error('[Mesh2Motion] Error:', data?.message)
      break
  }
}

function postMessage(message: object) {
  if (iframeRef.value?.contentWindow) {
    iframeRef.value.contentWindow.postMessage(message, '*')
  }
}

function loadModelToEditor(modelUrl: string) {
  console.log('[Mesh2MotionEditor] loadModelToEditor called, ready:', ready.value, 'url:', modelUrl)
  if (!ready.value) {
    console.log('[Mesh2MotionEditor] Not ready yet, queuing model URL')
    pendingModelUrl = modelUrl
    return
  }
  console.log('[Mesh2MotionEditor] Sending loadModel message to iframe')
  postMessage({ type: 'comfyui:loadModel', data: { url: modelUrl } })
}

function requestExport(): void {
  if (!ready.value) {
    return
  }
  postMessage({ type: 'comfyui:requestExport' })
}

function setTheme(theme: 'light' | 'dark') {
  postMessage({ type: 'comfyui:setTheme', data: { theme } })
}

onMounted(() => {
  window.addEventListener('message', handleMessage)

  if (props.initialModelUrl) {
    pendingModelUrl = props.initialModelUrl
  }
})

onUnmounted(() => {
  window.removeEventListener('message', handleMessage)
})

defineExpose({
  loadModelToEditor,
  requestExport,
  setTheme
})
</script>

<style scoped>
.mesh2motion-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}
</style>
