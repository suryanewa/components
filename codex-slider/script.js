const root = document.querySelector(".codex-slider");
const trackWrap = root.querySelector(".codex-slider__track-wrap");
const thumb = root.querySelector(".codex-slider__thumb");
const travel = 352;
const centerInset = 24;
const bolt = root.querySelector(".codex-slider__bolt-hit");
const lightning = root.querySelector(".codex-slider__lightning-hit");
let value = 1;
let dragging = false;
let verticalState = 0; // 0 = Bottom, 1 = Top
let startY = 0;
let startX = 0;
let currentThumbY = 0;
let stretch = 0;
let isDraggingX = false;
let currentContainerY = 0;

bolt.addEventListener("click", () => {
  root.classList.toggle("is-flame-active");
  if (root.classList.contains("is-flame-active")) {
    value = 1;
    render();
  }
});

lightning.addEventListener("click", () => {
  verticalState = verticalState === 0 ? 1 : 0;
  render();
});
function render() {
  root.style.setProperty("--value", value.toFixed(4));
  const percentage = Math.round(value * 100);
  thumb.setAttribute("aria-valuenow", String(percentage));
  thumb.setAttribute(
    "aria-valuetext",
    percentage === 0 ? "Faster" : percentage === 100 ? "Smarter" : `${percentage}% toward smarter`,
  );
  
  if (verticalState === 1) {
    root.classList.add("is-lightning-active");
  } else {
    root.classList.remove("is-lightning-active");
  }
}

function valueFromPointer(event) {
  if (root.classList.contains("is-flame-active")) {
    return 1;
  }
  const rect = trackWrap.getBoundingClientRect();
  const scale = rect.width / 400;
  const localX = (event.clientX - rect.left) / scale;
  const rawValue = Math.min(1, Math.max(0, (localX - centerInset) / travel));
  return Math.round(rawValue * 4) / 4;
}

function beginDrag(event) {
  if (event.button !== undefined && event.button !== 0) return;
  dragging = true;
  root.classList.add("is-dragging");
  trackWrap.setPointerCapture?.(event.pointerId);
  value = valueFromPointer(event);
  
  startY = event.clientY;
  startX = event.clientX;
  currentThumbY = 0; // Always starts at baseline
  
  render();
  event.preventDefault();
}

function moveDrag(event) {
  if (!dragging) return;
  value = valueFromPointer(event);
  
  // Calculate vertical squish/stretch
  const rect = trackWrap.getBoundingClientRect();
  const scale = rect.width / 400;
  const deltaX = (event.clientX - startX) / scale;
  const deltaY = (event.clientY - startY) / scale;
  
  if (Math.abs(deltaX) > 5) {
    isDraggingX = true;
  }
  
  let trackY = 0;
  currentContainerY = 0;
  let containerStretch = 0;
  
  if (deltaY < -30) { // pull up past threshold: shift container up (no stretch)
    stretch = 0;
    trackY = 0;
    currentContainerY = -48;
    containerStretch = 48;
    currentThumbY = 0;
  } else if (deltaY > 30) { // pull down past threshold: stretch container down & shift track down
    stretch = 0;
    trackY = 48;
    currentContainerY = 0;
    containerStretch = 48;
    currentThumbY = 48;
  } else {
    stretch = 0;
    trackY = 0;
    currentContainerY = 0;
    containerStretch = 0;
    currentThumbY = 0;
  }
  
  root.style.setProperty('--track-stretch', `${stretch}px`);
  root.style.setProperty('--track-y', `${trackY}px`);
  root.style.setProperty('--container-y', `${currentContainerY}px`);
  root.style.setProperty('--container-stretch', `${containerStretch}px`);
  root.style.setProperty('--thumb-y', `${currentThumbY}px`);

  render();
  event.preventDefault();
}

function endDrag(event) {
  if (!dragging) return;
  dragging = false;
  root.classList.remove("is-dragging");
  trackWrap.releasePointerCapture?.(event.pointerId);
  
  // Update state based on final container/thumb position
  if (verticalState === 0 && currentContainerY === -48) {
    verticalState = 1;
  } else if (verticalState === 1 && currentThumbY === 48) {
    verticalState = 0;
  }
  
  // Release squish and return slider to baseline position
  stretch = 0;
  isDraggingX = false;
  currentContainerY = 0;
  currentThumbY = 0;
  
  root.style.setProperty('--track-stretch', `0px`);
  root.style.setProperty('--track-y', `0px`);
  root.style.setProperty('--container-y', `0px`);
  root.style.setProperty('--container-stretch', `0px`);
  root.style.setProperty('--thumb-y', `0px`);
  
  render();
}

trackWrap.addEventListener("pointerdown", beginDrag);
trackWrap.addEventListener("pointermove", moveDrag);
trackWrap.addEventListener("pointerup", endDrag);
trackWrap.addEventListener("pointercancel", endDrag);

thumb.addEventListener("keydown", (event) => {
  if (root.classList.contains("is-flame-active")) return;
  const steps = { ArrowLeft: -0.25, ArrowDown: -0.25, ArrowRight: 0.25, ArrowUp: 0.25 };

  if (event.key in steps) value = Math.min(1, Math.max(0, value + steps[event.key]));
  else if (event.key === "Home") value = 0;
  else if (event.key === "End") value = 1;
  else return;

  dragging = false;
  render();
  event.preventDefault();
});

render();

// --- Starry Background Logic ---
const canvas = document.querySelector(".codex-slider__stars");
const context = canvas.getContext("2d");

const STAR_COLOR = "#fff";
const STAR_SIZE = 2.2;
const STAR_MIN_SCALE = 0.2;
const OVERFLOW_THRESHOLD = 50;

let cScale = 1;
let cWidth = 0;
let cHeight = 0;
let stars = [];
const velocity = { x: 0, y: 0, tx: 0, ty: 0, z: 0.0005 };

function generateStars() {
  const starCount = 100;
  stars = [];
  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: Math.random() * cWidth,
      y: Math.random() * cHeight,
      z: STAR_MIN_SCALE + Math.random() * (1 - STAR_MIN_SCALE),
    });
  }
}

function recycleStar(star) {
  let direction = "z";
  const vx = Math.abs(velocity.x);
  const vy = Math.abs(velocity.y);

  if (vx > 1 || vy > 1) {
    let axis;
    if (vx > vy) {
      axis = Math.random() < vx / (vx + vy) ? "h" : "v";
    } else {
      axis = Math.random() < vy / (vx + vy) ? "v" : "h";
    }

    if (axis === "h") {
      direction = velocity.x > 0 ? "l" : "r";
    } else {
      direction = velocity.y > 0 ? "t" : "b";
    }
  }

  star.z = STAR_MIN_SCALE + Math.random() * (1 - STAR_MIN_SCALE);

  if (direction === "z") {
    star.z = 0.1;
    star.x = Math.random() * cWidth;
    star.y = Math.random() * cHeight;
  } else if (direction === "l") {
    star.x = -OVERFLOW_THRESHOLD;
    star.y = cHeight * Math.random();
  } else if (direction === "r") {
    star.x = cWidth + OVERFLOW_THRESHOLD;
    star.y = cHeight * Math.random();
  } else if (direction === "t") {
    star.x = cWidth * Math.random();
    star.y = -OVERFLOW_THRESHOLD;
  } else if (direction === "b") {
    star.x = cWidth * Math.random();
    star.y = cHeight + OVERFLOW_THRESHOLD;
  }
}

function resizeCanvas() {
  cScale = window.devicePixelRatio || 1;
  const track = canvas.closest(".codex-slider__track");
  const rect = track.getBoundingClientRect();
  if (rect.width <= 0) return;

  const nextWidth = Math.max(1, Math.round(rect.width * cScale));
  const nextHeight = Math.max(1, Math.round(96 * cScale)); // Always 96px high

  if (canvas.width === nextWidth && canvas.height === nextHeight) return;

  cWidth = nextWidth;
  cHeight = nextHeight;
  canvas.width = cWidth;
  canvas.height = cHeight;
  generateStars();
}

function updateStars() {
  let targetTx = -0.5;
  let targetZ = 0.0002;

  const isFlame = root.classList.contains("is-flame-active");

  if (isFlame) {
    targetTx = -35;
    targetZ = 0.02; // Starfield warp speed!
  } else if (dragging && (currentContainerY !== 0 || currentThumbY !== 0)) {
    if (verticalState === 0 && currentContainerY === -48) {
      // Snapped up (scrubbing up) - exaggerate speed!
      targetTx = -25;
      targetZ = 0.005;
    } else if (verticalState === 1 && currentThumbY === 48) {
      // Snapped down (scrubbing down) - exaggerate slowness (completely still)
      targetTx = 0;
      targetZ = 0;
    } else {
      // Dragging but not snapped yet
      if (verticalState === 1) {
        targetTx = -5;
        targetZ = 0.0008;
      } else {
        targetTx = -0.5;
        targetZ = 0.0002;
      }
    }
  } else {
    // Resting state (or horizontal drag)
    if (verticalState === 1) {
      targetTx = -5;
      targetZ = 0.0008;
    } else {
      targetTx = -0.5;
      targetZ = 0.0002;
    }
  }

  velocity.tx = targetTx;
  velocity.z = targetZ;

  // Use a low interpolation factor so the speed transitions very smoothly with momentum over time
  velocity.x += (velocity.tx - velocity.x) * 0.04;

  stars.forEach((star) => {
    star.x += velocity.x * star.z;
    star.y += velocity.y * star.z;

    star.x += (star.x - cWidth / 2) * velocity.z * star.z;
    star.y += (star.y - cHeight / 2) * velocity.z * star.z;
    star.z += velocity.z;

    if (star.x < -OVERFLOW_THRESHOLD || star.x > cWidth + OVERFLOW_THRESHOLD || star.y < -OVERFLOW_THRESHOLD || star.y > cHeight + OVERFLOW_THRESHOLD) {
      recycleStar(star);
    }
  });
}

function renderStars() {
  context.clearRect(0, 0, cWidth, cHeight);

  stars.forEach((star) => {
    context.beginPath();
    context.lineCap = "round";
    context.lineWidth = STAR_SIZE * star.z * cScale;
    context.globalAlpha = 0.75 + 0.25 * Math.random();
    context.strokeStyle = STAR_COLOR;

    context.beginPath();
    context.moveTo(star.x, star.y);

    // Scale the tail by a very small factor (0.3) for a subtle motion blur effect.
    // When slow, it is effectively a dot (perfect circle).
    let tailX = velocity.x * 0.3;
    let tailY = velocity.y * 0.3;

    if (Math.abs(tailX) < 0.1) tailX = 0.1;
    if (Math.abs(tailY) < 0.1) tailY = 0.1;

    context.lineTo(star.x + tailX, star.y + tailY);
    context.stroke();
  });
}

function stepStars() {
  updateStars();
  renderStars();
  requestAnimationFrame(stepStars);
}

const resizeObserver = new ResizeObserver(resizeCanvas);
resizeObserver.observe(canvas.closest(".codex-slider__track"));
resizeCanvas();
stepStars();
