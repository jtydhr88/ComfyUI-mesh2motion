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
import folder_paths

routes = PromptServer.instance.routes

MESH2MOTION_UI_PATH = Path(__file__).parent / 'mesh2motion-ui'

# Resolve once at module load for path-traversal checks
_MESH2MOTION_UI_REAL = MESH2MOTION_UI_PATH.resolve()

# Subfolder of ComfyUI's input directory where user-uploaded FBX assets live.
# `/api/view?type=input&subfolder=mesh2motion/customs&filename=<name>` serves
# the file content; the listing endpoint below returns the names.
_CUSTOMS_SUBFOLDER = 'mesh2motion/customs'
_CUSTOMS_EXTS = {'.fbx'}


@routes.get('/mesh2motion/api/customs')
async def list_mesh2motion_customs(request):
    """List user-uploaded FBX assets in input/mesh2motion/customs/.

    Returns { "files": ["boxing.fbx", "...] }. Missing folder is not an
    error — just an empty list, since the upload UI may create it lazily.
    """
    input_dir = Path(folder_paths.get_input_directory())
    customs_dir = (input_dir / _CUSTOMS_SUBFOLDER).resolve()
    # Path-traversal sanity: the resolved customs folder must still live
    # inside ComfyUI's input directory.
    if not _is_safe_child(input_dir.resolve(), customs_dir):
        return web.json_response({'files': []})
    if not customs_dir.is_dir():
        return web.json_response({'files': []})
    files = sorted(
        p.name for p in customs_dir.iterdir()
        if p.is_file() and p.suffix.lower() in _CUSTOMS_EXTS
    )
    return web.json_response({'files': files})


@routes.post('/mesh2motion/api/customs')
async def upload_mesh2motion_custom(request):
    """Accept a multipart-form FBX upload and save under
    input/mesh2motion/customs/. Form field name: `file`. Returns the
    sanitized filename(s) saved on success. Streams the body to disk so
    large FBX uploads don't buffer the whole file in memory.
    """
    input_dir = Path(folder_paths.get_input_directory()).resolve()
    customs_dir = (input_dir / _CUSTOMS_SUBFOLDER).resolve()
    if not _is_safe_child(input_dir, customs_dir):
        return web.json_response({'error': 'invalid path'}, status=400)
    customs_dir.mkdir(parents=True, exist_ok=True)

    reader = await request.multipart()
    saved = []
    while True:
        field = await reader.next()
        if field is None:
            break
        if field.name != 'file':
            continue
        # Strip any directory components the client might have included
        # (browsers usually send just the basename, but defence in depth).
        raw_name = field.filename or 'upload.fbx'
        safe_name = Path(raw_name).name
        if not safe_name or safe_name in {'.', '..'} \
                or '/' in safe_name or '\\' in safe_name:
            return web.json_response({'error': 'invalid filename'}, status=400)
        if Path(safe_name).suffix.lower() not in _CUSTOMS_EXTS:
            return web.json_response({'error': 'unsupported extension'}, status=400)
        target = (customs_dir / safe_name).resolve()
        if not _is_safe_child(customs_dir, target):
            return web.json_response({'error': 'path traversal blocked'}, status=400)
        with target.open('wb') as f:
            while True:
                chunk = await field.read_chunk(64 * 1024)
                if not chunk:
                    break
                f.write(chunk)
        saved.append(safe_name)

    if not saved:
        return web.json_response({'error': 'no file in form'}, status=400)
    return web.json_response({'files': saved})


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
