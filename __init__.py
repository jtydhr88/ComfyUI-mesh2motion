"""
ComfyUI-mesh2motion
A ComfyUI extension that integrates Mesh2Motion 3D editor for rigging and animation.
"""

import os
import mimetypes
import nodes as comfy_nodes
from aiohttp import web
from pathlib import Path
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io
from .nodes import Mesh2MotionExplore

# Ensure common MIME types are registered
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('model/gltf-binary', '.glb')
mimetypes.add_type('model/gltf+json', '.gltf')

# Web directory for JavaScript extension
js_dir = os.path.join(os.path.dirname(os.path.realpath(__file__)), "js")
comfy_nodes.EXTENSION_WEB_DIRS["ComfyUI-mesh2motion"] = js_dir


class Mesh2MotionExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [Mesh2MotionExplore]


async def comfy_entrypoint() -> Mesh2MotionExtension:
    return Mesh2MotionExtension()

# Register HTTP routes for Mesh2Motion UI
from server import PromptServer

routes = PromptServer.instance.routes

MESH2MOTION_UI_PATH = Path(__file__).parent / 'mesh2motion-ui'

# Resolve once at module load for path-traversal checks
_MESH2MOTION_UI_REAL = MESH2MOTION_UI_PATH.resolve()


def _is_safe_child(base_real: Path, candidate: Path) -> bool:
    """Return True if candidate resolves to a path inside base_real."""
    try:
        candidate.resolve().relative_to(base_real)
        return True
    except ValueError:
        return False


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
    file_path = MESH2MOTION_UI_PATH / path

    # Security: ensure resolved path stays inside the UI directory
    if not _is_safe_child(_MESH2MOTION_UI_REAL, file_path):
        return web.Response(text="Invalid path", status=403)

    # If it's a directory, try to serve index files
    if file_path.is_dir():
        for index_name in ['index-comfyui.html', 'index.html', 'retarget-comfyui.html', 'retarget.html']:
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
