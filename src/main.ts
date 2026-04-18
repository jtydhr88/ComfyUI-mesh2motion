// @ts-ignore - ComfyUI external module
import { app } from '../../../scripts/app.js'

import { createMesh2MotionExploreWidget } from './explore-widget'

app.registerExtension({
  name: 'ComfyUI.Mesh2Motion',

  nodeCreated(node: any) {
    if (node.constructor?.comfyClass === 'Mesh2MotionExplore') {
      createMesh2MotionExploreWidget(node)
    }
  }
})
