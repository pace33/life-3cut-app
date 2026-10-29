const REMOTE_COLLECTION = "photos_7";
const REMOTE_API_BASE =
  window.location.hostname === "aiedue.ddns.net"
    ? "/pic-db/db-api"
    : "https://aiedue.ddns.net/pic-db/db-api";
const POLL_MS = 900;

const query = new URLSearchParams(window.location.search);
const state = {
  sessionId: query.get("session") || "",
  pin: (query.get("code") || "").replace(/\D/g, "").slice(0, 6),
  expiresAt: "",
  stream: null,
  facingMode: "user",
  pollTimer: 0,
  pollBusy: false,
  captureBusy: false,
  connectedAt: "",
  handledRecordIds: new Set(),
  captureQueue: [],
  queuedCommandIds: new Set(),
  pendingRequestId: "",
  requestTimer: 0,
};

const els = {
  headerStatus: document.querySelector("#headerStatus"),
  connectScreen: document.querySelector("#connectScreen"),
  connectForm: document.querySelector("#connectForm"),
  connectionCode: document.querySelector("#connectionCode"),
  connectButton: document.querySelector("#connectButton"),
  connectMessage: document.querySelector("#connectMessage"),
  cameraStage: document.querySelector("#cameraStage"),
  video: document.querySelector("#phoneVideo"),
  countdown: document.querySelector("#phoneCountdown"),
  flash: document.querySelector("#cameraFlash"),
  cameraStatus: document.querySelector("#cameraStatus"),
  switchButton: document.querySelector("#switchPhoneCamera"),
  switchLabel: document.querySelector("#switchPhoneCameraLabel"),
  captureButton: document.querySelector("#takePhonePhoto"),
};

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function randomId(bytes = 12) {
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

function encodeStoragePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function apiJson(path, options = {}) {
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

function postEvent(kind, extra = {}) {
  return apiJson(`/items/${REMOTE_COLLECTION}`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        kind,
        sessionId: state.sessionId,
        pin: state.pin,
        createdAt: new Date().toISOString(),
        expiresAt: state.expiresAt,
        ...extra,
      },
    }),
  });
}

function cameraErrorMessage(error) {
  if (!window.isSecureContext) return "안전한 주소(https://)에서 열어 주세요.";
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "휴대폰 설정에서 카메라 권한을 허용해 주세요.";
  }
  if (error?.name === "NotReadableError") {
    return "다른 앱이 카메라를 사용 중이에요. 카메라 앱을 닫아 주세요.";
  }
  return "카메라를 열지 못했어요. Chrome에서 다시 열어 주세요.";
}

function cameraConstraints() {
  return {
    audio: false,
    video: {
      facingMode: { ideal: state.facingMode },
      width: { ideal: 1280 },
      height: { ideal: 960 },
    },
  };
}

function stopCamera() {
  const stream = state.stream;
  state.stream = null;
  els.video.srcObject = null;
  stream?.getTracks().forEach((track) => track.stop());
}

function updateCameraDirection() {
  const rear = state.facingMode === "environment";
  els.video.classList.toggle("mirrored", !rear);
  els.switchLabel.textContent = rear ? "전면 카메라" : "후면 카메라";
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("이 브라우저에서는 카메라를 사용할 수 없어요.");
  }

  stopCamera();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(cameraConstraints());
  } catch (firstError) {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
  }

  state.stream = stream;
  els.video.srcObject = stream;
  await els.video.play();
  const actualFacing = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
  if (["user", "environment"].includes(actualFacing)) state.facingMode = actualFacing;
  updateCameraDirection();
  els.switchButton.disabled = false;
}

function waitForVideoReady() {
  if (els.video.readyState >= 2 && els.video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => finish(new Error("카메라 화면을 준비하지 못했어요.")), 10000);
    function finish(error) {
      window.clearTimeout(timeoutId);
      els.video.removeEventListener("loadeddata", onReady);
      els.video.removeEventListener("canplay", onReady);
      error ? reject(error) : resolve();
    }
    function onReady() {
      if (els.video.videoWidth > 0) finish();
    }
    els.video.addEventListener("loadeddata", onReady);
    els.video.addEventListener("canplay", onReady);
  });
}

async function ensureCameraReady() {
  const track = state.stream?.getVideoTracks?.()[0];
  if (!track || track.readyState !== "live") {
    await startCamera();
  } else {
    await els.video.play();
  }
  await waitForVideoReady();
}

function clearCaptureRequest(enableButton = true) {
  window.clearTimeout(state.requestTimer);
  state.requestTimer = 0;
  state.pendingRequestId = "";
  if (enableButton) els.captureButton.disabled = state.captureBusy || !state.stream;
}

async function findSessionByCode(pin) {
  const result = await apiJson(`/items/${REMOTE_COLLECTION}?limit=200&t=${Date.now()}`);
  const sessions = (result.items || [])
    .map((record) => ({ id: record.id, ...(record.data || {}) }))
    .filter(
      (event) =>
        event.kind === "photoBoothSession" &&
        event.pin === pin &&
        new Date(event.expiresAt || 0).getTime() > Date.now(),
    )
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return sessions[0] || null;
}

async function connectPhone(event) {
  event.preventDefault();
  const pin = els.connectionCode.value.replace(/\D/g, "").slice(0, 6);
  if (pin.length !== 6) {
    els.connectMessage.textContent = "연결 번호 6자리를 확인해 주세요.";
    return;
  }

  state.pin = pin;
  els.connectButton.disabled = true;
  els.connectMessage.textContent = "카메라를 열고 있어요";

  try {
    await startCamera();
    let session = null;
    if (state.sessionId) {
      const result = await apiJson(`/items/${REMOTE_COLLECTION}?limit=200&t=${Date.now()}`);
      session = (result.items || [])
        .map((record) => record.data || {})
        .find(
          (item) =>
            item.kind === "photoBoothSession" &&
            item.sessionId === state.sessionId &&
            item.pin === state.pin &&
            new Date(item.expiresAt || 0).getTime() > Date.now(),
        );
    } else {
      session = await findSessionByCode(state.pin);
      state.sessionId = session?.sessionId || "";
    }

    if (!session || !state.sessionId) {
      throw new Error("연결 번호를 찾지 못했어요. 스탠바이미에서 새 번호를 만들어 주세요.");
    }

    state.expiresAt = session.expiresAt;
    state.connectedAt = new Date().toISOString();
    await postEvent("photoBoothPhoneReady", {
      device: navigator.userAgent.slice(0, 180),
    });

    els.connectScreen.hidden = true;
    els.cameraStage.hidden = false;
    els.headerStatus.textContent = `연결 번호 ${state.pin}`;
    els.cameraStatus.textContent = "연결됐어요. 아래 사진 촬영 버튼을 눌러도 돼요.";
    els.captureButton.disabled = false;
    startPolling();
  } catch (error) {
    console.error(error);
    stopCamera();
    els.connectMessage.textContent = error.message || cameraErrorMessage(error);
  } finally {
    els.connectButton.disabled = false;
  }
}

function startPolling() {
  window.clearInterval(state.pollTimer);
  state.pollTimer = window.setInterval(pollCommands, POLL_MS);
  pollCommands();
}

async function pollCommands() {
  if (!state.sessionId || state.pollBusy) return;
  state.pollBusy = true;

  try {
    const result = await apiJson(`/items/${REMOTE_COLLECTION}?limit=200&t=${Date.now()}`);
    const records = (result.items || [])
      .filter((record) => {
        const item = record.data || {};
        return item.sessionId === state.sessionId && item.pin === state.pin;
      })
      .sort(
        (a, b) =>
          new Date(a.data?.createdAt || 0).getTime() - new Date(b.data?.createdAt || 0).getTime(),
      );

    for (const record of records) {
      if (state.handledRecordIds.has(record.id)) continue;
      const command = record.data || {};

      if (command.kind === "photoBoothPhoneShutterAccepted") {
        state.handledRecordIds.add(record.id);
        if (command.requestId === state.pendingRequestId) {
          els.cameraStatus.textContent = "촬영을 준비하고 있어요.";
        }
        continue;
      }

      if (command.kind === "photoBoothPhoneShutterRejected") {
        state.handledRecordIds.add(record.id);
        if (command.requestId === state.pendingRequestId) {
          clearCaptureRequest(true);
          els.cameraStatus.textContent = command.message || "지금은 촬영할 수 없어요.";
        }
        continue;
      }

      if (command.kind === "photoBoothClosed") {
        state.handledRecordIds.add(record.id);
        window.clearInterval(state.pollTimer);
        stopCamera();
        clearCaptureRequest(false);
        els.cameraStatus.textContent = "스탠바이미와 연결이 종료됐어요.";
        els.switchButton.disabled = true;
        els.captureButton.disabled = true;
        return;
      }

      if (
        command.kind === "photoBoothCapture" &&
        new Date(command.createdAt || 0).getTime() >= new Date(state.connectedAt).getTime()
      ) {
        state.handledRecordIds.add(record.id);
        queueCaptureCommand(command);
        continue;
      }


      state.handledRecordIds.add(record.id);
    }
  } catch (error) {
    console.error(error);
    els.cameraStatus.textContent = "연결을 다시 확인하고 있어요. 잠시 기다려 주세요.";
  } finally {
    state.pollBusy = false;
  }
}

function queueCaptureCommand(command) {
  if (!command.commandId || state.queuedCommandIds.has(command.commandId)) return;
  state.queuedCommandIds.add(command.commandId);
  state.captureQueue.push(command);
  clearCaptureRequest(false);
  els.captureButton.disabled = true;
  void drainCaptureQueue();
}

async function drainCaptureQueue() {
  if (state.captureBusy) return;
  const command = state.captureQueue.shift();
  if (!command) return;

  try {
    await runCapture(command);
  } finally {
    state.queuedCommandIds.delete(command.commandId);
    if (state.captureQueue.length) {
      window.setTimeout(() => drainCaptureQueue(), 0);
    }
  }
}

async function showCountdown(captureAt) {
  els.countdown.classList.add("show");
  let lastText = "";

  while (Date.now() < captureAt) {
    const seconds = Math.ceil((captureAt - Date.now()) / 1000);
    const text = seconds > 3 ? "준비" : String(Math.max(1, seconds));
    if (text !== lastText) {
      els.countdown.textContent = text;
      els.cameraStatus.textContent = text === "준비" ? "촬영을 준비해요" : `${text}초 뒤 찍어요`;
      lastText = text;
    }
    await wait(80);
  }
}

function captureBlob() {
  return new Promise((resolve, reject) => {
    const sourceWidth = els.video.videoWidth || 1280;
    const sourceHeight = els.video.videoHeight || 960;
    const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (state.facingMode !== "environment") {
      context.translate(width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(els.video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("사진을 만들지 못했어요."))),
      "image/jpeg",
      0.9,
    );
  });
}

async function runCapture(command) {
  if (state.captureBusy) return;
  state.captureBusy = true;
  els.switchButton.disabled = true;
  els.captureButton.disabled = true;

  try {
    await ensureCameraReady();
    postEvent("photoBoothCaptureStarted", {
      commandId: command.commandId,
      shotIndex: command.shotIndex,
    }).catch(() => {});
    const captureAt = Math.max(Number(command.captureAt) || Date.now(), Date.now());
    await showCountdown(captureAt);
    els.countdown.textContent = "찰칵!";
    els.flash.classList.remove("show");
    void els.flash.offsetWidth;
    els.flash.classList.add("show");
    const photo = await captureBlob();
    await wait(260);
    els.countdown.classList.remove("show");
    els.countdown.textContent = "";
    els.cameraStatus.textContent = "사진을 보내고 있어요";

    const storagePath = `7/remote/${state.sessionId}/${command.commandId}.jpg`;
    const upload = await fetch(`${REMOTE_API_BASE}/storage/files/${encodeStoragePath(storagePath)}`, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: photo,
    });
    if (!upload.ok) throw new Error("사진을 보내지 못했어요.");

    await postEvent("photoBoothPhoto", {
      commandId: command.commandId,
      shotIndex: command.shotIndex,
      storagePath,
      bytes: photo.size,
    });
    els.cameraStatus.textContent = "사진을 보냈어요. 다음 촬영을 기다려요.";
  } catch (error) {
    console.error(error);
    els.countdown.classList.remove("show");
    els.countdown.textContent = "";
    els.cameraStatus.textContent = error.message || "촬영에 실패했어요.";
    await postEvent("photoBoothError", {
      commandId: command.commandId,
      message: error.message || "휴대폰 촬영에 실패했어요.",
    }).catch(() => {});
  } finally {
    state.captureBusy = false;
    els.switchButton.disabled = !state.stream;
    els.captureButton.disabled = !state.stream || state.captureQueue.length > 0;
  }
}

async function requestCaptureFromPhone() {
  if (state.captureBusy || state.pendingRequestId || !state.stream) return;
  state.pendingRequestId = randomId();
  els.captureButton.disabled = true;
  els.cameraStatus.textContent = "스탠바이미에 촬영을 요청하고 있어요.";

  try {
    await postEvent("photoBoothPhoneShutter", {
      requestId: state.pendingRequestId,
    });
    state.requestTimer = window.setTimeout(() => {
      if (!state.pendingRequestId) return;
      clearCaptureRequest(true);
      els.cameraStatus.textContent = "촬영 요청 시간이 지났어요. 다시 눌러 주세요.";
    }, 12000);
  } catch (error) {
    console.error(error);
    clearCaptureRequest(true);
    els.cameraStatus.textContent = "촬영 요청을 보내지 못했어요. 다시 눌러 주세요.";
  }
}

async function switchCamera() {
  if (state.captureBusy) return;
  state.facingMode = state.facingMode === "user" ? "environment" : "user";
  els.switchButton.disabled = true;
  els.cameraStatus.textContent = "카메라 방향을 바꾸고 있어요";
  try {
    await startCamera();
    els.cameraStatus.textContent = "아래 사진 촬영 버튼을 눌러도 돼요.";
  } catch (error) {
    els.cameraStatus.textContent = cameraErrorMessage(error);
  }
}

els.connectionCode.value = state.pin;
els.connectForm.addEventListener("submit", connectPhone);
els.switchButton.addEventListener("click", switchCamera);
els.captureButton.addEventListener("click", requestCaptureFromPhone);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || els.cameraStage.hidden || state.captureBusy) return;
  ensureCameraReady().catch((error) => {
    els.cameraStatus.textContent = cameraErrorMessage(error);
  });
});
window.addEventListener("pagehide", () => {
  window.clearInterval(state.pollTimer);
  window.clearTimeout(state.requestTimer);
  stopCamera();
});
