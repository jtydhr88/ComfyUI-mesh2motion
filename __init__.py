"""
ComfyUI-mesh2motion
A ComfyUI extension that integrates Mesh2Motion 3D editor for rigging and animation.
"""

import os
import mimetypes
import nodes
from aiohttp import web
from pathlib import Path

# Ensure common MIME types are registered
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('model/gltf-binary', '.glb')
mimetypes.add_type('model/gltf+json', '.gltf')

# Web directory for JavaScript extension
js_dir = os.path.join(os.path.dirname(os.path.realpath(__file__)), "js")
nodes.EXTENSION_WEB_DIRS["ComfyUI-mesh2motion"] = js_dir

# No custom nodes for this extension - it's a pure UI extension
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']

# Register HTTP routes for Mesh2Motion UI
from server import PromptServer

routes = PromptServer.instance.routes

MESH2MOTION_UI_PATH = Path(__file__).parent / 'mesh2motion-ui'

@routes.get('/mesh2motion')
async def serve_mesh2motion_index(request):
    """Serve the main Mesh2Motion UI (Explore page - index)"""
    # Default to Explore page (index-comfyui.html)
    for filename in ['index-comfyui.html', 'index.html']:
        index_path = MESH2MOTION_UI_PATH / filename
        if index_path.exists():
            return web.FileResponse(index_path)

    return web.Response(
        text="Mesh2Motion UI not found. Please build mesh2motion-app first: cd mesh2motion-app && npm install && npm run build:comfyui",
        status=404
    )

@routes.get('/mesh2motion/{path:.*}')
async def serve_mesh2motion_static(request):
    """Serve static files for Mesh2Motion UI"""
    path = request.match_info.get('path', '')

    # Security check
    if '..' in path or path.startswith('/'):
        return web.Response(text="Invalid path", status=400)

    file_path = MESH2MOTION_UI_PATH / path

    # If it's a directory, try to serve index files
    if file_path.is_dir():
        for index_name in ['index-comfyui.html', 'index.html', 'create-comfyui.html', 'create.html', 'retarget-comfyui.html', 'retarget.html']:
            index_path = file_path / index_name
            if index_path.exists():
                return web.FileResponse(index_path)

    # Special handling for retarget page
    if path == 'retarget' or path == 'retarget/':
        for filename in ['retarget-comfyui.html', 'retarget.html']:
            retarget_path = MESH2MOTION_UI_PATH / filename
            if retarget_path.exists():
                return web.FileResponse(retarget_path)

    # Serve the file if it exists
    if file_path.exists() and file_path.is_file():
        return web.FileResponse(file_path)

    return web.Response(text="File not found", status=404)
