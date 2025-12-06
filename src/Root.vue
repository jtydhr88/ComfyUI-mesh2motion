<template>
  <Dialog
    v-model:visible="visible"
    :header="$t('dialog.title')"
    :style="{ width: '95vw', height: '95vh' }"
    :maximizable="true"
    :modal="true"
    :closable="true"
    :draggable="false"
    content-class="h-full"
    @hide="handleClose"
  >
    <Mesh2MotionEditor
      v-if="visible"
      ref="mesh2motionEditorRef"
      :initial-model-url="currentModelUrl"
      :theme="theme"
      :page="currentPage"
      @ready="handleEditorReady"
      @save="handleSave"
      @image-export="handleImageExport"
    />
  </Dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Dialog from 'primevue/dialog'
import Mesh2MotionEditor from './components/Mesh2MotionEditor.vue'

// @ts-ignore - ComfyUI external module
import { app } from '../../../scripts/app.js'

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
}

const visible = ref(false)
const currentModelUrl = ref<string | null>(null)
const currentNode = ref<Model3DNode | null>(null)
const currentPage = ref<'create' | 'explore'>('create')
const editorReady = ref(false)
const mesh2motionEditorRef = ref<InstanceType<typeof Mesh2MotionEditor> | null>(null)

// Settings
const theme = ref<'light' | 'dark'>('dark')

// Image export callback
let imageExportCallback:
  | ((imageDataUrl: string, filename: string, width: number, height: number, node: Model3DNode | null) => Promise<void>)
  | null = null

// Save callback
let saveCallback:
  | ((modelData: ArrayBuffer, filename: string, node: Model3DNode | null) => Promise<void>)
  | null = null

onMounted(() => {
  const colorPalette = app.ui?.settings?.getSettingValue('Comfy.ColorPalette') || ''
  theme.value = colorPalette.includes('light') ? 'light' : 'dark'
})

function open(): void {
  visible.value = true
}

function close(): void {
  visible.value = false
}

function loadModel(modelUrl: string, node?: Model3DNode): void {
  currentModelUrl.value = modelUrl
  currentNode.value = node || null
  currentPage.value = 'create'
  visible.value = true
}

function openNew(node?: Model3DNode): void {
  currentModelUrl.value = null
  currentNode.value = node || null
  currentPage.value = 'create'
  visible.value = true
}

function openExplore(node?: Model3DNode): void {
  currentModelUrl.value = null
  currentNode.value = node || null
  currentPage.value = 'explore'
  visible.value = true
}

function setSaveCallback(
  callback: (modelData: ArrayBuffer, filename: string, node: Model3DNode | null) => Promise<void>
): void {
  saveCallback = callback
}

function setImageExportCallback(
  callback: (imageDataUrl: string, filename: string, width: number, height: number, node: Model3DNode | null) => Promise<void>
): void {
  imageExportCallback = callback
}

function handleEditorReady(): void {
  editorReady.value = true
}

function handleClose(): void {
  editorReady.value = false
  currentModelUrl.value = null
  currentNode.value = null
  currentPage.value = 'create'
}

async function handleSave(modelData: ArrayBuffer, filename: string): Promise<void> {
  if (!saveCallback) return

  try {
    await saveCallback(modelData, filename, currentNode.value)
    close()
  } catch (error) {
    console.error('[Mesh2Motion] Save failed:', error)
  }
}

async function handleImageExport(imageDataUrl: string, filename: string, width: number, height: number): Promise<void> {
  if (!imageExportCallback) return

  try {
    await imageExportCallback(imageDataUrl, filename, width, height, currentNode.value)
    // Don't close dialog after image export - user might want to export more images
  } catch (error) {
    console.error('[Mesh2Motion] Image export failed:', error)
  }
}

defineExpose({
  open,
  close,
  loadModel,
  openNew,
  openExplore,
  setSaveCallback,
  setImageExportCallback
})
</script>

<style>
/* Global style for PrimeVue Dialog - not scoped */
.p-dialog-content {
  flex: 1;
  overflow: hidden;
  padding: 0 !important;
}
</style>
