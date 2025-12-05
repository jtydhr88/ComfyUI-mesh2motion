# ComfyUI-mesh2motion

A ComfyUI extension that integrates [Mesh2Motion](https://mesh2motion.org) for 3D character rigging and animation directly within ComfyUI.

## Features

- **Full Mesh2Motion Editor**: Access the complete Mesh2Motion rigging tool with all its features
- **3D Model Loading**: Load models from ComfyUI 3D nodes (Load3D, Preview3D, SaveGLB)
- **Character Rigging**: Automatic skeleton fitting and weight painting for humanoid, quadruped, bird, and dragon models
- **Animation Library**: Apply pre-built animations to your rigged characters
- **Export to GLB**: Save rigged and animated models back to ComfyUI workflow
- **Context Menu Integration**: Right-click on any 3D model node to open in Mesh2Motion
- **Top Menu Button**: Quick access via the Mesh2Motion button in the top menu

## Installation

### Manual Installation

1. Clone this repository with submodules into your `ComfyUI/custom_nodes` directory:
   ```bash
   cd ComfyUI/custom_nodes
   git clone this repo
   ```

2. Restart ComfyUI

## Usage

### Opening the Editor

**Method 1: Top Menu Button**
- Click the "Mesh2Motion" button in the top menu to open a new editor

**Method 2: Context Menu**
- Right-click on any 3D model node (Load3D, Preview3D, SaveGLB)
- Select "Open in Mesh2Motion"
- The model will be loaded into the editor

### Rigging Workflow

1. **Load Model**: Import your 3D model (GLB, GLTF, FBX)
2. **Select Skeleton**: Choose the appropriate skeleton type (Human, Quadruped, Bird, Dragon)
3. **Position Skeleton**: Adjust the skeleton to fit your model
4. **Edit Skeleton**: Fine-tune bone positions for accurate rigging
5. **Apply Animations**: Select and preview animations from the library
6. **Export**: Save the rigged model back to ComfyUI

### Supported Model Types

- **Human**: Bipedal characters with standard humanoid skeleton
- **Quadruped**: Four-legged animals (fox, dog, cat, etc.)
- **Bird**: Flying creatures with wing bones
- **Dragon**: Fantasy creatures with wings and tail

## Development

### Prerequisites

- Node.js 18+
- npm or pnpm

### Building

```bash
# Build the ComfyUI plugin
npm install
npm run build

# Build mesh2motion-app
cd mesh2motion-app
npm install
npm run build:comfyui
```

### Development Mode

```bash
# Watch mode for ComfyUI plugin
npm run dev

# In another terminal, for mesh2motion-app
cd mesh2motion-app
npm run dev:comfyui
```

## Repository Structure

This project uses git submodules to manage the mesh2motion-app dependency:

```
ComfyUI-mesh2motion/           # Main repository (https://github.com/jtydhr88/ComfyUI-mesh2motion)
├── src/                       # ComfyUI plugin source code
├── js/                        # Built JavaScript files
├── locales/                   # i18n translations
├── mesh2motion-app/           # Submodule (https://github.com/jtydhr88/mesh2motion-app)
│   └── (comfyui-support branch)
└── ...
```

### Submodule: mesh2motion-app

The `mesh2motion-app` directory is a git submodule pointing to a fork of the original [mesh2motion-app](https://github.com/scottpetrovic/mesh2motion-app).

- **Repository**: https://github.com/jtydhr88/mesh2motion-app
- **Branch**: `comfyui-support` (contains ComfyUI integration changes)
- **Upstream**: https://github.com/scottpetrovic/mesh2motion-app

The `main` branch of the fork stays in sync with the upstream repository. The `comfyui-support` branch contains additional code for ComfyUI integration:
- Base path resolution for iframe embedding
- PostMessage communication with ComfyUI parent window
- ComfyUI-specific HTML entry points and Vite build configuration

### Working with Submodules

```bash
# Clone with submodules
git clone --recurse-submodules https://github.com/jtydhr88/ComfyUI-mesh2motion.git

# If already cloned without submodules
git submodule update --init --recursive

# Update submodule to latest commit on comfyui-support branch
cd mesh2motion-app
git pull origin comfyui-support
cd ..
git add mesh2motion-app
git commit -m "Update mesh2motion-app submodule"
```

## Dependencies

- [Mesh2Motion](https://mesh2motion.org) - 3D rigging tool
- [Vue 3](https://vuejs.org) - UI framework
- [PrimeVue](https://primevue.org) - UI components
- [Three.js](https://threejs.org) - 3D rendering

## License

MIT

## Credits

- [Mesh2Motion](https://mesh2motion.org) by Scott Petrovic - The amazing 3D rigging tool
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) - The workflow platform
- [ComfyUI-PolotnoCanvasEditor](https://github.com/jtydhr88/ComfyUI-PolotnoCanvasEditor) - Plugin structure reference
