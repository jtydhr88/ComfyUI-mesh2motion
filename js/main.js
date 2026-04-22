var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
const POST_MESSAGE_ORIGIN = window.location.origin;
const MODEL_3D_NODES = ["Load3D", "Preview3D", "SaveGLB"];
const IMAGE_NODES = ["LoadImage"];
function isModel3DNode(node) {
  var _a;
  if (!node || typeof node !== "object") return false;
  const n = node;
  const typedNode = node;
  const nodeClass = (_a = typedNode == null ? void 0 : typedNode.constructor) == null ? void 0 : _a.comfyClass;
  if (nodeClass && MODEL_3D_NODES.includes(nodeClass)) return true;
  if (n.widgets) {
    const has3DWidget = n.widgets.some(
      (w) => w.name === "model_file" || w.name === "mesh" || w.name === "3d_model" || w.value && typeof w.value === "string" && /\.(glb|gltf|fbx|obj)$/i.test(w.value)
    );
    if (has3DWidget) return true;
  }
  return false;
}
function getModelUrlFromNode(node) {
  var _a, _b, _c, _d;
  const nodeClass = (_a = node.constructor) == null ? void 0 : _a.comfyClass;
  if (nodeClass === "Preview3D") {
    const lastModelFile = (_b = node.properties) == null ? void 0 : _b["Last Time Model File"];
    if (lastModelFile) return buildModelUrl(lastModelFile, "output");
  }
  if ((_c = node.images) == null ? void 0 : _c[0]) {
    const model = node.images[0];
    const params = new URLSearchParams({
      filename: model.filename,
      type: model.type || "input",
      subfolder: model.subfolder || ""
    });
    return api.apiURL(`/view?${params.toString()}`);
  }
  const modelWidget = (_d = node.widgets) == null ? void 0 : _d.find(
    (w) => w.name === "model_file" || w.name === "mesh" || w.name === "3d_model" || w.name === "model"
  );
  if (modelWidget == null ? void 0 : modelWidget.value) return buildModelUrl(modelWidget.value, "input");
  return null;
}
function buildModelUrl(value, defaultType) {
  const match = value.match(/^(.+?)(?:\s*\[(\w+)\])?$/);
  if (!match) return null;
  const fullPath = match[1];
  const type = match[2] || defaultType;
  const lastSlash = fullPath.lastIndexOf("/");
  const subfolder = lastSlash > -1 ? fullPath.substring(0, lastSlash) : "";
  const filename = lastSlash > -1 ? fullPath.substring(lastSlash + 1) : fullPath;
  const params = new URLSearchParams({ filename, type, subfolder });
  return api.apiURL(`/view?${params.toString()}`);
}
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
      var _a, _b, _c, _d;
      const presetFile = (_a = node.properties) == null ? void 0 : _a["mesh2motion_camera_preset"];
      if (!presetFile) return null;
      const tuningMap = (_b = node.properties) == null ? void 0 : _b["mesh2motion_preset_tuning"];
      const tuning = (tuningMap == null ? void 0 : tuningMap[presetFile]) ?? null;
      const w2 = (name) => {
        var _a2, _b2;
        return (_b2 = (_a2 = node.widgets) == null ? void 0 : _a2.find((x) => x.name === name)) == null ? void 0 : _b2.value;
      };
      return JSON.stringify({
        presetFile,
        skeleton: ((_c = node.properties) == null ? void 0 : _c["mesh2motion_skeleton"]) ?? null,
        timeline: ((_d = node.properties) == null ? void 0 : _d["mesh2motion_timeline"]) ?? null,
        tuning,
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
const CSS = `
.mesh2motion-dialog-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 10000;
  display: flex; align-items: center; justify-content: center;
}
.mesh2motion-dialog {
  width: 95vw; height: 95vh;
  background: #1e1e1e; color: #e0e0e0;
  border: 1px solid #444; border-radius: 6px;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
.mesh2motion-dialog-header {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; background: #2a2a2a;
  border-bottom: 1px solid #444; flex: 0 0 auto;
}
.mesh2motion-dialog-title { font-weight: 600; font-size: 14px; flex: 1 1 auto; }
.mesh2motion-dialog-btn {
  background: #3a3a3a; color: #eee; border: 1px solid #555;
  border-radius: 4px; padding: 6px 12px; cursor: pointer;
  font-size: 13px;
}
.mesh2motion-dialog-btn:hover:not(:disabled) { background: #4a4a4a; }
.mesh2motion-dialog-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mesh2motion-dialog-btn-primary { background: #2563eb; border-color: #3b82f6; }
.mesh2motion-dialog-btn-primary:hover:not(:disabled) { background: #1d4ed8; }
.mesh2motion-dialog-close {
  background: transparent; border: none; color: #bbb;
  cursor: pointer; font-size: 20px; line-height: 1; padding: 0 6px;
}
.mesh2motion-dialog-close:hover { color: #fff; }
.mesh2motion-dialog-body { flex: 1 1 auto; position: relative; }
.mesh2motion-dialog-iframe { width: 100%; height: 100%; border: 0; display: block; }
.mesh2motion-dialog-status {
  font-size: 12px; color: #8bc; margin-right: 8px; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
`;
class Mesh2MotionDialog {
  constructor() {
    __publicField(this, "overlay", null);
    __publicField(this, "dialog", null);
    __publicField(this, "iframe", null);
    __publicField(this, "titleEl", null);
    __publicField(this, "statusEl", null);
    __publicField(this, "saveBtn", null);
    __publicField(this, "saveImageBtn", null);
    __publicField(this, "styleInjected", false);
    __publicField(this, "currentPage", "explore");
    __publicField(this, "currentNode", null);
    __publicField(this, "editorReady", false);
    __publicField(this, "pendingModelUrl", null);
    __publicField(this, "saveInFlight", false);
    __publicField(this, "saveImageInFlight", false);
    __publicField(this, "onMessage", (event) => {
      if (event.origin !== POST_MESSAGE_ORIGIN) return;
      if (!this.iframe || event.source !== this.iframe.contentWindow) return;
      const { type, data } = event.data || {};
      switch (type) {
        case "mesh2motion:ready":
          this.editorReady = true;
          this.updateSaveButtonsEnabled(true);
          if (this.statusEl) this.statusEl.textContent = "";
          if (this.pendingModelUrl) {
            this.post("comfyui:loadModel", { url: this.pendingModelUrl });
            this.pendingModelUrl = null;
          }
          break;
        case "mesh2motion:modelLoaded":
          break;
        case "mesh2motion:export":
          if ((data == null ? void 0 : data.modelData) && (data == null ? void 0 : data.filename)) {
            void this.handleModelExport(data.modelData, data.filename);
          }
          break;
        case "mesh2motion:imageExport":
          if ((data == null ? void 0 : data.imageDataUrl) && (data == null ? void 0 : data.filename)) {
            void this.handleImageExport(
              data.imageDataUrl,
              data.filename,
              Number(data.width) || 512,
              Number(data.height) || 512
            );
          }
          break;
        case "mesh2motion:error":
          console.error("[Mesh2Motion] iframe error:", data == null ? void 0 : data.message);
          if (this.statusEl) this.statusEl.textContent = String((data == null ? void 0 : data.message) ?? "Error");
          this.saveInFlight = false;
          this.saveImageInFlight = false;
          this.updateSaveButtonsEnabled(this.editorReady);
          break;
      }
    });
  }
  openExplore(node) {
    this.currentPage = "explore";
    this.currentNode = node;
    this.show();
  }
  openCreate(node) {
    this.currentPage = "create";
    this.currentNode = node;
    this.pendingModelUrl = node ? getModelUrlFromNode(node) : null;
    this.show();
  }
  close() {
    this.editorReady = false;
    this.pendingModelUrl = null;
    this.currentNode = null;
    this.saveInFlight = false;
    this.saveImageInFlight = false;
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
      this.dialog = null;
      this.iframe = null;
      this.titleEl = null;
      this.statusEl = null;
      this.saveBtn = null;
      this.saveImageBtn = null;
    }
  }
  // ── Build & show ────────────────────────────────────────────────────
  show() {
    this.injectStyles();
    this.buildUI();
    this.updateSaveButtonsEnabled(false);
    if (this.statusEl) this.statusEl.textContent = "Loading editor…";
    const pageFile = this.currentPage === "explore" ? "index-comfyui-window.html" : "create-comfyui-window.html";
    const params = new URLSearchParams({ window: "true", theme: "dark" });
    if (this.iframe) this.iframe.src = `/mesh2motion/${pageFile}?${params.toString()}`;
    if (this.titleEl) {
      const hint = this.currentPage === "explore" ? "Explore" : "Create";
      this.titleEl.textContent = `Mesh2Motion — ${hint}`;
    }
  }
  injectStyles() {
    if (this.styleInjected) return;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    this.styleInjected = true;
  }
  buildUI() {
    if (this.overlay) return;
    this.overlay = document.createElement("div");
    this.overlay.className = "mesh2motion-dialog-overlay";
    this.overlay.addEventListener("click", (ev) => {
      if (ev.target === this.overlay) this.close();
    });
    this.dialog = document.createElement("div");
    this.dialog.className = "mesh2motion-dialog";
    const header = document.createElement("div");
    header.className = "mesh2motion-dialog-header";
    this.titleEl = document.createElement("span");
    this.titleEl.className = "mesh2motion-dialog-title";
    header.appendChild(this.titleEl);
    this.statusEl = document.createElement("span");
    this.statusEl.className = "mesh2motion-dialog-status";
    header.appendChild(this.statusEl);
    this.saveImageBtn = document.createElement("button");
    this.saveImageBtn.className = "mesh2motion-dialog-btn";
    this.saveImageBtn.textContent = "Save Image";
    this.saveImageBtn.addEventListener("click", () => this.requestImageExport());
    header.appendChild(this.saveImageBtn);
    this.saveBtn = document.createElement("button");
    this.saveBtn.className = "mesh2motion-dialog-btn mesh2motion-dialog-btn-primary";
    this.saveBtn.textContent = "Save Model";
    this.saveBtn.addEventListener("click", () => this.requestExport());
    header.appendChild(this.saveBtn);
    const closeBtn = document.createElement("button");
    closeBtn.className = "mesh2motion-dialog-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", () => this.close());
    header.appendChild(closeBtn);
    this.dialog.appendChild(header);
    const body = document.createElement("div");
    body.className = "mesh2motion-dialog-body";
    this.iframe = document.createElement("iframe");
    this.iframe.className = "mesh2motion-dialog-iframe";
    this.iframe.allow = "cross-origin-isolated";
    body.appendChild(this.iframe);
    this.dialog.appendChild(body);
    this.overlay.appendChild(this.dialog);
    document.body.appendChild(this.overlay);
    window.addEventListener("message", this.onMessage);
  }
  post(type, data) {
    var _a, _b;
    (_b = (_a = this.iframe) == null ? void 0 : _a.contentWindow) == null ? void 0 : _b.postMessage({ type, data }, POST_MESSAGE_ORIGIN);
  }
  updateSaveButtonsEnabled(enabled) {
    if (this.saveBtn) this.saveBtn.disabled = !enabled || this.saveInFlight;
    if (this.saveImageBtn) this.saveImageBtn.disabled = !enabled || this.saveImageInFlight;
  }
  requestExport() {
    if (!this.editorReady || this.saveInFlight) return;
    this.saveInFlight = true;
    this.updateSaveButtonsEnabled(true);
    if (this.statusEl) this.statusEl.textContent = "Exporting model…";
    this.post("comfyui:requestExport");
  }
  requestImageExport() {
    if (!this.editorReady || this.saveImageInFlight) return;
    this.saveImageInFlight = true;
    this.updateSaveButtonsEnabled(true);
    if (this.statusEl) this.statusEl.textContent = "Open the export overlay in the editor, then confirm…";
    this.post("comfyui:requestImageExport");
  }
  // ── Back-to-ComfyUI upload + node injection ─────────────────────────
  async handleModelExport(modelData, filename) {
    try {
      const blob = new Blob([modelData], { type: "model/gltf-binary" });
      const finalFilename = filename || `mesh2motion-${Date.now()}.glb`;
      const formData = new FormData();
      formData.append("image", blob, finalFilename);
      formData.append("type", "input");
      formData.append("subfolder", "mesh2motion");
      formData.append("overwrite", "true");
      const resp = await api.fetchApi("/upload/image", { method: "POST", body: formData });
      if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
      const result = await resp.json();
      const node = this.currentNode;
      if (node && "constructor" in node) this.injectModelIntoNode(node, result);
      if (this.statusEl) this.statusEl.textContent = "Model saved ✓";
      this.close();
    } catch (err) {
      console.error("[Mesh2Motion] Failed to save model:", err);
      if (this.statusEl) this.statusEl.textContent = "Save failed — see console";
    } finally {
      this.saveInFlight = false;
      this.updateSaveButtonsEnabled(this.editorReady);
    }
  }
  injectModelIntoNode(node, result) {
    var _a, _b, _c;
    const widgetValue = result.subfolder ? `${result.subfolder}/${result.name} [input]` : `${result.name} [input]`;
    node.images = [{
      filename: result.name,
      subfolder: result.subfolder || "",
      type: "input"
    }];
    const modelWidget = (_a = node.widgets) == null ? void 0 : _a.find(
      (w) => w.name === "model_file" || w.name === "mesh" || w.name === "3d_model" || w.name === "model"
    );
    if (modelWidget) {
      if (((_b = modelWidget.options) == null ? void 0 : _b.values) && !modelWidget.options.values.includes(widgetValue)) {
        modelWidget.options.values.push(widgetValue);
      }
      modelWidget.value = widgetValue;
      (_c = modelWidget.callback) == null ? void 0 : _c.call(modelWidget, widgetValue);
    }
    app.graph.setDirtyCanvas(true, true);
  }
  async handleImageExport(imageDataUrl, filename, width, height) {
    try {
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();
      const finalFilename = filename || `mesh2motion-render-${Date.now()}.png`;
      const formData = new FormData();
      formData.append("image", blob, finalFilename);
      formData.append("type", "input");
      formData.append("subfolder", "mesh2motion");
      formData.append("overwrite", "true");
      const resp = await api.fetchApi("/upload/image", { method: "POST", body: formData });
      if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
      const result = await resp.json();
      const imageNode = this.resolveImageNode();
      if (imageNode) {
        await this.injectImageIntoNode(imageNode, result, imageDataUrl);
        if (this.statusEl) this.statusEl.textContent = `Image saved → LoadImage (${width}×${height})`;
      } else {
        if (this.statusEl) this.statusEl.textContent = `Image saved (no LoadImage node) — ${result.name}`;
      }
    } catch (err) {
      console.error("[Mesh2Motion] Failed to export image:", err);
      if (this.statusEl) this.statusEl.textContent = "Image export failed — see console";
    } finally {
      this.saveImageInFlight = false;
      this.updateSaveButtonsEnabled(this.editorReady);
    }
  }
  resolveImageNode() {
    var _a, _b, _c, _d;
    if (this.currentNode) {
      const n = this.currentNode;
      if (((_a = n.constructor) == null ? void 0 : _a.comfyClass) && IMAGE_NODES.includes(n.constructor.comfyClass)) {
        return this.currentNode;
      }
    }
    const graph = app.graph;
    if (!graph) return null;
    const canvas = (_b = graph.list_of_graphcanvas) == null ? void 0 : _b[0];
    const selected = canvas == null ? void 0 : canvas.selected_nodes;
    if (selected) {
      for (const id of Object.keys(selected)) {
        const node = graph.getNodeById(Number(id));
        const cls = (_c = node == null ? void 0 : node.constructor) == null ? void 0 : _c.comfyClass;
        if (cls && IMAGE_NODES.includes(cls)) return node;
      }
    }
    for (const node of graph._nodes || []) {
      const cls = (_d = node == null ? void 0 : node.constructor) == null ? void 0 : _d.comfyClass;
      if (cls && IMAGE_NODES.includes(cls)) return node;
    }
    return null;
  }
  async injectImageIntoNode(imageNode, result, imageDataUrl) {
    var _a, _b, _c;
    const widgetValue = result.subfolder ? `${result.subfolder}/${result.name}` : result.name;
    imageNode.images = [{
      filename: result.name,
      subfolder: result.subfolder || "",
      type: "input"
    }];
    const imageWidget = (_a = imageNode.widgets) == null ? void 0 : _a.find((w) => w.name === "image");
    if (imageWidget) {
      if (((_b = imageWidget.options) == null ? void 0 : _b.values) && !imageWidget.options.values.includes(widgetValue)) {
        imageWidget.options.values.push(widgetValue);
      }
      imageWidget.value = widgetValue;
      if (imageNode.widgets_values && imageNode.widgets) {
        const idx = imageNode.widgets.findIndex((w) => w.name === "image");
        if (idx >= 0) imageNode.widgets_values[idx] = widgetValue;
      }
      if (imageNode.properties) imageNode.properties["image"] = widgetValue;
      (_c = imageWidget.callback) == null ? void 0 : _c.call(imageWidget, widgetValue);
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageDataUrl;
    await new Promise((resolve, reject) => {
      img.onload = () => resolve(null);
      img.onerror = reject;
    }).catch(() => {
    });
    imageNode.imgs = [img];
    app.graph.setDirtyCanvas(true, true);
  }
}
const dialog = new Mesh2MotionDialog();
function openMesh2MotionExplore(node = null) {
  dialog.openExplore(node);
}
function openMesh2MotionCreate(node = null) {
  dialog.openCreate(node);
}
const { ComfyButton } = window.comfyAPI.button;
app.registerExtension({
  name: "ComfyUI.Mesh2Motion",
  setup() {
    var _a;
    (_a = app.menu) == null ? void 0 : _a.settingsGroup.append(
      new ComfyButton({
        icon: "human-male",
        tooltip: "Mesh2Motion — rig, pose, and render characters",
        content: "Mesh2Motion",
        action: () => openMesh2MotionExplore(null)
      })
    );
  },
  nodeCreated(node) {
    var _a;
    if (((_a = node.constructor) == null ? void 0 : _a.comfyClass) === "Mesh2MotionExplore") {
      createMesh2MotionExploreWidget(node);
    }
  },
  // Right-click menu entries on compatible nodes:
  //   Image nodes (LoadImage)                    → Explore window
  //   3D model nodes (Load3D / Preview3D / ...)  → Create window, pre-loading
  //                                                the node's current model
  getNodeMenuItems(node) {
    var _a;
    const typedNode = node;
    const nodeClass = (_a = typedNode == null ? void 0 : typedNode.constructor) == null ? void 0 : _a.comfyClass;
    if (nodeClass && IMAGE_NODES.includes(nodeClass)) {
      return [
        null,
        {
          content: "Open in Mesh2Motion",
          callback: () => {
            openMesh2MotionExplore(node);
          }
        }
      ];
    }
    if (nodeClass && MODEL_3D_NODES.includes(nodeClass)) {
      return [
        null,
        {
          content: "Open in Mesh2Motion",
          callback: () => {
            openMesh2MotionCreate(node);
          }
        }
      ];
    }
    if (isModel3DNode(node)) {
      return [
        null,
        {
          content: "Open in Mesh2Motion",
          callback: () => {
            openMesh2MotionCreate(node);
          }
        }
      ];
    }
    return [];
  }
});
export {
  openMesh2MotionCreate,
  openMesh2MotionExplore
};
//# sourceMappingURL=main.js.map
