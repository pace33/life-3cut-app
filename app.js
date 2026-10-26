const REQUIRED_SHOTS = 3;
const DEFAULT_STICKER_SIZE = 54;
const DEFAULT_TITLE = "이은 e페스티벌 방명록";
const FESTIVAL_HEADER_SRC = "./e-festival-header-transparent.png";
const SCHOOL_LOGO_SRC = "./eeun-school-logo-transparent.png";
const OLD_DEFAULT_TITLES = new Set(["3컷 사진 놀이", "이은학교"]);
const TITLE_STORAGE_KEY = `life-3cut-title:${window.location.pathname.replace(/\/index\.html$/, "/")}`;
const REMOTE_COLLECTION = "photos_7";
const REMOTE_CAMERA_URL = "https://aiedue.ddns.net/pic/7/remote-camera.html";
const REMOTE_API_BASE =
  window.location.hostname === "aiedue.ddns.net"
    ? "/pic-db/db-api"
    : "https://aiedue.ddns.net/pic-db/db-api";
const REMOTE_SESSION_MS = 30 * 60 * 1000;
const REMOTE_POLL_MS = 1000;
const PHOTO_DB_NAME = "eeun-photo-gallery";
const PHOTO_DB_VERSION = 1;
const PHOTO_STORE_NAME = "photos";

const PHOTO_EFFECTS = {
  bright: {
    label: "밝게",
    css: "effect-bright",
    canvas: "brightness(1.28) contrast(1.1) saturate(1.16)",
  },
  vivid: {
    label: "선명",
    css: "effect-vivid",
    canvas: "contrast(1.32) saturate(1.55) brightness(1.04)",
  },
  warm: {
    label: "따뜻",
    css: "effect-warm",
    canvas: "sepia(0.34) saturate(1.36) brightness(1.1) contrast(1.06)",
  },
  mono: {
    label: "흑백",
    css: "effect-mono",
    canvas: "grayscale(1) contrast(1.28) brightness(1.08)",
  },
};

const FRAME_STYLES = {
  clean: {
    label: "깔끔",
    background: ["#f7fbff", "#eef8f4", "#fff7e6"],
    logo: "#167d73",
    title: "#1f2937",
    subtitle: "#627083",
    card: "#ffffff",
    border: ["#167d73", "#4387e8", "#f06d68"],
    radius: 22,
    photoRadius: 18,
  },
  pastel: {
    label: "파스텔",
    background: ["#fff8fb", "#f4fbff", "#fff8df"],
    logo: "#d66f91",
    title: "#2b3342",
    subtitle: "#7a6272",
    card: "#fffafd",
    border: ["#ff9ab4", "#ffd36b", "#76bf73"],
    radius: 28,
    photoRadius: 22,
  },
  film: {
    label: "필름",
    background: ["#2a3038", "#1f2937", "#151a21"],
    logo: "#ffd36b",
    title: "#f8fafc",
    subtitle: "#d4dde8",
    card: "#0f1720",
    border: ["#f8fafc", "#d4dde8", "#f8fafc"],
    radius: 10,
    photoRadius: 6,
  },
};

const state = {
  stream: null,
  facingMode: "user",
  photos: [],
  photoEffects: Array(REQUIRED_SHOTS).fill(""),
  frameStyle: "clean",
  title: DEFAULT_TITLE,
  selectedCut: 0,
  selectedStickerId: null,
  stickers: [],
  isCounting: false,
  isStartingCamera: false,
  nextStickerId: 1,
  remote: {
    sessionId: "",
    pin: "",
    expiresAt: "",
    connected: false,
    pollTimer: 0,
    pollBusy: false,
    pendingCommandId: "",
    pendingResolve: null,
    pendingReject: null,
    handledEventIds: new Set(),
  },
};

const els = {
  titleInput: document.querySelector("#titleInput"),
  cameraScreen: document.querySelector("#cameraScreen"),
  editorScreen: document.querySelector("#editorScreen"),
  progressText: document.querySelector("#progressText"),
  cameraStatus: document.querySelector("#cameraStatus"),
  editorStatus: document.querySelector("#editorStatus"),
  video: document.querySelector("#cameraPreview"),
  placeholder: document.querySelector("#previewPlaceholder"),
  previewMessage: document.querySelector("#previewMessage"),
  countdown: document.querySelector("#countdown"),
  startCameraButton: document.querySelector("#startCameraButton"),
  switchCameraButton: document.querySelector("#switchCameraButton"),
  switchCameraLabel: document.querySelector("#switchCameraLabel"),
  takePhotoButton: document.querySelector("#takePhotoButton"),
  takePhotoLabel: document.querySelector("#takePhotoLabel"),
  remoteCameraButton: document.querySelector("#remoteCameraButton"),
  remoteCameraLabel: document.querySelector("#remoteCameraLabel"),
  cameraFallbackButton: document.querySelector("#cameraFallbackButton"),
  cameraFileInput: document.querySelector("#cameraFileInput"),
  thumbGrid: document.querySelector("#thumbGrid"),
  captureNote: document.querySelector("#captureNote"),
  photoStrip: document.querySelector("#photoStrip"),
  cutButtons: document.querySelector("#cutButtons"),
  effectButtons: document.querySelector("#effectButtons"),
  frameButtons: document.querySelector("#frameButtons"),
  stickerPalette: document.querySelector("#stickerPalette"),
  smallerStickerButton: document.querySelector("#smallerStickerButton"),
  biggerStickerButton: document.querySelector("#biggerStickerButton"),
  deleteStickerButton: document.querySelector("#deleteStickerButton"),
  saveButton: document.querySelector("#saveButton"),
  saveButtonLabel: document.querySelector("#saveButtonLabel"),
  retakeButton: document.querySelector("#retakeButton"),
  galleryButton: document.querySelector("#galleryButton"),
  galleryCount: document.querySelector("#galleryCount"),
  galleryOverlay: document.querySelector("#galleryOverlay"),
  galleryCloseButton: document.querySelector("#galleryCloseButton"),
  galleryStatus: document.querySelector("#galleryStatus"),
  galleryGrid: document.querySelector("#galleryGrid"),
  galleryEmpty: document.querySelector("#galleryEmpty"),
  photoViewerOverlay: document.querySelector("#photoViewerOverlay"),
  photoViewerCloseButton: document.querySelector("#photoViewerCloseButton"),
  photoViewerImage: document.querySelector("#photoViewerImage"),
  photoViewerTitle: document.querySelector("#photoViewerTitle"),
  photoViewerDate: document.querySelector("#photoViewerDate"),
  pairingOverlay: document.querySelector("#pairingOverlay"),
  pairingCloseButton: document.querySelector("#pairingCloseButton"),
  pairingQrImage: document.querySelector("#pairingQrImage"),
  pairingCode: document.querySelector("#pairingCode"),
  pairingStatus: document.querySelector("#pairingStatus"),
  pairingStatusText: document.querySelector("#pairingStatusText"),
};

function setStatus(message) {
  els.cameraStatus.textContent = message;
}

function setProgress(message) {
  els.progressText.textContent = message;
}

function currentTitle() {
  return state.title.trim() || DEFAULT_TITLE;
}

function loadSavedTitle() {
  try {
    const savedTitle = localStorage.getItem(TITLE_STORAGE_KEY);
    if (savedTitle && !OLD_DEFAULT_TITLES.has(savedTitle.trim())) {
      els.titleInput.value = savedTitle;
    } else if (savedTitle) {
      localStorage.removeItem(TITLE_STORAGE_KEY);
    }
  } catch (error) {
    // Some browsers block storage in private modes; the app still works without it.
  }
}

function saveTitle() {
  try {
    if (state.title) {
      localStorage.setItem(TITLE_STORAGE_KEY, state.title);
    } else {
      localStorage.removeItem(TITLE_STORAGE_KEY);
    }
  } catch (error) {
    // Ignore storage failures so typing and PNG saving keep working.
  }
}

function syncTitleFromInput() {
  state.title = els.titleInput.value.trim();
  saveTitle();
  document.title = currentTitle();
  fitTitleInput();
}

function fitTitleInput() {
  const input = els.titleInput;
  if (!input) return;

  const text = input.value.trim() || DEFAULT_TITLE;
  const availableWidth = Math.max(120, input.clientWidth - 18);
  const smallScreen = window.matchMedia("(max-width: 620px)").matches;
  const maxSize = smallScreen ? 24 : 32;
  const minSize = smallScreen ? 17 : 20;
  const canvas = fitTitleInput.canvas || document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  fitTitleInput.canvas = canvas;

  let size = maxSize;
  while (size > minSize) {
    ctx.font = `900 ${size}px "Segoe UI", "Noto Sans KR", sans-serif`;
    if (ctx.measureText(text).width <= availableWidth) break;
    size -= 1;
  }

  input.style.fontSize = `${size}px`;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randomId(bytes = 16) {
  const values = new Uint8Array(bytes);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < values.length; index += 1) {
      values[index] = Math.floor(Math.random() * 256);
    }
  }
  return [...values].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function randomPin() {
  const values = new Uint32Array(1);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(values);
    return String(100000 + (values[0] % 900000));
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

function encodeStoragePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function remoteStorageUrl(path) {
  return `${REMOTE_API_BASE}/storage/files/${encodeStoragePath(path)}`;
}

async function remoteApiJson(path, options = {}) {
  const response = await fetch(`${REMOTE_API_BASE}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      ...(options.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.json()).error || "";
    } catch (error) {
      detail = await response.text();
    }
    throw new Error(detail || `HTTP ${response.status}`);
  }

  return response.json();
}

function postRemoteEvent(kind, extra = {}) {
  return remoteApiJson(`/items/${REMOTE_COLLECTION}`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        kind,
        sessionId: state.remote.sessionId,
        pin: state.remote.pin,
        createdAt: new Date().toISOString(),
        expiresAt: state.remote.expiresAt,
        ...extra,
      },
    }),
  });
}

function setPairingStatus(message, connected = false) {
  els.pairingStatusText.textContent = message;
  els.pairingStatus.classList.toggle("connected", connected);
}

function setRemoteConnectedUi() {
  els.remoteCameraButton.classList.toggle("connected", state.remote.connected);
  els.remoteCameraLabel.textContent = state.remote.connected
    ? "휴대폰 카메라 연결됨"
    : "휴대폰 카메라 연결";
  els.takePhotoLabel.textContent = state.remote.connected ? "휴대폰으로 촬영" : "3초 뒤 촬영";

  if (!state.remote.connected) return;

  els.placeholder.classList.remove("hidden");
  els.previewMessage.textContent = "휴대폰 카메라가 연결됐어요";
  els.switchCameraButton.disabled = true;
  els.cameraFallbackButton.hidden = true;
  els.takePhotoButton.disabled = state.isCounting || state.photos.length >= REQUIRED_SHOTS;
  setStatus(`${state.photos.length + 1}번째 사진을 휴대폰으로 찍어요`);
  setProgress(`${state.photos.length}/3`);
}

function closePairingOverlay() {
  els.pairingOverlay.hidden = true;
  els.remoteCameraButton.focus();
}

async function createRemoteSession() {
  state.remote.sessionId = randomId(18);
  state.remote.pin = randomPin();
  state.remote.expiresAt = new Date(Date.now() + REMOTE_SESSION_MS).toISOString();
  state.remote.connected = false;
  state.remote.handledEventIds.clear();

  try {
    await postRemoteEvent("photoBoothSession", {
      pagePath: "/pic/7/",
    });
  } catch (error) {
    state.remote.sessionId = "";
    state.remote.pin = "";
    state.remote.expiresAt = "";
    throw error;
  }
}

function startRemotePolling() {
  window.clearInterval(state.remote.pollTimer);
  state.remote.pollTimer = window.setInterval(pollRemoteEvents, REMOTE_POLL_MS);
  pollRemoteEvents();
}

async function openRemotePairing() {
  stopCamera();
  els.placeholder.classList.remove("hidden");
  els.previewMessage.textContent = "휴대폰 연결을 기다리고 있어요";
  els.takePhotoButton.disabled = true;
  els.switchCameraButton.disabled = true;
  els.remoteCameraButton.disabled = true;
  els.pairingOverlay.hidden = false;
  setPairingStatus("연결 번호를 만들고 있어요");

  try {
    const sessionExpired =
      !state.remote.expiresAt || new Date(state.remote.expiresAt).getTime() <= Date.now();
    if (!state.remote.sessionId || sessionExpired) {
      await createRemoteSession();
    }

    const connectUrl = `${REMOTE_CAMERA_URL}?session=${encodeURIComponent(
      state.remote.sessionId,
    )}&code=${encodeURIComponent(state.remote.pin)}`;
    els.pairingCode.textContent = state.remote.pin;
    const qr = window.qrcode(0, "M");
    qr.addData(connectUrl);
    qr.make();
    els.pairingQrImage.src = qr.createDataURL(7, 16);
    setPairingStatus(
      state.remote.connected ? "휴대폰 카메라가 연결됐어요" : "휴대폰 연결을 기다리고 있어요",
      state.remote.connected,
    );
    startRemotePolling();
  } catch (error) {
    console.error(error);
    setPairingStatus("연결 서버를 열지 못했어요. 잠시 뒤 다시 눌러 주세요.");
  } finally {
    els.remoteCameraButton.disabled = false;
  }
}

function resolvePendingRemotePhoto(photo) {
  const resolve = state.remote.pendingResolve;
  state.remote.pendingResolve = null;
  state.remote.pendingReject = null;
  state.remote.pendingCommandId = "";
  resolve?.(photo);
}

function rejectPendingRemotePhoto(error) {
  const reject = state.remote.pendingReject;
  state.remote.pendingResolve = null;
  state.remote.pendingReject = null;
  state.remote.pendingCommandId = "";
  reject?.(error);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("사진을 읽지 못했어요."));
    reader.readAsDataURL(blob);
  });
}

function blankJpegBlob() {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 1, 1);
    canvas.toBlob(resolve, "image/jpeg", 0.5);
  });
}

async function scrubRemotePhoto(storagePath) {
  try {
    const blank = await blankJpegBlob();
    if (!blank) return;
    await fetch(remoteStorageUrl(storagePath), {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: blank,
    });
  } catch (error) {
    console.warn("임시 사진 정리 실패", error);
  }
}

async function receiveRemotePhoto(event) {
  if (!event.storagePath || event.commandId !== state.remote.pendingCommandId) return;

  const response = await fetch(`${remoteStorageUrl(event.storagePath)}?v=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("휴대폰 사진을 받지 못했어요.");
  const photo = await blobToDataUrl(await response.blob());
  resolvePendingRemotePhoto(photo);
  scrubRemotePhoto(event.storagePath);
}

async function pollRemoteEvents() {
  if (!state.remote.sessionId || state.remote.pollBusy) return;
  state.remote.pollBusy = true;

  try {
    const result = await remoteApiJson(`/items/${REMOTE_COLLECTION}?limit=200&t=${Date.now()}`);
    const records = (result.items || []).filter((record) => {
      const event = record.data || {};
      return event.sessionId === state.remote.sessionId && event.pin === state.remote.pin;
    });

    for (const record of records.reverse()) {
      if (state.remote.handledEventIds.has(record.id)) continue;
      state.remote.handledEventIds.add(record.id);
      const event = record.data || {};

      if (event.kind === "photoBoothPhoneReady") {
        state.remote.connected = true;
        setPairingStatus("휴대폰 카메라가 연결됐어요", true);
        setRemoteConnectedUi();
        window.setTimeout(() => {
          if (!els.pairingOverlay.hidden && state.remote.connected) closePairingOverlay();
        }, 900);
      }

      if (
        event.kind === "photoBoothPhoto" &&
        event.commandId === state.remote.pendingCommandId
      ) {
        try {
          await receiveRemotePhoto(event);
        } catch (error) {
          state.remote.handledEventIds.delete(record.id);
          throw error;
        }
      }

      if (
        event.kind === "photoBoothError" &&
        event.commandId === state.remote.pendingCommandId
      ) {
        rejectPendingRemotePhoto(new Error(event.message || "휴대폰 촬영에 실패했어요."));
      }
    }
  } catch (error) {
    console.error(error);
    if (!els.pairingOverlay.hidden && !state.remote.connected) {
      setPairingStatus("연결 서버를 확인하고 있어요. 잠시 기다려 주세요.");
    }
  } finally {
    state.remote.pollBusy = false;
  }
}

async function stopRemoteConnection(notifyPhone = false) {
  window.clearInterval(state.remote.pollTimer);
  state.remote.pollTimer = 0;
  if (notifyPhone && state.remote.sessionId) {
    postRemoteEvent("photoBoothClosed").catch(() => {});
  }
  rejectPendingRemotePhoto(new Error("휴대폰 연결이 종료됐어요."));
  state.remote.sessionId = "";
  state.remote.pin = "";
  state.remote.expiresAt = "";
  state.remote.connected = false;
  setRemoteConnectedUi();
}

function waitForRemotePhoto(commandId) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      if (state.remote.pendingCommandId !== commandId) return;
      rejectPendingRemotePhoto(new Error("사진 전송 시간이 초과됐어요. 다시 찍어 주세요."));
    }, 30000);

    state.remote.pendingCommandId = commandId;
    state.remote.pendingResolve = (photo) => {
      window.clearTimeout(timeoutId);
      resolve(photo);
    };
    state.remote.pendingReject = (error) => {
      window.clearTimeout(timeoutId);
      reject(error);
    };
  });
}

async function showRemoteCountdown(captureAt) {
  els.countdown.classList.add("show");
  let lastText = "";

  while (Date.now() < captureAt) {
    const seconds = Math.ceil((captureAt - Date.now()) / 1000);
    const nextText = seconds > 3 ? "준비" : String(Math.max(1, seconds));
    if (nextText !== lastText) {
      els.countdown.textContent = nextText;
      setStatus(nextText === "준비" ? "휴대폰 촬영을 준비해요" : `${nextText}초 뒤 찍어요`);
      lastText = nextText;
    }
    await wait(100);
  }

  els.countdown.textContent = "찰칵!";
  await wait(450);
  els.countdown.classList.remove("show");
  els.countdown.textContent = "";
}

async function runRemoteCountdownAndCapture() {
  if (!state.remote.connected || state.isCounting || state.photos.length >= REQUIRED_SHOTS) return;

  state.isCounting = true;
  els.takePhotoButton.disabled = true;
  els.startCameraButton.disabled = true;
  els.remoteCameraButton.disabled = true;
  const commandId = randomId(12);
  const captureAt = Date.now() + 4500;
  let photoError = null;
  const photoPromise = waitForRemotePhoto(commandId).catch((error) => {
    photoError = error;
    return null;
  });

  try {
    await postRemoteEvent("photoBoothCapture", {
      commandId,
      shotIndex: state.photos.length,
      captureAt,
    });
    await showRemoteCountdown(captureAt);
    setStatus("휴대폰 사진을 받고 있어요");
    const photo = await photoPromise;
    if (photoError) throw photoError;
    if (!photo) throw new Error("휴대폰 사진을 받지 못했어요.");
    state.photos.push(photo);
    renderThumbs();

    if (state.photos.length >= REQUIRED_SHOTS) {
      setStatus("3장을 모두 찍었어요");
      setProgress("꾸미기");
      await wait(400);
      openEditor();
      return;
    }

    setStatus(`${state.photos.length + 1}번째 사진을 휴대폰으로 찍어요`);
    setProgress(`${state.photos.length}/3`);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "휴대폰 촬영에 실패했어요. 다시 눌러 주세요.");
  } finally {
    state.isCounting = false;
    els.startCameraButton.disabled = false;
    els.remoteCameraButton.disabled = false;
    els.takePhotoButton.disabled = !state.remote.connected || state.photos.length >= REQUIRED_SHOTS;
  }
}

function cameraUseIsAllowedHere() {
  const policy = document.permissionsPolicy || document.featurePolicy;
  return !policy || typeof policy.allowsFeature !== "function" || policy.allowsFeature("camera");
}

function cameraConstraints(facingMode, preferExact) {
  const preferredFacingMode = preferExact ? { exact: facingMode } : { ideal: facingMode };
  return [
    {
      audio: false,
      video: {
        facingMode: preferredFacingMode,
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
    },
    { audio: false, video: { facingMode: { ideal: facingMode } } },
    { audio: false, video: true },
  ];
}

async function requestCameraStream(facingMode, preferExact) {
  let lastError;

  for (const constraints of cameraConstraints(facingMode, preferExact)) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
      if (["NotAllowedError", "SecurityError", "NotReadableError"].includes(error.name)) {
        break;
      }
    }
  }

  throw lastError || new Error("Camera unavailable");
}

function waitForVideoReady(video) {
  if (video.readyState >= 1 && video.videoWidth > 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => finish(new Error("Camera preview timed out")), 10000);

    function finish(error) {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
      error ? reject(error) : resolve();
    }

    function onReady() {
      if (video.videoWidth > 0) finish();
    }

    function onError() {
      finish(new Error("Camera preview failed"));
    }

    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);
  });
}

function cameraErrorMessage(error) {
  if (!window.isSecureContext) {
    return "카메라는 안전한 주소(https://)에서 사용할 수 있어요.";
  }

  if (!cameraUseIsAllowedHere()) {
    return "이 화면에서는 카메라가 막혀 있어요. Chrome에서 주소를 직접 열어 주세요.";
  }

  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "카메라 권한을 허용한 뒤 다시 눌러 주세요.";
    case "NotReadableError":
    case "AbortError":
      return "다른 앱이 카메라를 사용 중이에요. 카메라 앱을 닫고 다시 눌러 주세요.";
    case "NotFoundError":
      return "사용할 수 있는 카메라를 찾지 못했어요.";
    default:
      return "카메라를 열지 못했어요. Chrome에서 열거나 아래 버튼을 이용해 주세요.";
  }
}

function updateCameraDirection() {
  const usesRearCamera = state.facingMode === "environment";
  els.video.classList.toggle("mirrored", !usesRearCamera);
  els.switchCameraLabel.textContent = usesRearCamera ? "전면 카메라" : "후면 카메라";
  els.switchCameraButton.setAttribute(
    "aria-label",
    usesRearCamera ? "전면 카메라로 전환" : "후면 카메라로 전환",
  );
  els.cameraFileInput.setAttribute("capture", usesRearCamera ? "environment" : "user");
}

function showCameraFallback() {
  els.cameraFallbackButton.hidden = false;
}

function handleCameraEnded(stream) {
  if (state.stream !== stream) return;
  state.stream = null;
  els.video.srcObject = null;
  els.placeholder.classList.remove("hidden");
  els.takePhotoButton.disabled = true;
  els.switchCameraButton.disabled = true;
  showCameraFallback();
  setStatus("카메라 연결이 멈췄어요. 다시 시작해 주세요.");
}

async function activateCamera(preferExact = false) {
  if (state.isStartingCamera) return false;

  if (!window.isSecureContext || !cameraUseIsAllowedHere()) {
    setStatus(cameraErrorMessage());
    showCameraFallback();
    return false;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("이 브라우저에서는 실시간 카메라를 열 수 없어요. 아래 버튼을 이용해 주세요.");
    showCameraFallback();
    return false;
  }

  state.isStartingCamera = true;
  stopCamera();
  setStatus("카메라를 준비하고 있어요");
  setProgress("준비");
  els.startCameraButton.disabled = true;
  els.switchCameraButton.disabled = true;
  els.takePhotoButton.disabled = true;

  try {
    const stream = await requestCameraStream(state.facingMode, preferExact);
    state.stream = stream;
    els.video.autoplay = true;
    els.video.muted = true;
    els.video.playsInline = true;
    els.video.setAttribute("playsinline", "");
    els.video.setAttribute("webkit-playsinline", "");
    els.video.srcObject = stream;
    await els.video.play();
    await waitForVideoReady(els.video);

    const videoTrack = stream.getVideoTracks()[0];
    const actualFacingMode = videoTrack?.getSettings?.().facingMode;
    if (["user", "environment"].includes(actualFacingMode)) {
      state.facingMode = actualFacingMode;
    }
    updateCameraDirection();

    videoTrack?.addEventListener("ended", () => handleCameraEnded(stream), { once: true });
    els.placeholder.classList.add("hidden");
    els.cameraFallbackButton.hidden = true;
    els.takePhotoButton.disabled = false;
    els.switchCameraButton.disabled = false;
    setStatus(`${state.photos.length + 1}번째 사진을 찍어요`);
    setProgress(`${state.photos.length}/3`);
    return true;
  } catch (error) {
    stopCamera();
    els.placeholder.classList.remove("hidden");
    els.takePhotoButton.disabled = true;
    els.switchCameraButton.disabled = true;
    showCameraFallback();
    setStatus(cameraErrorMessage(error));
    return false;
  } finally {
    state.isStartingCamera = false;
    els.startCameraButton.disabled = false;
  }
}

async function startCamera() {
  if (state.remote.sessionId) {
    await stopRemoteConnection(true);
  }
  els.previewMessage.textContent = "큰 버튼을 눌러 시작해요";
  return activateCamera(false);
}

async function switchCamera() {
  if (state.isCounting || state.isStartingCamera) return;
  state.facingMode = state.facingMode === "user" ? "environment" : "user";
  updateCameraDirection();
  await activateCamera(true);
}

function stopCamera() {
  const stream = state.stream;
  state.stream = null;
  els.video.pause();
  els.video.srcObject = null;
  stream?.getTracks().forEach((track) => track.stop());
}

async function runCountdownAndCapture() {
  if (state.remote.connected) {
    await runRemoteCountdownAndCapture();
    return;
  }

  if (!state.stream || state.isCounting || state.photos.length >= REQUIRED_SHOTS) return;

  state.isCounting = true;
  els.takePhotoButton.disabled = true;
  els.startCameraButton.disabled = true;
  els.switchCameraButton.disabled = true;
  els.countdown.classList.add("show");

  for (const number of [3, 2, 1]) {
    els.countdown.textContent = String(number);
    setStatus(`${number}초 뒤 찍어요`);
    await wait(900);
  }

  if (!state.stream || els.video.readyState < 2 || els.video.videoWidth === 0) {
    els.countdown.classList.remove("show");
    els.countdown.textContent = "";
    state.isCounting = false;
    els.startCameraButton.disabled = false;
    els.switchCameraButton.disabled = !state.stream;
    els.takePhotoButton.disabled = true;
    showCameraFallback();
    setStatus("카메라 연결을 다시 확인해 주세요.");
    return;
  }

  els.countdown.textContent = "찰칵!";
  const photo = capturePhoto();
  state.photos.push(photo);
  renderThumbs();
  await wait(450);

  els.countdown.classList.remove("show");
  els.countdown.textContent = "";
  state.isCounting = false;
  els.startCameraButton.disabled = false;
  els.switchCameraButton.disabled = !state.stream;

  if (state.photos.length >= REQUIRED_SHOTS) {
    setStatus("3장을 모두 찍었어요");
    setProgress("꾸미기");
    await wait(450);
    openEditor();
    return;
  }

  els.takePhotoButton.disabled = false;
  setStatus(`${state.photos.length + 1}번째 사진을 찍어요`);
  setProgress(`${state.photos.length}/3`);
}

function capturePhoto() {
  const sourceWidth = els.video.videoWidth || 1280;
  const sourceHeight = els.video.videoHeight || 960;
  const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (state.facingMode !== "environment") {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(els.video, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.92);
}

async function photoFromFile(file) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.92);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function importCameraPhoto(event) {
  const [file] = event.target.files || [];
  event.target.value = "";
  if (!file || state.photos.length >= REQUIRED_SHOTS) return;

  els.cameraFallbackButton.disabled = true;
  setStatus("사진을 불러오고 있어요");

  try {
    state.photos.push(await photoFromFile(file));
    renderThumbs();

    if (state.photos.length >= REQUIRED_SHOTS) {
      setStatus("3장을 모두 찍었어요");
      setProgress("꾸미기");
      await wait(300);
      openEditor();
      return;
    }

    setStatus(`${state.photos.length + 1}번째 사진을 찍어요`);
    setProgress(`${state.photos.length}/3`);
  } catch (error) {
    setStatus("사진을 불러오지 못했어요. 다시 촬영해 주세요.");
  } finally {
    els.cameraFallbackButton.disabled = false;
  }
}

function renderThumbs() {
  const slots = [...els.thumbGrid.querySelectorAll(".thumb-slot")];
  slots.forEach((slot, index) => {
    slot.textContent = "";
    const photo = state.photos[index];
    if (photo) {
      const image = document.createElement("img");
      image.src = photo;
      image.alt = `${index + 1}번째로 찍은 사진`;
      slot.append(image);
    } else {
      slot.textContent = String(index + 1);
    }
  });

  els.captureNote.textContent =
    state.photos.length === REQUIRED_SHOTS
      ? "이제 꾸밀 수 있어요."
      : `앞으로 ${REQUIRED_SHOTS - state.photos.length}장을 더 찍어요.`;
}

function openEditor() {
  stopCamera();
  els.cameraScreen.hidden = true;
  els.cameraScreen.classList.remove("screen-active");
  els.editorScreen.hidden = false;
  els.editorScreen.classList.add("screen-active");
  state.selectedCut = 0;
  state.selectedStickerId = null;
  renderEditor();
}

function openCamera() {
  els.editorScreen.hidden = true;
  els.editorScreen.classList.remove("screen-active");
  els.cameraScreen.hidden = false;
  els.cameraScreen.classList.add("screen-active");
}

function renderEditor() {
  const stripSlots = [...els.photoStrip.querySelectorAll(".strip-slot")];
  els.photoStrip.classList.remove("frame-clean", "frame-pastel", "frame-film");
  els.photoStrip.classList.add(`frame-${state.frameStyle}`);

  stripSlots.forEach((slot, cut) => {
    slot.classList.toggle("selected", cut === state.selectedCut);
    const image = slot.querySelector("img");
    image.src = state.photos[cut];
    image.className = `photo-img ${PHOTO_EFFECTS[state.photoEffects[cut]]?.css || ""}`.trim();

    const layer = slot.querySelector(".sticker-layer");
    layer.textContent = "";
    state.stickers
      .filter((sticker) => sticker.cut === cut)
      .forEach((sticker) => layer.append(createStickerElement(sticker)));
  });

  [...els.cutButtons.querySelectorAll("[data-cut-button]")].forEach((button) => {
    const cut = Number(button.dataset.cutButton);
    button.classList.toggle("selected", cut === state.selectedCut);
    button.setAttribute("aria-pressed", String(cut === state.selectedCut));
  });

  renderEffectButtons();
  renderFrameButtons();

  const effectLabel = PHOTO_EFFECTS[state.photoEffects[state.selectedCut]]?.label || "보정 없음";
  const frameLabel = FRAME_STYLES[state.frameStyle]?.label || "깔끔";
  els.editorStatus.textContent = `${state.selectedCut + 1}번 사진 · ${effectLabel} · ${frameLabel} 사진틀`;
}

function renderEffectButtons() {
  const selectedEffect = state.photoEffects[state.selectedCut];

  [...els.effectButtons.querySelectorAll("[data-effect]")].forEach((button) => {
    const isSelected = button.dataset.effect === selectedEffect;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function renderFrameButtons() {
  [...els.frameButtons.querySelectorAll("[data-frame]")].forEach((button) => {
    const isSelected = button.dataset.frame === state.frameStyle;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function setPhotoEffect(effect) {
  state.photoEffects[state.selectedCut] =
    state.photoEffects[state.selectedCut] === effect ? "" : effect;
  renderEditor();
}

function selectFrame(frameStyle) {
  if (!FRAME_STYLES[frameStyle]) return;
  state.frameStyle = frameStyle;
  renderEditor();
}

function createStickerElement(sticker) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sticker";
  button.textContent = sticker.emoji;
  button.dataset.stickerId = String(sticker.id);
  button.style.left = `${sticker.x}%`;
  button.style.top = `${sticker.y}%`;
  button.style.fontSize = `${sticker.size}px`;
  button.setAttribute("aria-label", `${sticker.emoji} 스티커${sticker.locked ? ", 고정됨" : ""}`);
  button.title = sticker.locked ? "고정됨" : "다시 누르면 고정";
  button.classList.toggle("selected", sticker.id === state.selectedStickerId);
  button.classList.toggle("locked", sticker.locked);

  button.addEventListener("pointerdown", startStickerDrag);
  button.addEventListener("focus", () => selectSticker(sticker.id));
  button.addEventListener("keydown", handleStickerKeyboard);

  return button;
}

function selectCut(cut) {
  state.selectedCut = cut;
  state.selectedStickerId = null;
  renderEditor();
}

function selectSticker(stickerId) {
  state.selectedStickerId = stickerId;
  document
    .querySelectorAll(".sticker")
    .forEach((sticker) =>
      sticker.classList.toggle("selected", Number(sticker.dataset.stickerId) === stickerId),
    );
}

function addSticker(emoji) {
  const countOnCut = state.stickers.filter((sticker) => sticker.cut === state.selectedCut).length;
  const offset = (countOnCut % 4) * 8;
  const sticker = {
    id: state.nextStickerId,
    cut: state.selectedCut,
    emoji,
    x: clamp(50 + offset - 12, 12, 88),
    y: clamp(50 + offset - 12, 12, 88),
    size: DEFAULT_STICKER_SIZE,
    locked: false,
  };

  state.nextStickerId += 1;
  state.selectedStickerId = sticker.id;
  state.stickers.push(sticker);
  renderEditor();

  const stickerNode = document.querySelector(`[data-sticker-id="${sticker.id}"]`);
  stickerNode?.focus();
}

function startStickerDrag(event) {
  if (event.button !== 0 && event.pointerType === "mouse") return;
  event.preventDefault();

  const target = event.currentTarget;
  const stickerId = Number(event.currentTarget.dataset.stickerId);
  const sticker = state.stickers.find((item) => item.id === stickerId);
  if (!sticker) return;

  const wasSelected = state.selectedStickerId === stickerId;
  const startX = event.clientX;
  const startY = event.clientY;
  let didMove = false;

  selectSticker(stickerId);
  target.setPointerCapture(event.pointerId);

  const move = (moveEvent) => {
    const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
    if (distance < 5 || sticker.locked) return;
    didMove = true;
    moveStickerToPointer(stickerId, moveEvent);
  };

  const finish = () => {
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", finish);
    target.removeEventListener("pointercancel", finish);

    if (!didMove) {
      toggleStickerLock(stickerId, wasSelected);
      return;
    }

    els.editorStatus.textContent = "스티커 위치를 옮겼어요";
  };

  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", finish);
  target.addEventListener("pointercancel", finish);
}

function toggleStickerLock(stickerId, wasSelected = true) {
  const sticker = state.stickers.find((item) => item.id === stickerId);
  if (!sticker) return;

  if (sticker.locked) {
    sticker.locked = false;
    state.selectedStickerId = sticker.id;
    renderEditor();
    els.editorStatus.textContent = "스티커 고정을 풀었어요";
    return;
  }

  if (wasSelected) {
    sticker.locked = true;
    state.selectedStickerId = null;
    renderEditor();
    els.editorStatus.textContent = "스티커를 고정했어요";
    return;
  }

  state.selectedStickerId = sticker.id;
  renderEditor();
}

function moveStickerToPointer(stickerId, event) {
  const sticker = state.stickers.find((item) => item.id === stickerId);
  if (!sticker || sticker.locked) return;

  const slot = event.currentTarget.closest(".strip-slot");
  const rect = slot.getBoundingClientRect();
  sticker.x = clamp(((event.clientX - rect.left) / rect.width) * 100, 5, 95);
  sticker.y = clamp(((event.clientY - rect.top) / rect.height) * 100, 5, 95);

  event.currentTarget.style.left = `${sticker.x}%`;
  event.currentTarget.style.top = `${sticker.y}%`;
}

function handleStickerKeyboard(event) {
  const stickerId = Number(event.currentTarget.dataset.stickerId);
  const sticker = state.stickers.find((item) => item.id === stickerId);
  if (!sticker) return;

  const step = event.shiftKey ? 5 : 2;
  const keyMoves = {
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
  };

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggleStickerLock(stickerId, true);
    return;
  }

  if (keyMoves[event.key]) {
    event.preventDefault();
    if (sticker.locked) {
      els.editorStatus.textContent = "고정된 스티커예요";
      return;
    }

    const [dx, dy] = keyMoves[event.key];
    sticker.x = clamp(sticker.x + dx, 5, 95);
    sticker.y = clamp(sticker.y + dy, 5, 95);
    event.currentTarget.style.left = `${sticker.x}%`;
    event.currentTarget.style.top = `${sticker.y}%`;
  }

  if (event.key === "Backspace" || event.key === "Delete") {
    event.preventDefault();
    deleteSelectedSticker();
  }
}

function resizeSelectedSticker(delta) {
  const sticker = state.stickers.find((item) => item.id === state.selectedStickerId);
  if (!sticker) return;

  sticker.size = clamp(sticker.size + delta, 34, 88);
  const stickerNode = document.querySelector(`[data-sticker-id="${sticker.id}"]`);
  if (stickerNode) {
    stickerNode.style.fontSize = `${sticker.size}px`;
    stickerNode.focus();
  }
}

function deleteSelectedSticker() {
  if (!state.selectedStickerId) return;
  state.stickers = state.stickers.filter((sticker) => sticker.id !== state.selectedStickerId);
  state.selectedStickerId = null;
  renderEditor();
}

function resetAll() {
  stopCamera();
  state.photos = [];
  state.photoEffects = Array(REQUIRED_SHOTS).fill("");
  state.stickers = [];
  state.selectedCut = 0;
  state.selectedStickerId = null;
  state.isCounting = false;
  state.nextStickerId = 1;
  renderThumbs();
  openCamera();
  els.placeholder.classList.remove("hidden");
  els.takePhotoButton.disabled = !state.remote.connected;
  setStatus(state.remote.connected ? "1번째 사진을 휴대폰으로 찍어요" : "카메라를 켜 주세요");
  setProgress("준비");
  if (state.remote.connected) {
    setRemoteConnectedUi();
  } else {
    startCamera();
  }
}

async function createCompositePng() {
  const canvas = document.createElement("canvas");
  const width = 900;
  const margin = 70;
  const gap = 28;
  const photoWidth = width - margin * 2;
  const photoHeight = 520;
  const titleHeight = 275;
  const footerHeight = 120;
  const height = titleHeight + footerHeight + photoHeight * REQUIRED_SHOTS + gap * 2;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const frame = FRAME_STYLES[state.frameStyle] || FRAME_STYLES.clean;
  const [festivalHeader, schoolLogo, ...images] = await Promise.all([
    loadOptionalImage(FESTIVAL_HEADER_SRC),
    loadOptionalImage(SCHOOL_LOGO_SRC),
    ...state.photos.map(loadImage),
  ]);

  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, frame.background[0]);
  background.addColorStop(0.58, frame.background[1]);
  background.addColorStop(1, frame.background[2]);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  if (festivalHeader) {
    drawImageContain(ctx, festivalHeader, width / 2, 18, 430, 235, true);
  }

  images.forEach((image, cut) => {
    const x = margin;
    const y = titleHeight + cut * (photoHeight + gap);

    ctx.save();
    ctx.shadowColor = "rgba(31, 41, 55, 0.16)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 12;
    fillRoundedRect(ctx, x - 16, y - 16, photoWidth + 32, photoHeight + 32, frame.radius, frame.card);
    ctx.restore();

    ctx.save();
    roundedRectPath(ctx, x, y, photoWidth, photoHeight, frame.photoRadius);
    ctx.clip();
    ctx.filter = PHOTO_EFFECTS[state.photoEffects[cut]]?.canvas || "none";
    drawImageCover(ctx, image, x, y, photoWidth, photoHeight);
    ctx.filter = "none";
    ctx.restore();

    ctx.strokeStyle = frame.border[cut];
    ctx.lineWidth = 8;
    roundedRectPath(ctx, x - 4, y - 4, photoWidth + 8, photoHeight + 8, frame.radius);
    ctx.stroke();

    if (state.frameStyle === "film") {
      drawFilmPerforations(ctx, x, y, photoWidth, photoHeight);
    }

    state.stickers
      .filter((sticker) => sticker.cut === cut)
      .forEach((sticker) => {
        ctx.font = `${sticker.size * 1.25}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          sticker.emoji,
          x + (sticker.x / 100) * photoWidth,
          y + (sticker.y / 100) * photoHeight,
        );
      });
  });

  if (schoolLogo) {
    drawImageContain(ctx, schoolLogo, width / 2, height - footerHeight + 22, 210, 76, true);
  }

  const fileTitle = currentTitle().replace(/[\\/:*?"<>|]/g, "").trim() || "3cut-photo";
  const fileName = `${fileTitle}-${new Date().toISOString().slice(0, 10)}.png`;
  const pngDataUrl = canvas.toDataURL("image/png");
  return { dataUrl: pngDataUrl, fileName };
}

let photoDatabasePromise;

function openPhotoDatabase() {
  if (photoDatabasePromise) return photoDatabasePromise;

  photoDatabasePromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("이 브라우저에서는 사진 보관함을 사용할 수 없어요."));
      return;
    }

    const request = window.indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PHOTO_STORE_NAME)) {
        database.createObjectStore(PHOTO_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("사진 보관함을 열지 못했어요."));
    request.onblocked = () => reject(new Error("다른 화면에서 사진 보관함을 사용 중이에요."));
  });

  return photoDatabasePromise;
}

async function storePhoto(photo) {
  const database = await openPhotoDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PHOTO_STORE_NAME, "readwrite");
    transaction.objectStore(PHOTO_STORE_NAME).put(photo);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("사진을 저장하지 못했어요."));
    transaction.onabort = () => reject(transaction.error || new Error("사진 저장이 중단됐어요."));
  });
}

async function getStoredPhotos() {
  const database = await openPhotoDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PHOTO_STORE_NAME, "readonly");
    const request = transaction.objectStore(PHOTO_STORE_NAME).getAll();
    request.onsuccess = () => {
      const photos = request.result || [];
      photos.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      resolve(photos);
    };
    request.onerror = () => reject(request.error || new Error("저장한 사진을 불러오지 못했어요."));
  });
}

async function deleteStoredPhoto(photoId) {
  const database = await openPhotoDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PHOTO_STORE_NAME, "readwrite");
    transaction.objectStore(PHOTO_STORE_NAME).delete(photoId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("사진을 삭제하지 못했어요."));
  });
}

function formatPhotoDate(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "저장한 사진";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function updateGalleryCount(count) {
  els.galleryCount.textContent = String(count);
  els.galleryCount.setAttribute("aria-label", `저장된 사진 ${count}장`);
}

function createGalleryCard(photo) {
  const card = document.createElement("article");
  card.className = "gallery-card";
  card.dataset.photoId = photo.id;

  const previewButton = document.createElement("button");
  previewButton.type = "button";
  previewButton.className = "gallery-preview-button";
  previewButton.dataset.galleryView = photo.id;
  previewButton.setAttribute("aria-label", `${photo.title || "저장한 사진"} 크게 보기`);

  const image = document.createElement("img");
  image.src = photo.dataUrl;
  image.alt = photo.title || "저장한 3컷 사진";
  previewButton.append(image);

  const copy = document.createElement("div");
  copy.className = "gallery-card-copy";
  const title = document.createElement("h3");
  title.textContent = photo.title || "저장한 사진";
  const date = document.createElement("p");
  date.textContent = formatPhotoDate(photo.createdAt);
  copy.append(title, date);

  const actions = document.createElement("div");
  actions.className = "gallery-card-actions";
  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "button small secondary";
  viewButton.dataset.galleryView = photo.id;
  viewButton.textContent = "크게 보기";
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "button small danger";
  deleteButton.dataset.galleryDelete = photo.id;
  deleteButton.textContent = "삭제";
  actions.append(viewButton, deleteButton);

  card.append(previewButton, copy, actions);
  return card;
}

async function renderGallery() {
  els.galleryStatus.textContent = "저장된 사진을 불러오고 있어요.";
  els.galleryGrid.textContent = "";

  try {
    const photos = await getStoredPhotos();
    updateGalleryCount(photos.length);
    els.galleryEmpty.hidden = photos.length > 0;
    els.galleryGrid.hidden = photos.length === 0;
    photos.forEach((photo) => els.galleryGrid.append(createGalleryCard(photo)));
    els.galleryStatus.textContent = photos.length
      ? `저장된 사진이 ${photos.length}장 있어요.`
      : "저장된 사진이 없어요.";
    return photos;
  } catch (error) {
    console.error(error);
    els.galleryEmpty.hidden = false;
    els.galleryGrid.hidden = true;
    els.galleryStatus.textContent = error.message || "사진 보관함을 열지 못했어요.";
    return [];
  }
}

async function openGallery() {
  els.galleryOverlay.hidden = false;
  await renderGallery();
  els.galleryCloseButton.focus();
}

function closeGallery() {
  els.galleryOverlay.hidden = true;
  closePhotoViewer(false);
  els.galleryButton.focus();
}

async function openPhotoViewer(photoId) {
  const photos = await getStoredPhotos();
  const photo = photos.find((item) => item.id === photoId);
  if (!photo) return;
  els.photoViewerImage.src = photo.dataUrl;
  els.photoViewerTitle.textContent = photo.title || "저장한 사진";
  els.photoViewerDate.textContent = formatPhotoDate(photo.createdAt);
  els.photoViewerOverlay.hidden = false;
  els.photoViewerCloseButton.focus();
}

function closePhotoViewer(returnFocus = true) {
  els.photoViewerOverlay.hidden = true;
  els.photoViewerImage.removeAttribute("src");
  if (returnFocus && !els.galleryOverlay.hidden) els.galleryCloseButton.focus();
}

async function removeGalleryPhoto(photoId) {
  if (!window.confirm("이 사진을 삭제할까요?\n삭제한 사진은 다시 복구할 수 없어요.")) return;

  try {
    await deleteStoredPhoto(photoId);
    closePhotoViewer(false);
    await renderGallery();
    els.galleryStatus.textContent = "사진을 삭제했어요.";
  } catch (error) {
    console.error(error);
    els.galleryStatus.textContent = error.message || "사진을 삭제하지 못했어요.";
  }
}

async function savePhotoToGallery() {
  if (state.photos.length < REQUIRED_SHOTS) return;
  els.saveButton.disabled = true;
  els.saveButton.setAttribute("aria-busy", "true");
  els.saveButtonLabel.textContent = "저장 중...";
  els.editorStatus.textContent = "완성 사진을 저장하고 있어요";

  try {
    const composite = await createCompositePng();
    await storePhoto({
      id: `${Date.now()}-${randomId(6)}`,
      title: currentTitle(),
      createdAt: new Date().toISOString(),
      fileName: composite.fileName,
      dataUrl: composite.dataUrl,
    });
    els.editorStatus.textContent = "사진 보관함에 저장했어요";
    await openGallery();
  } catch (error) {
    console.error(error);
    const message = error?.name === "QuotaExceededError"
      ? "저장 공간이 부족해요. 사진 보기에서 필요 없는 사진을 삭제해 주세요."
      : error.message || "사진을 저장하지 못했어요.";
    els.editorStatus.textContent = message;
    window.alert(message);
  } finally {
    els.saveButton.disabled = false;
    els.saveButton.removeAttribute("aria-busy");
    els.saveButtonLabel.textContent = "사진 저장";
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function loadOptionalImage(src) {
  return loadImage(src).catch(() => null);
}

function drawImageCover(ctx, image, x, y, width, height) {
  const imageRatio = image.width / image.height;
  const targetRatio = width / height;
  let sourceWidth = image.width;
  let sourceHeight = image.height;
  let sourceX = 0;
  let sourceY = 0;

  if (imageRatio > targetRatio) {
    sourceWidth = image.height * targetRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / targetRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawImageContain(ctx, image, centerX, y, maxWidth, maxHeight, glow = false) {
  const imageRatio = image.width / image.height;
  let drawWidth = maxWidth;
  let drawHeight = drawWidth / imageRatio;

  if (drawHeight > maxHeight) {
    drawHeight = maxHeight;
    drawWidth = drawHeight * imageRatio;
  }

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (glow) {
    ctx.shadowColor = "rgba(255, 255, 255, 0.72)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
  ctx.drawImage(image, centerX - drawWidth / 2, y + (maxHeight - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundedRect(ctx, x, y, width, height, radius, color) {
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawFittedText(ctx, text, x, y, maxWidth, maxSize, minSize, weight, color) {
  let size = maxSize;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  while (size > minSize) {
    ctx.font = `${weight} ${size}px "Segoe UI", "Noto Sans KR", sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }

  ctx.fillText(text, x, y, maxWidth);
}

function drawFilmPerforations(ctx, x, y, width, height) {
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";

  for (let dotY = y + 22; dotY < y + height - 18; dotY += 34) {
    fillRoundedRect(ctx, x + 14, dotY, 10, 17, 5, "rgba(255, 255, 255, 0.72)");
    fillRoundedRect(ctx, x + width - 24, dotY, 10, 17, 5, "rgba(255, 255, 255, 0.72)");
  }

  ctx.restore();
}

els.startCameraButton.addEventListener("click", startCamera);
els.switchCameraButton.addEventListener("click", switchCamera);
els.takePhotoButton.addEventListener("click", runCountdownAndCapture);
els.remoteCameraButton.addEventListener("click", openRemotePairing);
els.pairingCloseButton.addEventListener("click", closePairingOverlay);
els.cameraFallbackButton.addEventListener("click", () => els.cameraFileInput.click());
els.cameraFileInput.addEventListener("change", importCameraPhoto);
els.retakeButton.addEventListener("click", resetAll);
els.saveButton.addEventListener("click", savePhotoToGallery);
els.galleryButton.addEventListener("click", openGallery);
els.galleryCloseButton.addEventListener("click", closeGallery);
els.photoViewerCloseButton.addEventListener("click", () => closePhotoViewer());
els.galleryGrid.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-gallery-view]");
  if (viewButton) {
    openPhotoViewer(viewButton.dataset.galleryView).catch(console.error);
    return;
  }
  const deleteButton = event.target.closest("[data-gallery-delete]");
  if (deleteButton) removeGalleryPhoto(deleteButton.dataset.galleryDelete);
});
els.titleInput.addEventListener("input", syncTitleFromInput);
els.smallerStickerButton.addEventListener("click", () => resizeSelectedSticker(-8));
els.biggerStickerButton.addEventListener("click", () => resizeSelectedSticker(8));
els.deleteStickerButton.addEventListener("click", deleteSelectedSticker);

els.photoStrip.addEventListener("click", (event) => {
  const slot = event.target.closest(".strip-slot");
  if (!slot || event.target.closest(".sticker")) return;
  selectCut(Number(slot.dataset.cut));
});

els.cutButtons.addEventListener("click", (event) => {
  const button = event.target.closest("[data-cut-button]");
  if (!button) return;
  selectCut(Number(button.dataset.cutButton));
});

els.effectButtons.addEventListener("click", (event) => {
  const button = event.target.closest("[data-effect]");
  if (!button) return;
  setPhotoEffect(button.dataset.effect);
});

els.frameButtons.addEventListener("click", (event) => {
  const button = event.target.closest("[data-frame]");
  if (!button) return;
  selectFrame(button.dataset.frame);
});

els.stickerPalette.addEventListener("click", (event) => {
  const button = event.target.closest("[data-sticker]");
  if (!button) return;
  addSticker(button.dataset.sticker);
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!els.photoViewerOverlay.hidden) {
    closePhotoViewer();
  } else if (!els.galleryOverlay.hidden) {
    closeGallery();
  } else if (!els.pairingOverlay.hidden) {
    closePairingOverlay();
  }
});
window.addEventListener("beforeunload", () => {
  stopCamera();
  window.clearInterval(state.remote.pollTimer);
});
window.addEventListener("pagehide", () => {
  stopCamera();
  window.clearInterval(state.remote.pollTimer);
});
window.addEventListener("resize", fitTitleInput);
updateCameraDirection();
loadSavedTitle();
syncTitleFromInput();
renderThumbs();
renderGallery().catch(console.error);
