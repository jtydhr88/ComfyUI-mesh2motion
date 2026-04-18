"""
ComfyUI node definitions for mesh2motion.

Nodes embed the mesh2motion 3D scene as an iframe inside the node.
On execution, they capture a screenshot and return it as an IMAGE tensor.
The image data flows through a hidden 'image' widget populated by the
frontend's serializeValue hook.
"""

import json
from fractions import Fraction
import torch
import numpy as np
import av
from PIL import Image, ImageOps
import folder_paths
from comfy_api.latest import InputImpl, Types, io


def _decode_video_to_tensor(video_path: str, width: int, height: int) -> torch.Tensor:
    """Decode a webm (or mp4) file into (frames, H, W, 3) float32 tensor in [0,1].

    Uses PyAV, which is already a ComfyUI core dependency (>=14.2.0).
    """
    frames = []
    container = av.open(video_path)
    try:
        for frame in container.decode(video=0):
            rgb = frame.to_ndarray(format='rgb24')  # (H, W, 3) uint8
            if rgb.shape[0] != height or rgb.shape[1] != width:
                img = Image.fromarray(rgb).resize((width, height), Image.LANCZOS)
                rgb = np.array(img)
            frames.append(torch.from_numpy(rgb).float() / 255.0)
    finally:
        container.close()

    if not frames:
        return torch.zeros(1, height, width, 3)
    return torch.stack(frames)


def _load_and_resize_image(image_path: str, width: int, height: int) -> torch.Tensor:
    """Load an image, crop to target aspect ratio, resize, and return as (1, H, W, 3) float32 tensor."""
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
    return torch.from_numpy(image_np)[None,]


class Mesh2MotionExplore(io.ComfyNode):
    """
    Embeds the mesh2motion Explore view (pre-rigged models + animations)
    directly inside the node. Outputs a screenshot as IMAGE.

    Skeleton choice, camera preset, and panel visibility all live inside
    the mesh2motion iframe UI; their state is persisted via node.properties
    (see explore-widget.ts for the wiring).
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="Mesh2MotionExplore",
            display_name="Mesh2Motion Explore",
            category="3d/mesh2motion",
            is_output_node=True,
            inputs=[
                io.Boolean.Input("show_skeleton", default=False),
                io.Boolean.Input("mirror_animations", default=False),
                io.Boolean.Input("preview_output", default=False),
                io.Boolean.Input("checker_room", default=False),
                io.Int.Input("width", default=1024, min=1, max=4096, step=1),
                io.Int.Input("height", default=1024, min=1, max=4096, step=1),
                io.Int.Input("fps", default=24, min=1, max=120, step=1),
                io.String.Input("image", default="", optional=True, socketless=True, extra_dict={"hidden": True}),
                io.String.Input("video_frames", default="", optional=True, socketless=True, extra_dict={"hidden": True}),
            ],
            outputs=[
                io.Image.Output("image"),
                io.Video.Output("video"),
            ],
        )

    @classmethod
    def execute(cls, show_skeleton=False, mirror_animations=False,
                preview_output=False, checker_room=False, width=1024, height=1024,
                fps=24, image="", video_frames="",
                **kwargs) -> io.NodeOutput:

        # Single frame screenshot
        if not image:
            screenshot = torch.zeros(1, height, width, 3)
        else:
            screenshot = _load_and_resize_image(
                folder_paths.get_annotated_filepath(image), width, height
            )

        # Video payload from the iframe's WebCodecs recorder:
        #   { "video": "mesh2motion/xxx.webm [temp]", "fps": N }
        # The `fps` value carried in the payload is informational; the user-set
        # `fps` widget input is authoritative for the VideoComponents frame_rate.
        video_tensor = None
        if video_frames:
            try:
                vf_data = json.loads(video_frames)
                if vf_data.get("video"):
                    vpath = folder_paths.get_annotated_filepath(vf_data["video"])
                    video_tensor = _decode_video_to_tensor(vpath, width, height)
            except Exception as e:
                print(f"[Mesh2Motion] Failed to load video: {e}")

        if video_tensor is None:
            # No camera preset / no capture — emit a 1-frame black video so
            # downstream nodes that expect a VIDEO don't error out.
            video_tensor = torch.zeros(1, height, width, 3)

        video = InputImpl.VideoFromComponents(
            Types.VideoComponents(images=video_tensor, frame_rate=Fraction(int(fps)))
        )

        return io.NodeOutput(screenshot, video)
