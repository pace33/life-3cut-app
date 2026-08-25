const REQUIRED_SHOTS = 3;
const DEFAULT_STICKER_SIZE = 54;

const state = {
  stream: null,
  photos: [],
  selectedCut: 0,
  selectedStickerId: null,
  stickers: [],
  isCounting: false,
  nextStickerId: 1,
};

const els = {
  cameraScreen: document.querySelector("#cameraScreen"),
  editorScreen: document.querySelector("#editorScreen"),
  progressText: document.querySelector("#progressText"),
  cameraStatus: document.querySelector("#cameraStatus"),
  editorStatus: document.querySelector("#editorStatus"),
  video: document.querySelector("#cameraPreview"),
  placeholder: document.querySelector("#previewPlaceholder"),
  countdown: document.querySelector("#countdown"),
  startCameraButton: document.querySelector("#startCameraButton"),
  takePhotoButton: document.querySelector("#takePhotoButton"),
  thumbGrid: document.querySelector("#thumbGrid"),
  captureNote: document.querySelector("#captureNote"),
  photoStrip: document.querySelector("#photoStrip"),
  cutButtons: document.querySelector("#cutButtons"),
  stickerPalette: document.querySelector("#stickerPalette"),
  smallerStickerButton: document.querySelector("#smallerStickerButton"),
  biggerStickerButton: document.querySelector("#biggerStickerButton"),
  deleteStickerButton: document.querySelector("#deleteStickerButton"),
  saveButton: document.querySelector("#saveButton"),
  retakeButton: document.querySelector("#retakeButton"),
};

function setStatus(message) {
  els.cameraStatus.textContent = message;
}

function setProgress(message) {
  els.progressText.textContent = message;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("이 브라우저는 카메라를 열 수 없어요.");
    return;
  }

  stopCamera();
  setStatus("카메라를 준비하고 있어요");
  setProgress("준비");
  els.startCameraButton.disabled = true;

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
    });

    els.video.srcObject = state.stream;
    await els.video.play();
    els.placeholder.classList.add("hidden");
    els.takePhotoButton.disabled = false;
    setStatus(`${state.photos.length + 1}번째 사진을 찍어요`);
    setProgress(`${state.photos.length}/3`);
  } catch (error) {
    els.placeholder.classList.remove("hidden");
    els.takePhotoButton.disabled = true;
    setStatus("카메라 권한을 확인해 주세요.");
  } finally {
    els.startCameraButton.disabled = false;
  }
}

function stopCamera() {
  if (!state.stream) return;
  state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  els.video.srcObject = null;
}

async function runCountdownAndCapture() {
  if (!state.stream || state.isCounting || state.photos.length >= REQUIRED_SHOTS) return;

  state.isCounting = true;
  els.takePhotoButton.disabled = true;
  els.startCameraButton.disabled = true;
  els.countdown.classList.add("show");

  for (const number of [3, 2, 1]) {
    els.countdown.textContent = String(number);
    setStatus(`${number}초 뒤 찍어요`);
    await wait(900);
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
  const width = els.video.videoWidth || 1280;
  const height = els.video.videoHeight || 960;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(els.video, 0, 0, width, height);

  return canvas.toDataURL("image/png");
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

  stripSlots.forEach((slot, cut) => {
    slot.classList.toggle("selected", cut === state.selectedCut);
    const image = slot.querySelector("img");
    image.src = state.photos[cut];

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

  els.editorStatus.textContent = `${state.selectedCut + 1}번 사진 선택됨`;
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
  button.setAttribute("aria-label", `${sticker.emoji} 스티커`);
  button.classList.toggle("selected", sticker.id === state.selectedStickerId);

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

  const stickerId = Number(event.currentTarget.dataset.stickerId);
  selectSticker(stickerId);
  event.currentTarget.setPointerCapture(event.pointerId);
  moveStickerToPointer(stickerId, event);

  const move = (moveEvent) => moveStickerToPointer(stickerId, moveEvent);
  const finish = () => {
    event.currentTarget.removeEventListener("pointermove", move);
    event.currentTarget.removeEventListener("pointerup", finish);
    event.currentTarget.removeEventListener("pointercancel", finish);
  };

  event.currentTarget.addEventListener("pointermove", move);
  event.currentTarget.addEventListener("pointerup", finish);
  event.currentTarget.addEventListener("pointercancel", finish);
}

function moveStickerToPointer(stickerId, event) {
  const sticker = state.stickers.find((item) => item.id === stickerId);
  if (!sticker) return;

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

  if (keyMoves[event.key]) {
    event.preventDefault();
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
  state.stickers = [];
  state.selectedCut = 0;
  state.selectedStickerId = null;
  state.isCounting = false;
  state.nextStickerId = 1;
  renderThumbs();
  openCamera();
  els.placeholder.classList.remove("hidden");
  els.takePhotoButton.disabled = true;
  setStatus("카메라를 켜 주세요");
  setProgress("준비");
  startCamera();
}

async function saveCompositePng() {
  const canvas = document.createElement("canvas");
  const width = 900;
  const margin = 70;
  const gap = 28;
  const photoWidth = width - margin * 2;
  const photoHeight = 520;
  const titleHeight = 92;
  const footerHeight = 92;
  const height = titleHeight + footerHeight + photoHeight * REQUIRED_SHOTS + gap * 2;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "#f7fbff");
  background.addColorStop(0.58, "#eef8f4");
  background.addColorStop(1, "#fff7e6");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  fillRoundedRect(ctx, 70, 26, 54, 54, 14, "#167d73");
  ctx.fillStyle = "#ffffff";
  ctx.font = '900 34px "Segoe UI", "Noto Sans KR", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("3", 97, 53);

  ctx.fillStyle = "#1f2937";
  ctx.font = '800 40px "Segoe UI", "Noto Sans KR", sans-serif';
  ctx.textAlign = "left";
  ctx.fillText("3컷 사진 놀이", 144, 50);
  ctx.fillStyle = "#627083";
  ctx.font = '700 22px "Segoe UI", "Noto Sans KR", sans-serif';
  ctx.fillText("오늘의 반짝이는 순간", 146, 78);

  const images = await Promise.all(state.photos.map(loadImage));

  images.forEach((image, cut) => {
    const x = margin;
    const y = titleHeight + cut * (photoHeight + gap);

    ctx.save();
    ctx.shadowColor = "rgba(31, 41, 55, 0.16)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 12;
    fillRoundedRect(ctx, x - 16, y - 16, photoWidth + 32, photoHeight + 32, 26, "#ffffff");
    ctx.restore();

    ctx.save();
    roundedRectPath(ctx, x, y, photoWidth, photoHeight, 18);
    ctx.clip();
    drawImageCover(ctx, image, x, y, photoWidth, photoHeight);
    ctx.restore();

    ctx.strokeStyle = ["#167d73", "#4387e8", "#f06d68"][cut];
    ctx.lineWidth = 8;
    roundedRectPath(ctx, x - 4, y - 4, photoWidth + 8, photoHeight + 8, 22);
    ctx.stroke();

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

  ctx.fillStyle = "#1f2937";
  ctx.font = '800 27px "Segoe UI", "Noto Sans KR", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("함께 웃은 3개의 장면", width / 2, height - 45);

  const link = document.createElement("a");
  link.download = `3cut-photo-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
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

els.startCameraButton.addEventListener("click", startCamera);
els.takePhotoButton.addEventListener("click", runCountdownAndCapture);
els.retakeButton.addEventListener("click", resetAll);
els.saveButton.addEventListener("click", saveCompositePng);
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

els.stickerPalette.addEventListener("click", (event) => {
  const button = event.target.closest("[data-sticker]");
  if (!button) return;
  addSticker(button.dataset.sticker);
});

window.addEventListener("beforeunload", stopCamera);
renderThumbs();
