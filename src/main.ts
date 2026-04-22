// @ts-ignore - ComfyUI external module
import { app } from '../../../scripts/app.js'

import { createMesh2MotionExploreWidget } from './explore-widget'
import { openMesh2MotionCreate, openMesh2MotionExplore } from './dialog'
import { IMAGE_NODES, MODEL_3D_NODES, isModel3DNode, type ImageNode, type Model3DNode } from './utils'

const { ComfyButton } = (window as any).comfyAPI.button

app.registerExtension({
  name: 'ComfyUI.Mesh2Motion',

  setup () {
    // Top-menu button. Matches the AudioMass / PascalEditor pattern — one
    // ComfyButton appended to the settings group. Opens the Explore window;
    // the Create flow is reachable via right-click on 3D-model nodes or via
    // the Create nav link inside the dialog.
    app.menu?.settingsGroup.append(
      new ComfyButton({
        icon: 'human-male',
        tooltip: 'Mesh2Motion — rig, pose, and render characters',
        content: 'Mesh2Motion',
        action: () => openMesh2MotionExplore(null),
      }),
    )
  },

  nodeCreated (node: any) {
    if (node.constructor?.comfyClass === 'Mesh2MotionExplore') {
      createMesh2MotionExploreWidget(node)
    }
  },

  // Right-click menu entries on compatible nodes:
  //   Image nodes (LoadImage)                    → Explore window
  //   3D model nodes (Load3D / Preview3D / ...)  → Create window, pre-loading
  //                                                the node's current model
  getNodeMenuItems (node: unknown) {
    const typedNode = node as { constructor?: { comfyClass?: string } }
    const nodeClass = typedNode?.constructor?.comfyClass

    if (nodeClass && IMAGE_NODES.includes(nodeClass)) {
      return [
        null,
        {
          content: 'Open in Mesh2Motion',
          callback: () => { openMesh2MotionExplore(node as ImageNode) },
        },
      ]
    }

    if (nodeClass && MODEL_3D_NODES.includes(nodeClass)) {
      return [
        null,
        {
          content: 'Open in Mesh2Motion',
          callback: () => { openMesh2MotionCreate(node as Model3DNode) },
        },
      ]
    }

    // Fallback for 3D nodes from other extensions whose comfyClass we don't
    // know — detect them structurally via widget names / value extensions.
    if (isModel3DNode(node)) {
      return [
        null,
        {
          content: 'Open in Mesh2Motion',
          callback: () => { openMesh2MotionCreate(node as Model3DNode) },
        },
      ]
    }

    return []
  },
})

export { openMesh2MotionCreate, openMesh2MotionExplore }
