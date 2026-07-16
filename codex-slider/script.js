const root = document.querySelector(".codex-slider");
const trackWrap = root.querySelector(".codex-slider__track-wrap");
const thumb = root.querySelector(".codex-slider__thumb");
const travel = 352;
const centerInset = 24;
const bolt = root.querySelector(".codex-slider__bolt-hit");
const lightning = root.querySelector(".codex-slider__lightning-hit");
const stepIndicators = [...root.querySelectorAll(".codex-slider__step-indicators span")];
const sliderEfforts = ["Light", "Medium", "High", "Extra High"];
const sliderStep = 1 / (sliderEfforts.length - 1);
const modelColorRamps = {
  "5.6 Sol": { low: "#c273ff", high: "#7c35f2" },
  "5.6 Terra": { low: "#62c8ff", high: "#1478f2" },
  "5.6 Luna": { low: "#57e8ae", high: "#07966b" },
};
let value = 1;
let dragging = false;
let verticalState = 0; // 0 = Bottom, 1 = Top
let startY = 0;
let startX = 0;
let dragStartValue = 1;
let gestureIntent = "pending";
let didScrubDuringGesture = false;
let dragStartedOnThumb = false;
let currentThumbY = 0;
let stretch = 0;
let isDraggingX = false;
let currentContainerY = 0;
let downwardOverlapDistance = 48;
let endpointTugState = "scrubbing";
let endpointTugAnchorX = 0;
let endpointTugUsesNeutralBand = false;
let tugResetTimer = null;

function measureDownwardOverlap() {
  const sliderRect = root.getBoundingClientRect();
  const pillRect = document.querySelector(".model-trigger")?.getBoundingClientRect();
  const renderedScale = sliderRect.width / root.offsetWidth;

  if (!pillRect || !renderedScale) return 48;
  return Math.max(0, (pillRect.bottom - sliderRect.bottom) / renderedScale);
}

function updateEndpointTugVisual(deltaX) {
  const isLeftTug = endpointTugState.startsWith("left-");
  const isRightTug = endpointTugState.startsWith("right-");
  const rawPull = isLeftTug
    ? Math.max(0, -deltaX)
    : isRightTug
      ? Math.max(0, deltaX)
      : 0;
  const outwardPull = endpointTugUsesNeutralBand ? Math.max(0, rawPull - 12) : rawPull;
  const direction = isLeftTug ? -1 : 1;
  const resistedOffset = 18 * (1 - Math.exp(-outwardPull / 42));
  const scaleX = 1 + Math.min(0.28, outwardPull * 0.006);
  const scaleY = 1 - Math.min(0.12, outwardPull * 0.0028);
  const trackScaleX = 1 + (48 * (scaleX - 1)) / 400;
  // Curved transformed edges can expose fractional track pixels beneath the
  // antialiased thumb perimeter, so keep a small dynamic safety overlap.
  const opticalUnderlap = Math.min(4, outwardPull / 7.5);
  const trackOffset = Math.max(0, resistedOffset - opticalUnderlap);

  root.style.setProperty("--tug-x", `${direction * resistedOffset}px`);
  root.style.setProperty("--tug-scale-x", scaleX.toFixed(3));
  root.style.setProperty("--tug-scale-y", scaleY.toFixed(3));
  root.style.setProperty("--tug-track-x", `${direction * trackOffset}px`);
  root.style.setProperty("--tug-track-scale-x", trackScaleX.toFixed(5));
  root.style.setProperty("--tug-track-scale-y", scaleY.toFixed(3));
  root.style.setProperty("--tug-origin", direction < 0 ? "right center" : "left center");
}

function resetEndpointTugVisual() {
  root.style.setProperty("--tug-x", "0px");
  root.style.setProperty("--tug-scale-x", "1");
  root.style.setProperty("--tug-scale-y", "1");
  root.style.setProperty("--tug-track-x", "0px");
  root.style.setProperty("--tug-track-scale-x", "1");
  root.style.setProperty("--tug-track-scale-y", "1");
}

function animateEndpointTugReset() {
  clearTimeout(tugResetTimer);
  root.classList.add("is-tug-resetting");
  resetEndpointTugVisual();
  tugResetTimer = setTimeout(() => {
    root.classList.remove("is-tug-resetting");
  }, 220);
}

function cancelEndpointTugReset() {
  clearTimeout(tugResetTimer);
  root.classList.remove("is-tug-resetting");
}

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
  const currentStepIndex = Math.round(value * (sliderEfforts.length - 1));
  thumb.setAttribute("aria-valuenow", String(percentage));
  thumb.setAttribute("aria-valuetext", sliderEfforts[currentStepIndex]);
  stepIndicators.forEach((indicator, index) => {
    indicator.classList.toggle("is-pending", index > currentStepIndex);
  });
  
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
  return Math.round(rawValue * (sliderEfforts.length - 1)) / (sliderEfforts.length - 1);
}

function beginDrag(event) {
  if (event.button !== undefined && event.button !== 0) return;
  dragging = true;
  cancelEndpointTugReset();
  root.classList.remove("is-tug-releasing");
  root.classList.add("is-dragging");
  trackWrap.setPointerCapture?.(event.pointerId);
  value = valueFromPointer(event);
  dragStartValue = value;
  gestureIntent = "pending";
  didScrubDuringGesture = false;
  dragStartedOnThumb = Boolean(event.target.closest?.(".codex-slider__thumb"));
  
  startY = event.clientY;
  startX = event.clientX;
  const initialTrackRect = trackWrap.getBoundingClientRect();
  const initialScale = initialTrackRect.width / 400;
  const initialLocalX = (event.clientX - initialTrackRect.left) / initialScale;
  const initialLeftEdge = initialLocalX <= centerInset;
  const initialRightEdge = initialLocalX >= centerInset + travel;
  const canStartTug = !root.classList.contains("is-flame-active") && (initialLeftEdge || initialRightEdge);
  endpointTugState = canStartTug ? `${initialLeftEdge ? "left" : "right"}-ready` : "scrubbing";
  endpointTugAnchorX = initialLeftEdge
    ? initialTrackRect.left + centerInset * initialScale
    : initialTrackRect.left + (centerInset + travel) * initialScale;
  endpointTugUsesNeutralBand = false;
  currentThumbY = 0; // Always starts at baseline
  downwardOverlapDistance = measureDownwardOverlap();
  
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  render();
  syncEffortFromSlider();
  event.preventDefault();
}

function moveDrag(event) {
  if (!dragging) return;

  // Calculate vertical squish/stretch
  const rect = trackWrap.getBoundingClientRect();
  const scale = rect.width / 400;
  const deltaX = (event.clientX - startX) / scale;
  const deltaY = (event.clientY - startY) / scale;
  const absoluteDeltaX = Math.abs(deltaX);
  const absoluteDeltaY = Math.abs(deltaY);

  // Resolve intent only after a small dead zone, then keep that direction
  // locked for the rest of the gesture. Horizontal movement gets a lower
  // activation threshold so a normal scrub cannot accidentally change speed.
  if (gestureIntent === "pending") {
    if (absoluteDeltaX >= 8 && absoluteDeltaX >= absoluteDeltaY * 1.15) {
      gestureIntent = "horizontal";
    } else if (absoluteDeltaY >= 14 && absoluteDeltaY >= absoluteDeltaX * 1.5) {
      gestureIntent = "vertical";
    }

    if (gestureIntent !== "pending") {
      didScrubDuringGesture = true;
      root.classList.add("is-scrubbing");
    }
  }

  value = gestureIntent === "vertical" ? dragStartValue : valueFromPointer(event);

  const localPointerX = (event.clientX - rect.left) / scale;
  const horizontalOverflow = Math.max(0, -localPointerX, localPointerX - 400);
  const verticalSpeedThreshold = 30 + Math.min(90, horizontalOverflow * 0.75);

  if (gestureIntent !== "vertical" && endpointTugState === "scrubbing" && !root.classList.contains("is-flame-active")) {
    const reachedLeftEdge = localPointerX <= centerInset;
    const reachedRightEdge = localPointerX >= centerInset + travel;

    if (reachedLeftEdge || reachedRightEdge) {
      const edge = reachedLeftEdge ? "left" : "right";
      endpointTugState = `${edge}-ready`;
      endpointTugAnchorX = rect.left + (reachedLeftEdge ? centerInset : centerInset + travel) * scale;
      endpointTugUsesNeutralBand = false;
    }
  }

  const tugDeltaX = endpointTugState === "scrubbing" ? 0 : (event.clientX - endpointTugAnchorX) / scale;
  const tugSide = endpointTugState.startsWith("left-")
    ? "left"
    : endpointTugState.startsWith("right-")
      ? "right"
      : null;
  const directionalPull = tugSide === "left" ? -tugDeltaX : tugSide === "right" ? tugDeltaX : 0;
  const inwardTravel = tugSide === "left" ? tugDeltaX : tugSide === "right" ? -tugDeltaX : 0;

  if (endpointTugState.endsWith("-latched") && directionalPull <= 12) {
    endpointTugState = `${tugSide}-ready`;
    endpointTugUsesNeutralBand = true;
    animateEndpointTugReset();
  }

  if (endpointTugState.endsWith("-ready") && inwardTravel > 12) {
    endpointTugState = "scrubbing";
    endpointTugUsesNeutralBand = false;
    animateEndpointTugReset();
  }

  if (endpointTugState.endsWith("-ready") && directionalPull > 30 && Math.abs(deltaY) < 30) {
    switchModelFromEndpointTug(tugSide);
    endpointTugState = `${tugSide}-latched`;
  }

  updateEndpointTugVisual(gestureIntent === "vertical" || endpointTugState === "scrubbing" ? 0 : tugDeltaX);
  
  if (Math.abs(deltaX) > 5) {
    isDraggingX = true;
  }
  
  let trackY = 0;
  currentContainerY = 0;
  let containerStretch = 0;
  
  if (gestureIntent === "vertical" && deltaY < -verticalSpeedThreshold) { // pull up past adaptive threshold: shift container up
    stretch = 0;
    trackY = 0;
    currentContainerY = -48;
    containerStretch = 48;
    currentThumbY = 0;
  } else if (gestureIntent === "vertical" && deltaY > verticalSpeedThreshold) { // pull down past adaptive threshold: expand toward the pill
    stretch = 0;
    trackY = downwardOverlapDistance;
    currentContainerY = 0;
    containerStretch = downwardOverlapDistance;
    currentThumbY = downwardOverlapDistance;
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
  syncEffortFromSlider();
  event.preventDefault();
}

function endDrag(event) {
  if (!dragging) return;
  const shouldCycleModel = event.type === "pointerup" && dragStartedOnThumb && !didScrubDuringGesture;
  dragging = false;
  cancelEndpointTugReset();
  root.classList.remove("is-dragging");
  root.classList.remove("is-scrubbing");
  root.classList.add("is-tug-releasing");
  resetEndpointTugVisual();
  trackWrap.releasePointerCapture?.(event.pointerId);
  
  window.removeEventListener("pointermove", moveDrag);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);

  // Update state based on final container/thumb position
  if (verticalState === 0 && currentContainerY === -48) {
    verticalState = 1;
  } else if (verticalState === 1 && currentThumbY > 0) {
    verticalState = 0;
  }
  
  // Release squish and return slider to baseline position
  stretch = 0;
  isDraggingX = false;
  gestureIntent = "pending";
  endpointTugState = "scrubbing";
  endpointTugUsesNeutralBand = false;
  currentContainerY = 0;
  currentThumbY = 0;
  
  root.style.setProperty('--track-stretch', `0px`);
  root.style.setProperty('--track-y', `0px`);
  root.style.setProperty('--container-y', `0px`);
  root.style.setProperty('--container-stretch', `0px`);
  root.style.setProperty('--thumb-y', `0px`);
  
  render();
  setSpeed(verticalState === 1 ? "Fast" : "Standard", { syncSlider: false });

  if (shouldCycleModel) {
    const modelCycle = ["5.6 Luna", "5.6 Terra", "5.6 Sol"];
    const currentIndex = modelCycle.indexOf(interfaceState.model);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % modelCycle.length;
    selectSetting("model", modelCycle[nextIndex]);
  }
}

trackWrap.addEventListener("pointerdown", beginDrag);

thumb.addEventListener("keydown", (event) => {
  if (root.classList.contains("is-flame-active")) return;
  const steps = { ArrowLeft: -sliderStep, ArrowDown: -sliderStep, ArrowRight: sliderStep, ArrowUp: sliderStep };

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
const STAR_SIZE = 2.8;
const STAR_MIN_SCALE = 0.4;
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
    } else if (verticalState === 1 && currentThumbY > 0) {
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

// --- Surrounding composer and Advanced menu integration ---
const composer = document.querySelector(".composer");
const sliderPopover = document.querySelector(".demo-stage");
const settingsMenu = document.querySelector(".settings-menu");
const modelTrigger = document.querySelector(".model-trigger");
const modelLabel = modelTrigger.querySelector(".model-trigger__model");
const effortLabel = modelTrigger.querySelector(".model-trigger__effort");
const advancedTrigger = root.querySelector(".codex-slider__endpoint-copy");
const settingRows = [...settingsMenu.querySelectorAll("[data-submenu]")];
const submenus = [...settingsMenu.querySelectorAll("[data-menu]")];
const settingOptions = [...settingsMenu.querySelectorAll("[data-setting]")];
const settingsFooter = settingsMenu.querySelector(".settings-menu__footer");

const defaults = {
  model: "5.6 Sol",
  effort: "Medium",
  speed: "Standard",
};

const interfaceState = { ...defaults };
let sliderValueBeforeUltra = sliderStep;
let activeSurface = null;
let returningFromSubmenu = false;

root.querySelector(".codex-slider__header").removeAttribute("aria-hidden");
advancedTrigger.setAttribute("role", "button");
advancedTrigger.setAttribute("tabindex", "0");
advancedTrigger.setAttribute("aria-label", "Show advanced model settings");
bolt.setAttribute("role", "button");
bolt.setAttribute("tabindex", "0");
bolt.setAttribute("aria-label", "Use Ultra effort");
lightning.setAttribute("role", "button");
lightning.setAttribute("tabindex", "0");
lightning.setAttribute("aria-label", "Use fast speed");

function setSurface(nextSurface) {
  activeSurface = nextSurface;
  const sliderOpen = nextSurface === "slider";
  const settingsOpen = nextSurface === "settings";

  sliderPopover.classList.toggle("is-visible", sliderOpen);
  sliderPopover.setAttribute("aria-hidden", String(!sliderOpen));
  sliderPopover.inert = !sliderOpen;
  sliderPopover.toggleAttribute("inert", !sliderOpen);
  settingsMenu.classList.toggle("is-visible", settingsOpen);
  settingsMenu.setAttribute("aria-hidden", String(!settingsOpen));
  settingsMenu.inert = !settingsOpen;
  settingsMenu.toggleAttribute("inert", !settingsOpen);
  modelTrigger.classList.toggle("is-active", sliderOpen || settingsOpen);
  modelTrigger.setAttribute("aria-expanded", String(sliderOpen || settingsOpen));

  if (!settingsOpen) hideSubmenus();
}

function hideSubmenus(except = null) {
  submenus.forEach((submenu) => {
    const visible = submenu.dataset.menu === except;
    submenu.classList.toggle("is-visible", visible);
    submenu.setAttribute("aria-hidden", String(!visible));
    submenu.inert = !visible;
    submenu.toggleAttribute("inert", !visible);
  });

  settingRows.forEach((row) => {
    const current = row.dataset.submenu === except;
    row.classList.toggle("is-current", current);
    row.setAttribute("aria-expanded", String(current));
  });
}

function openSubmenu(name) {
  if (activeSurface !== "settings") return;
  hideSubmenus(name);
}

function focusSubmenuOption(name, edge = "selected") {
  const submenu = settingsMenu.querySelector(`[data-menu="${name}"]`);
  const options = [...submenu.querySelectorAll("[data-option]")];
  const selected = options.find((option) => option.getAttribute("aria-pressed") === "true");
  const target = edge === "last" ? options.at(-1) : edge === "first" ? options[0] : selected || options[0];
  target?.focus();
}

function isDefaultState() {
  return Object.keys(defaults).every((key) => interfaceState[key] === defaults[key]);
}

function updateInterface() {
  const colorRamp = modelColorRamps[interfaceState.model] ?? modelColorRamps["5.6 Sol"];
  root.style.setProperty("--ramp-low", colorRamp.low);
  root.style.setProperty("--ramp-high", colorRamp.high);
  modelLabel.textContent = interfaceState.model;
  effortLabel.textContent = interfaceState.effort;
  effortLabel.classList.toggle("is-ultra", interfaceState.effort === "Ultra");
  modelTrigger.classList.toggle("is-fast", interfaceState.speed === "Fast");
  bolt.setAttribute("aria-pressed", String(interfaceState.effort === "Ultra"));
  lightning.setAttribute("aria-pressed", String(interfaceState.speed === "Fast"));

  settingsMenu.querySelector('[data-value="model"]').textContent = interfaceState.model;
  settingsMenu.querySelector('[data-value="effort"]').textContent = interfaceState.effort;
  settingsMenu.querySelector('[data-value="speed"]').textContent = interfaceState.speed;
  settingsMenu.classList.toggle("has-changes", !isDefaultState());

  settingOptions.forEach((option) => {
    const selected = interfaceState[option.dataset.setting] === option.dataset.option;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-pressed", String(selected));
  });
}

function setEffort(effort, { syncSlider = true } = {}) {
  interfaceState.effort = effort;

  if (syncSlider) {
    root.classList.toggle("is-flame-active", effort === "Ultra");
    if (effort !== "Ultra") {
      const effortIndex = sliderEfforts.indexOf(effort);
      value = effortIndex >= 0 ? effortIndex * sliderStep : value;
      render();
    }
  }

  updateInterface();
}

function setSpeed(speed, { syncSlider = true } = {}) {
  interfaceState.speed = speed;
  if (syncSlider) {
    verticalState = speed === "Fast" ? 1 : 0;
    render();
  }
  updateInterface();
}

function selectSetting(setting, option) {
  if (setting === "effort") setEffort(option);
  else if (setting === "speed") setSpeed(option);
  else {
    interfaceState[setting] = option;
    updateInterface();
  }
}

function switchModelFromEndpointTug(direction) {
  const sequence = direction === "left"
    ? ["5.6 Terra", "5.6 Luna"]
    : ["5.6 Terra", "5.6 Sol"];
  const currentIndex = sequence.indexOf(interfaceState.model);
  if (currentIndex === sequence.length - 1) return;
  const nextIndex = currentIndex < 0 ? 0 : currentIndex + 1;
  selectSetting("model", sequence[nextIndex]);
}

function resetSettings() {
  Object.assign(interfaceState, defaults);
  sliderValueBeforeUltra = sliderStep;
  value = sliderStep;
  verticalState = 0;
  root.classList.remove("is-flame-active");
  render();
  updateInterface();
  hideSubmenus();
}

modelTrigger.addEventListener("click", () => {
  const isCollapsing = Boolean(activeSurface);
  setSurface(isCollapsing ? null : "slider");
  if (isCollapsing && modelTrigger.matches(":hover")) {
    modelTrigger.classList.add("is-tooltip-suppressed");
  }
});

modelTrigger.addEventListener("pointerleave", () => {
  modelTrigger.classList.remove("is-tooltip-suppressed");
});

advancedTrigger.addEventListener("click", (event) => {
  event.stopPropagation();
  setSurface("settings");
});

advancedTrigger.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  setSurface("settings");
});

settingRows.forEach((row) => {
  row.addEventListener("pointerenter", () => openSubmenu(row.dataset.submenu));
  row.addEventListener("focus", () => {
    if (!returningFromSubmenu) openSubmenu(row.dataset.submenu);
  });
  row.addEventListener("click", () => openSubmenu(row.dataset.submenu));
  row.addEventListener("keydown", (event) => {
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      openSubmenu(row.dataset.submenu);
      focusSubmenuOption(row.dataset.submenu);
      return;
    }

    if (!["Enter", " ", "ArrowRight", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    openSubmenu(row.dataset.submenu);
    focusSubmenuOption(row.dataset.submenu, event.key === "ArrowDown" ? "first" : "selected");
  });
});

settingOptions.forEach((option) => {
  option.addEventListener("click", () => {
    if (
      option.dataset.setting === "effort"
      && option.dataset.option === "Ultra"
      && interfaceState.effort !== "Ultra"
    ) {
      sliderValueBeforeUltra = value;
    }
    selectSetting(option.dataset.setting, option.dataset.option);
  });
  option.addEventListener("keydown", (event) => {
    const submenu = option.closest("[data-menu]");
    const options = [...submenu.querySelectorAll("[data-option]")];
    const index = options.indexOf(option);
    let nextIndex = null;

    if (event.key === "ArrowDown") nextIndex = (index + 1) % options.length;
    else if (event.key === "ArrowUp") nextIndex = (index - 1 + options.length) % options.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = options.length - 1;
    else if (event.key === "ArrowLeft" || event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      hideSubmenus();
      returningFromSubmenu = true;
      settingsMenu.querySelector(`[data-submenu="${submenu.dataset.menu}"]`)?.focus();
      queueMicrotask(() => { returningFromSubmenu = false; });
      return;
    } else return;

    event.preventDefault();
    options[nextIndex]?.focus();
  });
});

settingsFooter.addEventListener("pointerenter", () => hideSubmenus());
settingsFooter.addEventListener("click", () => {
  if (isDefaultState()) setSurface("slider");
  else resetSettings();
});

bolt.addEventListener("click", () => {
  if (!root.classList.contains("is-flame-active")) {
    root.classList.remove("is-ultra-restoring");
    sliderValueBeforeUltra = value;
  }
}, { capture: true });

bolt.addEventListener("click", () => {
  const isUltra = root.classList.contains("is-flame-active");
  if (isUltra) {
    setEffort("Ultra", { syncSlider: false });
  } else {
    root.classList.add("is-ultra-restoring");
    value = sliderValueBeforeUltra;
    render();
    syncEffortFromSlider();
  }
});

lightning.addEventListener("click", () => {
  const speed = root.classList.contains("is-lightning-active") ? "Fast" : "Standard";
  setSpeed(speed, { syncSlider: false });
});

[bolt, lightning].forEach((control) => {
  control.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    control.click();
  });
});

function syncEffortFromSlider() {
  if (root.classList.contains("is-flame-active")) {
    setEffort("Ultra", { syncSlider: false });
    return;
  }

  const currentValue = Number.parseFloat(root.style.getPropertyValue("--value")) || 0;
  const effortIndex = Math.round(currentValue * (sliderEfforts.length - 1));
  setEffort(sliderEfforts[effortIndex], { syncSlider: false });
}

trackWrap.addEventListener("pointerup", syncEffortFromSlider);
thumb.addEventListener("keyup", (event) => {
  if (["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp", "Home", "End"].includes(event.key)) {
    syncEffortFromSlider();
  }
});

document.addEventListener("pointerdown", (event) => {
  if (!activeSurface) return;
  if (composer.contains(event.target) && (
    sliderPopover.contains(event.target)
    || settingsMenu.contains(event.target)
    || modelTrigger.contains(event.target)
  )) return;
  setSurface(null);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeSurface) {
    setSurface(null);
    modelTrigger.focus();
    return;
  }

  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "m") {
    event.preventDefault();
    setSurface("slider");
  }
});

updateInterface();
value = sliderStep;
render();
setSurface(null);
