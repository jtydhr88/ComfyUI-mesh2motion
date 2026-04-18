import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
const POST_MESSAGE_ORIGIN = window.location.origin;
function captureFromMesh2MotionIframe(iframe) {
  return new Promise((resolve, reject) => {
    var _a;
    const timeout = setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("Mesh2Motion capture timeout"));
    }, 15e3);
    const handler = (event) => {
      var _a2;
      if (event.origin !== POST_MESSAGE_ORIGIN || event.source !== iframe.contentWindow) return;
      if (((_a2 = event.data) == null ? void 0 : _a2.type) === "mesh2motion:captureResult") {
        clearTimeout(timeout);
        window.removeEventListener("message", handler);
        resolve(event.data.data);
      }
    };
    window.addEventListener("message", handler);
    (_a = iframe.contentWindow) == null ? void 0 : _a.postMessage({ type: "mesh2motion:capture" }, POST_MESSAGE_ORIGIN);
  });
}
function captureVideoFromMesh2MotionIframe(iframe, presetName, width, height) {
  return new Promise((resolve, reject) => {
    var _a;
    const timeout = setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("Video capture timeout (120s)"));
    }, 12e4);
    const handler = (event) => {
      var _a2;
      if (event.origin !== POST_MESSAGE_ORIGIN || event.source !== iframe.contentWindow) return;
      if (((_a2 = event.data) == null ? void 0 : _a2.type) === "mesh2motion:captureVideoResult") {
        clearTimeout(timeout);
        window.removeEventListener("message", handler);
        const result = event.data.data;
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve({ videoPath: result.videoPath, fps: result.fps });
        }
      }
    };
    window.addEventListener("message", handler);
    (_a = iframe.contentWindow) == null ? void 0 : _a.postMessage({
      type: "mesh2motion:captureVideoFrames",
      data: { presetName, width, height }
    }, POST_MESSAGE_ORIGIN);
  });
}
async function uploadMesh2MotionTempImage(dataUrl) {
  const blob = await fetch(dataUrl).then((r) => r.blob());
  const name = `mesh2motion_${Date.now()}.png`;
  const file = new File([blob], name, { type: "image/png" });
  const body = new FormData();
  body.append("image", file);
  body.append("subfolder", "mesh2motion");
  body.append("type", "temp");
  const resp = await api.fetchApi("/upload/image", {
    method: "POST",
    body
  });
  if (resp.status !== 200) {
    throw new Error(`Upload failed: ${resp.status}`);
  }
  return await resp.json();
}
function createMesh2MotionExploreWidget(node) {
  const container = document.createElement("div");
  container.style.cssText = "width:100%;height:100%;position:relative;overflow:hidden;";
  const iframe = document.createElement("iframe");
  iframe.src = "/mesh2motion/index-comfyui.html?comfyui=true&theme=dark";
  iframe.style.cssText = "width:100%;height:100%;border:none;display:block;";
  iframe.allow = "cross-origin-isolated";
  container.appendChild(iframe);
  node._mesh2motionIframe = iframe;
  node._mesh2motionReady = false;
  const readyHandler = (event) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
    if (event.origin !== POST_MESSAGE_ORIGIN || event.source !== iframe.contentWindow) return;
    if (((_a = event.data) == null ? void 0 : _a.type) === "mesh2motion:ready") {
      node._mesh2motionReady = true;
      const savedSkeleton = (_b = node.properties) == null ? void 0 : _b["mesh2motion_skeleton"];
      if (savedSkeleton) {
        (_c = iframe.contentWindow) == null ? void 0 : _c.postMessage(
          { type: "mesh2motion:restoreSkeleton", data: { value: savedSkeleton } },
          POST_MESSAGE_ORIGIN
        );
      }
      if (node.properties && "mesh2motion_camera_preset" in node.properties) {
        (_d = iframe.contentWindow) == null ? void 0 : _d.postMessage(
          { type: "mesh2motion:restoreCameraPreset", data: { value: node.properties["mesh2motion_camera_preset"] } },
          POST_MESSAGE_ORIGIN
        );
      }
      if (node.properties && "mesh2motion_timeline_zoom" in node.properties) {
        (_e = iframe.contentWindow) == null ? void 0 : _e.postMessage(
          { type: "mesh2motion:restoreTimelineZoom", data: { value: node.properties["mesh2motion_timeline_zoom"] } },
          POST_MESSAGE_ORIGIN
        );
      }
      if (node.properties && "mesh2motion_preset_tuning" in node.properties) {
        (_f = iframe.contentWindow) == null ? void 0 : _f.postMessage(
          { type: "mesh2motion:restorePresetTuning", data: { map: node.properties["mesh2motion_preset_tuning"] } },
          POST_MESSAGE_ORIGIN
        );
      }
      if (node.properties && "mesh2motion_panel_state" in node.properties) {
        (_g = iframe.contentWindow) == null ? void 0 : _g.postMessage(
          { type: "mesh2motion:restorePanelState", data: { state: node.properties["mesh2motion_panel_state"] } },
          POST_MESSAGE_ORIGIN
        );
      }
      sendInitialBooleanStates();
      sendPreviewState();
      const saved = (_h = node.properties) == null ? void 0 : _h["mesh2motion_timeline"];
      if (saved) {
        node._mesh2motionPendingTimeline = saved;
      }
    }
    if (((_i = event.data) == null ? void 0 : _i.type) === "mesh2motion:animationsReady") {
      const pending = node._mesh2motionPendingTimeline;
      if (pending) {
        (_j = iframe.contentWindow) == null ? void 0 : _j.postMessage(
          { type: "mesh2motion:restoreTimeline", data: pending },
          POST_MESSAGE_ORIGIN
        );
        node._mesh2motionPendingTimeline = null;
      }
    }
    if (((_k = event.data) == null ? void 0 : _k.type) === "mesh2motion:timelineState" && ((_l = event.data) == null ? void 0 : _l.data)) {
      if (!node.properties) node.properties = {};
      node.properties["mesh2motion_timeline"] = event.data.data;
    }
    if (((_m = event.data) == null ? void 0 : _m.type) === "mesh2motion:skeletonChanged" && ((_o = (_n = event.data) == null ? void 0 : _n.data) == null ? void 0 : _o.value)) {
      if (!node.properties) node.properties = {};
      node.properties["mesh2motion_skeleton"] = event.data.data.value;
    }
    if (((_p = event.data) == null ? void 0 : _p.type) === "mesh2motion:cameraPresetChanged" && "value" in (((_q = event.data) == null ? void 0 : _q.data) ?? {})) {
      if (!node.properties) node.properties = {};
      node.properties["mesh2motion_camera_preset"] = event.data.data.value;
    }
    if (((_r = event.data) == null ? void 0 : _r.type) === "mesh2motion:timelineZoomChanged" && typeof ((_t = (_s = event.data) == null ? void 0 : _s.data) == null ? void 0 : _t.value) === "number") {
      if (!node.properties) node.properties = {};
      node.properties["mesh2motion_timeline_zoom"] = event.data.data.value;
    }
    if (((_u = event.data) == null ? void 0 : _u.type) === "mesh2motion:presetTuningChanged" && ((_w = (_v = event.data) == null ? void 0 : _v.data) == null ? void 0 : _w.map)) {
      if (!node.properties) node.properties = {};
      node.properties["mesh2motion_preset_tuning"] = event.data.data.map;
    }
    if (((_x = event.data) == null ? void 0 : _x.type) === "mesh2motion:panelStateChanged" && ((_z = (_y = event.data) == null ? void 0 : _y.data) == null ? void 0 : _z.state)) {
      if (!node.properties) node.properties = {};
      node.properties["mesh2motion_panel_state"] = event.data.data.state;
    }
  };
  window.addEventListener("message", readyHandler);
  const origOnRemovedExplore = node.onRemoved;
  node.onRemoved = function() {
    window.removeEventListener("message", readyHandler);
    origOnRemovedExplore == null ? void 0 : origOnRemovedExplore.call(this);
  };
  const BOOLEAN_WIDGETS = [
    { widget: "show_skeleton", type: "mesh2motion:setShowSkeleton" },
    { widget: "mirror_animations", type: "mesh2motion:setMirrorAnimations" },
    { widget: "checker_room", type: "mesh2motion:setCheckerRoom" }
  ];
  const hookBooleanWidget = (widgetName, messageType) => {
    var _a;
    const widget = (_a = node.widgets) == null ? void 0 : _a.find((w2) => w2.name === widgetName);
    if (widget) {
      const origCallback = widget.callback;
      widget.callback = (value) => {
        var _a2;
        origCallback == null ? void 0 : origCallback(value);
        if (node._mesh2motionReady) {
          (_a2 = iframe.contentWindow) == null ? void 0 : _a2.postMessage(
            { type: messageType, data: { value } },
            POST_MESSAGE_ORIGIN
          );
        }
      };
    }
  };
  const sendInitialBooleanStates = () => {
    var _a, _b;
    for (const { widget: name, type } of BOOLEAN_WIDGETS) {
      const w2 = (_a = node.widgets) == null ? void 0 : _a.find((x) => x.name === name);
      if (!w2) continue;
      (_b = iframe.contentWindow) == null ? void 0 : _b.postMessage(
        { type, data: { value: !!w2.value } },
        POST_MESSAGE_ORIGIN
      );
    }
  };
  const sendPreviewState = () => {
    var _a, _b, _c, _d;
    if (!node._mesh2motionReady) return;
    const previewWidget = (_a = node.widgets) == null ? void 0 : _a.find((w2) => w2.name === "preview_output");
    const widthWidget = (_b = node.widgets) == null ? void 0 : _b.find((w2) => w2.name === "width");
    const heightWidget = (_c = node.widgets) == null ? void 0 : _c.find((w2) => w2.name === "height");
    (_d = iframe.contentWindow) == null ? void 0 : _d.postMessage({
      type: "mesh2motion:setPreviewOverlay",
      data: {
        enabled: !!(previewWidget == null ? void 0 : previewWidget.value),
        width: (widthWidget == null ? void 0 : widthWidget.value) ?? 1024,
        height: (heightWidget == null ? void 0 : heightWidget.value) ?? 1024
      }
    }, POST_MESSAGE_ORIGIN);
  };
  const hookPreviewWidgets = () => {
    var _a, _b, _c;
    const widthWidget = (_a = node.widgets) == null ? void 0 : _a.find((w2) => w2.name === "width");
    const heightWidget = (_b = node.widgets) == null ? void 0 : _b.find((w2) => w2.name === "height");
    const previewWidget = (_c = node.widgets) == null ? void 0 : _c.find((w2) => w2.name === "preview_output");
    if (widthWidget) {
      widthWidget.callback = () => {
        sendPreviewState();
      };
    }
    if (heightWidget) {
      heightWidget.callback = () => {
        sendPreviewState();
      };
    }
    if (previewWidget) {
      previewWidget.callback = () => {
        sendPreviewState();
      };
    }
  };
  node.addDOMWidget("mesh2motion_view", "mesh2motion-explore", container, {
    getMinHeight: () => 450,
    hideOnZoom: false,
    serialize: false
  });
  const hookHiddenWidget = (widgetName, serializeFn) => {
    var _a;
    const widget = (_a = node.widgets) == null ? void 0 : _a.find((w2) => w2.name === widgetName);
    if (widget) {
      widget.serializeValue = serializeFn;
    }
  };
  setTimeout(() => {
    hookBooleanWidget("show_skeleton", "mesh2motion:setShowSkeleton");
    hookBooleanWidget("mirror_animations", "mesh2motion:setMirrorAnimations");
    hookBooleanWidget("checker_room", "mesh2motion:setCheckerRoom");
    hookPreviewWidgets();
    hookHiddenWidget("image", async () => {
      try {
        const dataUrl = await captureFromMesh2MotionIframe(node._mesh2motionIframe);
        const result = await uploadMesh2MotionTempImage(dataUrl);
        return `mesh2motion/${result.name} [temp]`;
      } catch (err) {
        console.error("[Mesh2Motion] Capture failed:", err);
        return "";
      }
    });
    const computeVideoSignature = () => {
      var _a, _b, _c;
      const presetFile = (_a = node.properties) == null ? void 0 : _a["mesh2motion_camera_preset"];
      if (!presetFile) return null;
      const w2 = (name) => {
        var _a2, _b2;
        return (_b2 = (_a2 = node.widgets) == null ? void 0 : _a2.find((x) => x.name === name)) == null ? void 0 : _b2.value;
      };
      return JSON.stringify({
        presetFile,
        skeleton: ((_b = node.properties) == null ? void 0 : _b["mesh2motion_skeleton"]) ?? null,
        timeline: ((_c = node.properties) == null ? void 0 : _c["mesh2motion_timeline"]) ?? null,
        width: w2("width"),
        height: w2("height"),
        fps: w2("fps"),
        showSkel: !!w2("show_skeleton"),
        mirror: !!w2("mirror_animations"),
        checker: !!w2("checker_room")
      });
    };
    hookHiddenWidget("video_frames", async () => {
      var _a, _b, _c;
      const presetFile = (_a = node.properties) == null ? void 0 : _a["mesh2motion_camera_preset"];
      if (!presetFile) return "";
      const signature = computeVideoSignature();
      if (signature != null && signature === node._mesh2motionVideoSig && typeof node._mesh2motionVideoSerialized === "string" && node._mesh2motionVideoSerialized) {
        return node._mesh2motionVideoSerialized;
      }
      const fileName = presetFile.split("/").pop() ?? "";
      const presetId = fileName.replace(/\.json$/, "");
      if (!presetId) return "";
      const widthWidget = (_b = node.widgets) == null ? void 0 : _b.find((w3) => w3.name === "width");
      const heightWidget = (_c = node.widgets) == null ? void 0 : _c.find((w3) => w3.name === "height");
      const w2 = (widthWidget == null ? void 0 : widthWidget.value) ?? 1024;
      const h2 = (heightWidget == null ? void 0 : heightWidget.value) ?? 1024;
      try {
        const result = await captureVideoFromMesh2MotionIframe(
          node._mesh2motionIframe,
          presetId,
          w2,
          h2
        );
        const serialized = JSON.stringify({ video: result.videoPath, fps: result.fps });
        if (signature != null) {
          node._mesh2motionVideoSig = signature;
          node._mesh2motionVideoSerialized = serialized;
        }
        return serialized;
      } catch (err) {
        console.error("[Mesh2Motion] Video capture failed:", err);
        return "";
      }
    });
  }, 100);
  const [w, h] = node.size;
  node.setSize([Math.max(w, 500), Math.max(h, 700)]);
}
app.registerExtension({
  name: "ComfyUI.Mesh2Motion",
  nodeCreated(node) {
    var _a;
    if (((_a = node.constructor) == null ? void 0 : _a.comfyClass) === "Mesh2MotionExplore") {
      createMesh2MotionExploreWidget(node);
    }
  }
});
//# sourceMappingURL=main.js.map
