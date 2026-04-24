import { parseMrcMetadata } from "./api.js";
import { exportArmDefinition, exportPreviewMarkers } from "./export.js";
import { getPresetByKey, PRESETS } from "./presets.js";
import {
  appendArms,
  beginCapture,
  capturePoint,
  clearDraft,
  deleteArm,
  resetDraftToPicked,
  saveDraftArm,
  selectArm,
  setDraftArm,
  setMapInfo,
  setModelInfo,
  setModelRepresentation,
  setPreset,
  setToggle,
  state,
  subscribe,
} from "./state.js";
import { ArmViewer } from "./viewer.js";

const elements = {
  mapFile: document.querySelector("#map-file"),
  voxelSize: document.querySelector("#voxel-size"),
  modelFile: document.querySelector("#model-file"),
  modelRepresentation: document.querySelector("#model-representation"),
  presetSelect: document.querySelector("#preset-select"),
  toggleMap: document.querySelector("#toggle-map"),
  toggleModel: document.querySelector("#toggle-model"),
  toggleAnchors: document.querySelector("#toggle-anchors"),
  toggleLandmarks: document.querySelector("#toggle-landmarks"),
  armName: document.querySelector("#arm-name"),
  point1X: document.querySelector("#point1-x"),
  point1Y: document.querySelector("#point1-y"),
  point1Z: document.querySelector("#point1-z"),
  point2X: document.querySelector("#point2-x"),
  point2Y: document.querySelector("#point2-y"),
  point2Z: document.querySelector("#point2-z"),
  tangentDirection: document.querySelector("#tangent-direction"),
  nudgeStep: document.querySelector("#nudge-step"),
  duplicateArm: document.querySelector("#duplicate-arm"),
  resetToPicked: document.querySelector("#reset-to-picked"),
  capturePoints: document.querySelector("#capture-points"),
  clearDraft: document.querySelector("#clear-draft"),
  saveArm: document.querySelector("#save-arm"),
  cancelEdit: document.querySelector("#cancel-edit"),
  exportJson: document.querySelector("#export-json"),
  exportMarkers: document.querySelector("#export-markers"),
  viewerStatus: document.querySelector("#viewer-status"),
  mapMeta: document.querySelector("#map-meta"),
  presetHint: document.querySelector("#preset-hint"),
  draftSummary: document.querySelector("#draft-summary"),
  armList: document.querySelector("#arm-list"),
  armCount: document.querySelector("#arm-count"),
  draftPoint1Text: document.querySelector("#draft-point1-text"),
  draftPoint2Text: document.querySelector("#draft-point2-text"),
  lastPickedText: document.querySelector("#last-picked-text"),
  validationExample: document.querySelector("#validation-example"),
  expectedPoint1X: document.querySelector("#expected-point1-x"),
  expectedPoint1Y: document.querySelector("#expected-point1-y"),
  expectedPoint1Z: document.querySelector("#expected-point1-z"),
  expectedPoint2X: document.querySelector("#expected-point2-x"),
  expectedPoint2Y: document.querySelector("#expected-point2-y"),
  expectedPoint2Z: document.querySelector("#expected-point2-z"),
  validationResult: document.querySelector("#validation-result"),
};

const VALIDATION_REFERENCES = {
  arm1: {
    label: "Known-good Arm1",
    point1_xyz: [-24, -12, 28],
    point2_xyz: [-36, -8, 0],
  },
  arm2: {
    label: "Known-good Arm2",
    point1_xyz: [32, 20, 32],
    point2_xyz: [44, 12, 4],
  },
};

const viewer = new ArmViewer("viewport", {
  onPointPicked: (point) => {
    const wasCapturing = state.capture.active;
    const previousPhase = state.capture.phase;
    capturePoint(point);
    if (!wasCapturing) {
      setViewerStatus("Point picked. Start capture mode to use it in an arm.");
    } else if (previousPhase === "point1") {
      setViewerStatus("Anchor captured. Click again to place the Guide Point.");
    } else {
      setViewerStatus("Guide Point captured. Review coordinates and save the arm.");
    }
  },
  onStatusChange: (message) => setViewerStatus(message),
});

function setViewerStatus(message) {
  elements.viewerStatus.textContent = message;
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) {
    return "";
  }
  const factor = 10 ** digits;
  return String(Math.round(value * factor) / factor);
}

function formatVector(vector) {
  if (!Array.isArray(vector)) {
    return "Not set";
  }
  return `[${vector.map((value) => round(value)).join(", ")}] Angstrom`;
}

function parsePointInputs(prefix) {
  const rawValues = [
    elements[`${prefix}X`].value,
    elements[`${prefix}Y`].value,
    elements[`${prefix}Z`].value,
  ];
  if (rawValues.every((value) => value.trim() === "")) {
    return { status: "empty", value: null };
  }
  if (rawValues.some((value) => value.trim() === "")) {
    return { status: "partial", value: null };
  }
  const values = rawValues.map((value) => Number(value));
  if (!values.every(Number.isFinite)) {
    return { status: "invalid", value: null };
  }
  return { status: "complete", value: values };
}

function getPointForAction(prefix, fallback) {
  const parsed = parsePointInputs(prefix);
  if (parsed.status === "complete") {
    return parsed.value;
  }
  if (parsed.status === "empty") {
    return Array.isArray(fallback) ? [...fallback] : null;
  }
  throw new Error(`${prefix === "point1" ? "Anchor" : "Guide Point"} coordinate is incomplete.`);
}

function setPointInputs(prefix, point) {
  const values = Array.isArray(point) ? point : ["", "", ""];
  elements[`${prefix}X`].value = values[0] ?? "";
  elements[`${prefix}Y`].value = values[1] ?? "";
  elements[`${prefix}Z`].value = values[2] ?? "";
}

function renderMapMetadata(currentState) {
  const metadata = currentState.map.metadata;
  if (!metadata) {
    elements.mapMeta.innerHTML = `
      <p class="meta-title">Map metadata</p>
      <p>No map loaded yet.</p>
    `;
    return;
  }

  const grid = metadata.grid_size_voxels.join(" x ");
  const box = metadata.box_size_angstrom.map((value) => round(value)).join(" x ");
  const voxel = metadata.voxel_size_angstrom.map((value) => round(value)).join(", ");
  const headerVoxel = metadata.header_voxel_size_angstrom
    .map((value) => (value == null ? "n/a" : round(value)))
    .join(", ");

  elements.mapMeta.innerHTML = `
    <p class="meta-title">Map metadata</p>
    <p><strong>Map file:</strong> ${currentState.map.fileName}</p>
    <p><strong>Grid size:</strong> ${grid} voxels</p>
    <p><strong>Voxel size used:</strong> ${voxel} Angstrom</p>
    <p><strong>Header voxel size:</strong> ${headerVoxel} Angstrom</p>
    <p><strong>Box size:</strong> ${box} Angstrom</p>
    <p><strong>Internal origin:</strong> map box center = [0, 0, 0] Angstrom</p>
  `;
}

function renderDraftSummary() {
  if (!state.draftArm.point1_xyz || !state.draftArm.point2_xyz) {
    elements.draftSummary.textContent =
      state.capture.active
        ? "Capture mode is active. Click point 1, then point 2, in the 3D viewport."
        : "Draft arm is incomplete.";
    return;
  }

  elements.draftSummary.textContent =
    "Anchor and Guide Point are set. Ready to save.";
}

function renderArmList(currentState) {
  elements.armCount.textContent = String(currentState.arms.length);
  if (currentState.arms.length === 0) {
    elements.armList.innerHTML = `
      <div class="empty-state">
        No arms defined yet. Load a map, capture two points, then save.
      </div>
    `;
    return;
  }

    elements.armList.innerHTML = currentState.arms
    .map(
      (arm) => `
        <article class="arm-card ${currentState.selectedArmId === arm.id ? "selected" : ""}">
          <header>
            <h3>${arm.name}</h3>
          </header>
          <div class="metric-list">
            <div class="metric">
              <strong>Anchor</strong>
              <span>${formatVector(arm.point1_xyz)}</span>
            </div>
            <div class="metric">
              <strong>Guide Point</strong>
              <span>${formatVector(arm.point2_xyz)}</span>
            </div>
            <div class="metric">
              <strong>Tangent</strong>
              <span>${(arm.tangent === "anchor_to_direction_point") ? "Anchor \u2192 Guide Pt" : "Guide Pt \u2192 Anchor"}</span>
            </div>
          </div>
          <div class="actions">
            <button class="ghost" data-action="edit" data-id="${arm.id}">Edit</button>
            <button class="danger" data-action="delete" data-id="${arm.id}">Delete</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderPresetHint(currentState) {
  const preset = getPresetByKey(currentState.presetKey);
  elements.presetHint.textContent = preset.description;
}

function renderInputs(currentState) {
  const activeId = document.activeElement?.id;
  const editorInputIds = new Set([
    "arm-name",
    "point1-x",
    "point1-y",
    "point1-z",
    "point2-x",
    "point2-y",
    "point2-z",
  ]);
  if (!editorInputIds.has(activeId)) {
    elements.armName.value = currentState.draftArm.name ?? "";
    setPointInputs("point1", currentState.draftArm.point1_xyz);
    setPointInputs("point2", currentState.draftArm.point2_xyz);
  }
  elements.draftPoint1Text.textContent = formatVector(currentState.draftArm.point1_xyz);
  elements.draftPoint2Text.textContent = formatVector(currentState.draftArm.point2_xyz);
  elements.lastPickedText.textContent = formatVector(currentState.lastPickedPoint);
  elements.capturePoints.textContent = currentState.capture.active
    ? "Capture in progress..."
    : "Capture Anchor + Guide Point in viewport";
  elements.saveArm.textContent = currentState.selectedArmId ? "Update arm" : "Save arm";
  elements.modelRepresentation.value = currentState.modelRepresentation;
  elements.tangentDirection.value = currentState.draftArm.tangent || "direction_point_to_anchor";
}

function syncViewer(currentState) {
  viewer.setMapVisibility(currentState.toggles.showMap);
  viewer.setModelVisibility(currentState.toggles.showModel);
  viewer.setModelRepresentation(currentState.modelRepresentation);
  viewer.renderArms(currentState.arms, {
    showAnchors: currentState.toggles.showAnchors,
  });
  viewer.renderDraftArm(currentState.draftArm, currentState.toggles.showAnchors);
  viewer.renderLandmarks(
    currentState.presetLandmarks,
    currentState.toggles.showLandmarks,
  );
}

function refreshDraftFromInputs() {
  const parsedPoint1 = parsePointInputs("point1");
  const parsedPoint2 = parsePointInputs("point2");
  const nextPoint1 =
    parsedPoint1.status === "complete"
      ? parsedPoint1.value
      : parsedPoint1.status === "empty"
        ? null
        : state.draftArm.point1_xyz;
  const nextPoint2 =
    parsedPoint2.status === "complete"
      ? parsedPoint2.value
      : parsedPoint2.status === "empty"
        ? null
        : state.draftArm.point2_xyz;

  setDraftArm(
    elements.armName.value,
    nextPoint1,
    nextPoint2,
    elements.tangentDirection.value,
  );
}

function commitDraftFromInputsStrict() {
  const parsedPoint1 = parsePointInputs("point1");
  const parsedPoint2 = parsePointInputs("point2");
  if (parsedPoint1.status === "partial" || parsedPoint1.status === "invalid") {
    throw new Error("Point 1 coordinate must contain valid X, Y, and Z values.");
  }
  if (parsedPoint2.status === "partial" || parsedPoint2.status === "invalid") {
    throw new Error("Point 2 coordinate must contain valid X, Y, and Z values.");
  }
  setDraftArm(
    elements.armName.value,
    parsedPoint1.status === "complete" ? parsedPoint1.value : null,
    parsedPoint2.status === "complete" ? parsedPoint2.value : null,
  );
}

async function loadMapFromInput() {
  const file = elements.mapFile.files?.[0];
  if (!file) {
    return;
  }

  const metadata = await parseMrcMetadata(file, elements.voxelSize.value);
  setMapInfo(file.name, metadata);
  await viewer.loadMap(file, metadata);
}

async function loadModelFromInput() {
  const file = elements.modelFile.files?.[0];
  if (!file) {
    setModelInfo(null);
    return;
  }

  setModelInfo(file.name);
  await viewer.loadModel(file);
}

function populatePresetSelect() {
  elements.presetSelect.innerHTML = PRESETS.map(
    (preset) => `<option value="${preset.key}">${preset.label}</option>`,
  ).join("");
}

function setExpectedInputs(reference) {
  const point1 = reference?.point1_xyz ?? ["", "", ""];
  const point2 = reference?.point2_xyz ?? ["", "", ""];
  elements.expectedPoint1X.value = point1[0] ?? "";
  elements.expectedPoint1Y.value = point1[1] ?? "";
  elements.expectedPoint1Z.value = point1[2] ?? "";
  elements.expectedPoint2X.value = point2[0] ?? "";
  elements.expectedPoint2Y.value = point2[1] ?? "";
  elements.expectedPoint2Z.value = point2[2] ?? "";
}

function readExpectedPoint(prefix) {
  const rawValues = [
    elements[`expected${prefix}X`].value,
    elements[`expected${prefix}Y`].value,
    elements[`expected${prefix}Z`].value,
  ];
  if (rawValues.some((value) => value.trim() === "")) {
    return null;
  }
  const values = rawValues.map((value) => Number(value));
  return values.every(Number.isFinite) ? values : null;
}

function getExpectedValidation() {
  return {
    point1_xyz: readExpectedPoint("Point1"),
    point2_xyz: readExpectedPoint("Point2"),
  };
}

function renderValidation(currentState) {
  const expected = getExpectedValidation();
  const current = currentState.draftArm;

  if (!expected.point1_xyz || !expected.point2_xyz) {
    elements.validationResult.innerHTML = `
      <div><strong>Current point 1:</strong> ${formatVector(current.point1_xyz)}</div>
      <div><strong>Current point 2:</strong> ${formatVector(current.point2_xyz)}</div>
      <div>Enter or load expected centered Angstrom coordinates to compare against the current draft arm.</div>
    `;
    return;
  }
  if (!current.point1_xyz || !current.point2_xyz) {
    elements.validationResult.textContent =
      "Current draft arm is incomplete. Fill point 1 / point 2 coordinates or edit an existing arm.";
    return;
  }

  const point1Diff = current.point1_xyz.map((value, index) => value - expected.point1_xyz[index]);
  const point2Diff = current.point2_xyz.map((value, index) => value - expected.point2_xyz[index]);
  const maxAbs = Math.max(
    ...point1Diff.map((value) => Math.abs(value)),
    ...point2Diff.map((value) => Math.abs(value)),
  );
  const statusClass = maxAbs <= 1e-6 ? "validation-pass" : "validation-warn";
  const statusText =
    maxAbs <= 1e-6
      ? "Matches expected coordinates."
      : `Max absolute difference: ${round(maxAbs, 6)} Angstrom`;

  elements.validationResult.innerHTML = `
    <div class="${statusClass}">${statusText}</div>
    <div class="validation-table">
      <div class="validation-row">
        <strong>Point</strong><strong>Current</strong><strong>Expected</strong><strong>Diff</strong>
      </div>
      <div class="validation-row">
        <strong>Point 1</strong>
        <span>${formatVector(current.point1_xyz)}</span>
        <span>${formatVector(expected.point1_xyz)}</span>
        <span>[${point1Diff.map((value) => round(value, 6)).join(", ")}]</span>
      </div>
      <div class="validation-row">
        <strong>Point 2</strong>
        <span>${formatVector(current.point2_xyz)}</span>
        <span>${formatVector(expected.point2_xyz)}</span>
        <span>[${point2Diff.map((value) => round(value, 6)).join(", ")}]</span>
      </div>
    </div>
  `;
}

function getCurrentEditorPoints() {
  const point1 = getPointForAction("point1", state.draftArm.point1_xyz);
  const point2 = getPointForAction("point2", state.draftArm.point2_xyz);
  return { point1, point2 };
}

function nudgeDraftPoint(pointName, axis, sign) {
  const step = Number(elements.nudgeStep.value);
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error("Nudge step must be a positive number.");
  }
  const { point1, point2 } = getCurrentEditorPoints();
  const point = pointName === "point1" ? point1 : point2;
  if (!point) {
    throw new Error(`Set ${pointName === "point1" ? "Anchor" : "Guide Point"} before nudging it.`);
  }
  const nextPoint = [...point];
  nextPoint[axis] += sign * step;
  setDraftArm(
    elements.armName.value,
    pointName === "point1" ? nextPoint : point1,
    pointName === "point2" ? nextPoint : point2,
  );
}

function duplicateCurrentDraft() {
  const { point1, point2 } = getCurrentEditorPoints();
  if (!point1 || !point2) {
    throw new Error("Both points must be set before duplicating.");
  }
  const baseName = (elements.armName.value || state.draftArm.name || "Arm").trim();
  appendArms([
    {
      name: `${baseName} copy`,
      point1_xyz: point1,
      point2_xyz: point2,
    },
  ]);
}

elements.mapFile.addEventListener("change", async () => {
  try {
    await loadMapFromInput();
  } catch (error) {
    setViewerStatus(`Map load failed: ${error.message}`);
  }
});

elements.voxelSize.addEventListener("change", async () => {
  if (!elements.mapFile.files?.[0]) {
    return;
  }
  try {
    await loadMapFromInput();
  } catch (error) {
    setViewerStatus(`Map reload failed: ${error.message}`);
  }
});

elements.modelFile.addEventListener("change", async () => {
  try {
    await loadModelFromInput();
  } catch (error) {
    setViewerStatus(`Model load failed: ${error.message}`);
  }
});

elements.modelRepresentation.addEventListener("change", (event) => {
  setModelRepresentation(event.target.value);
});

elements.presetSelect.addEventListener("change", () => {
  const preset = getPresetByKey(elements.presetSelect.value);
  setPreset(preset.key, preset.landmarks);
});

elements.toggleMap.addEventListener("change", (event) =>
  setToggle("showMap", event.target.checked),
);
elements.toggleModel.addEventListener("change", (event) =>
  setToggle("showModel", event.target.checked),
);
elements.toggleAnchors.addEventListener("change", (event) =>
  setToggle("showAnchors", event.target.checked),
);
elements.toggleLandmarks.addEventListener("change", (event) =>
  setToggle("showLandmarks", event.target.checked),
);

elements.armName.addEventListener("input", refreshDraftFromInputs);
["point1X", "point1Y", "point1Z", "point2X", "point2Y", "point2Z"].forEach((key) => {
  elements[key].addEventListener("input", refreshDraftFromInputs);
});
elements.tangentDirection.addEventListener("change", refreshDraftFromInputs);

elements.capturePoints.addEventListener("click", () => {
  if (!state.map.metadata) {
    setViewerStatus("Load a map before capturing arm coordinates.");
    return;
  }
  beginCapture();
  setViewerStatus("Capture mode started. Click the Anchor, then the Guide Point in the viewport.");
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-nudge-point]");
  if (!button) {
    return;
  }
  try {
    nudgeDraftPoint(
      button.dataset.nudgePoint,
      Number(button.dataset.axis),
      Number(button.dataset.sign),
    );
    setViewerStatus("Draft coordinate nudged.");
  } catch (error) {
    setViewerStatus(error.message);
  }
});

elements.duplicateArm.addEventListener("click", () => {
  try {
    duplicateCurrentDraft();
    setViewerStatus("Current arm duplicated.");
  } catch (error) {
    setViewerStatus(error.message);
  }
});

elements.resetToPicked.addEventListener("click", () => {
  try {
    resetDraftToPicked();
    setViewerStatus("Draft reset to the last picked point values.");
  } catch (error) {
    setViewerStatus(error.message);
  }
});

elements.validationExample.addEventListener("change", () => {
  const reference = VALIDATION_REFERENCES[elements.validationExample.value];
  if (reference) {
    setExpectedInputs(reference);
  }
  renderValidation(state);
});

[
  "expectedPoint1X",
  "expectedPoint1Y",
  "expectedPoint1Z",
  "expectedPoint2X",
  "expectedPoint2Y",
  "expectedPoint2Z",
].forEach((key) => {
  elements[key].addEventListener("input", () => renderValidation(state));
});

elements.clearDraft.addEventListener("click", () => {
  const wasEditing = Boolean(state.selectedArmId);
  clearDraft(!wasEditing);
  setViewerStatus(wasEditing ? "Edit cancelled. Ready for a new arm." : "Editor cleared.");
});

elements.cancelEdit.addEventListener("click", () => {
  clearDraft(false);
  setViewerStatus("Edit cancelled.");
});

elements.saveArm.addEventListener("click", () => {
  try {
    commitDraftFromInputsStrict();
    saveDraftArm();
    setViewerStatus("Arm saved.");
  } catch (error) {
    setViewerStatus(error.message);
  }
});

elements.armList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  const armId = button.dataset.id;
  if (button.dataset.action === "edit") {
    selectArm(armId);
    setViewerStatus("Arm loaded into the editor for manual changes or re-capture.");
  }
  if (button.dataset.action === "delete") {
    deleteArm(armId);
    setViewerStatus("Arm deleted.");
  }
});

elements.exportJson.addEventListener("click", () => {
  if (state.arms.length === 0) {
    setViewerStatus("Define at least one arm before exporting.");
    return;
  }
  exportArmDefinition(state);
  setViewerStatus("Downloaded arm_geometry.json.");
});

elements.exportMarkers.addEventListener("click", () => {
  if (state.arms.length === 0) {
    setViewerStatus("Define at least one arm before exporting preview markers.");
    return;
  }
  exportPreviewMarkers(state);
  setViewerStatus("Downloaded preview marker JSON.");
});

subscribe((currentState) => {
  renderMapMetadata(currentState);
  renderDraftSummary();
  renderArmList(currentState);
  renderPresetHint(currentState);
  renderInputs(currentState);
  renderValidation(currentState);
  syncViewer(currentState);
});

populatePresetSelect();
setViewerStatus("Load a map to begin. The app will use the map box center as the internal origin.");
