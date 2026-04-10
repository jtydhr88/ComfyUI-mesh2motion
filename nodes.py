"""
ComfyUI node definitions for mesh2motion.

Nodes embed the mesh2motion 3D scene as an iframe inside the node.
On execution, they capture a screenshot and return it as an IMAGE tensor.
The image data flows through a hidden 'image' widget populated by the
frontend's serializeValue hook.
"""

import torch
import numpy as np
from PIL import Image, ImageOps
import folder_paths

SKELETON_TYPES = ["human", "fox", "bird", "dragon", "kaiju", "spider", "snake"]


class Mesh2MotionExplore:
    """
    Embeds the mesh2motion Explore view (pre-rigged models + animations)
    directly inside the node. Outputs a screenshot as IMAGE.
    """

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "skeleton_type": (SKELETON_TYPES, {"default": "human"}),
                "show_animations": ("BOOLEAN", {"default": True}),
                "show_skeleton": ("BOOLEAN", {"default": False}),
                "mirror_animations": ("BOOLEAN", {"default": False}),
                "width": ("INT", {"default": 1024, "min": 1, "max": 4096, "step": 1}),
                "height": ("INT", {"default": 1024, "min": 1, "max": 4096, "step": 1}),
            },
            "hidden": {
                "image": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "run"
    OUTPUT_NODE = True
    CATEGORY = "3d/mesh2motion"

    def run(self, skeleton_type="human", show_animations=True, show_skeleton=False, mirror_animations=False, width=1024, height=1024, image="", **kwargs):
        if not image:
            return (torch.zeros(1, height, width, 3),)

        image_path = folder_paths.get_annotated_filepath(image)
        i = Image.open(image_path)
        i = ImageOps.exif_transpose(i)
        if i.mode != "RGB":
            i = i.convert("RGB")

        if i.width != width or i.height != height:
            src_ratio = i.width / i.height
            dst_ratio = width / height

            if src_ratio > dst_ratio:
                new_w = int(i.height * dst_ratio)
                left = (i.width - new_w) // 2
                i = i.crop((left, 0, left + new_w, i.height))
            elif src_ratio < dst_ratio:
                new_h = int(i.width / dst_ratio)
                top = (i.height - new_h) // 2
                i = i.crop((0, top, i.width, top + new_h))

            i = i.resize((width, height), Image.LANCZOS)

        image_np = np.array(i).astype(np.float32) / 255.0
        image_tensor = torch.from_numpy(image_np)[None,]

        return (image_tensor,)


def _scan_3d_models():
    """Scan ComfyUI input/3d directory for 3D model files."""
    import os
    input_dir = os.path.join(folder_paths.get_input_directory(), "3d")
    os.makedirs(input_dir, exist_ok=True)
    extensions = {'.glb', '.gltf', '.obj', '.fbx', '.stl'}
    files = []
    for root, _, filenames in os.walk(input_dir):
        for f in filenames:
            if os.path.splitext(f)[1].lower() in extensions:
                rel = os.path.relpath(os.path.join(root, f), folder_paths.get_input_directory())
                files.append(rel.replace('\\', '/'))
    return sorted(files)


class Mesh2MotionCreate:
    """
    Embeds the mesh2motion Create view (custom model rigging + animation).
    Upload a 3D model via ComfyUI's file selector, rig it with mesh2motion's
    skeleton editor, and output a screenshot as IMAGE.
    """

    @classmethod
    def INPUT_TYPES(s):
        files = _scan_3d_models()
        return {
            "required": {
                "model_file": (files if files else ["none"], {
                    "mesh_upload": True,
                    "upload_subfolder": "3d",
                }),
                "width": ("INT", {"default": 1024, "min": 1, "max": 4096, "step": 1}),
                "height": ("INT", {"default": 1024, "min": 1, "max": 4096, "step": 1}),
            },
            "hidden": {
                "image": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "run"
    OUTPUT_NODE = True
    CATEGORY = "3d/mesh2motion"

    def run(self, model_file="", width=1024, height=1024, image="", **kwargs):
        if not image:
            return (torch.zeros(1, height, width, 3),)

        image_path = folder_paths.get_annotated_filepath(image)
        i = Image.open(image_path)
        i = ImageOps.exif_transpose(i)
        if i.mode != "RGB":
            i = i.convert("RGB")

        if i.width != width or i.height != height:
            src_ratio = i.width / i.height
            dst_ratio = width / height

            if src_ratio > dst_ratio:
                new_w = int(i.height * dst_ratio)
                left = (i.width - new_w) // 2
                i = i.crop((left, 0, left + new_w, i.height))
            elif src_ratio < dst_ratio:
                new_h = int(i.width / dst_ratio)
                top = (i.height - new_h) // 2
                i = i.crop((0, top, i.width, top + new_h))

            i = i.resize((width, height), Image.LANCZOS)

        image_np = np.array(i).astype(np.float32) / 255.0
        image_tensor = torch.from_numpy(image_np)[None,]

        return (image_tensor,)


NODE_CLASS_MAPPINGS = {
    "Mesh2MotionExplore": Mesh2MotionExplore,
    # "Mesh2MotionCreate": Mesh2MotionCreate,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Mesh2MotionExplore": "Mesh2Motion Explore",
    # "Mesh2MotionCreate": "Mesh2Motion Create",
}
