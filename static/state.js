const listeners = new Set();

function nextArmName(index) {
  return `Arm ${index + 1}`;
}

function clonePoint(point) {
  return Array.isArray(point) ? [...point] : null;
}

function normalizePoint(point) {
  if (!Array.isArray(point) || point.length !== 3) {
    return null;
  }
  const values = point.map((value) => Number(value));
  return values.every(Number.isFinite) ? values : null;
}

function makeArm(name, point1, point2, tangent = "direction_point_to_anchor", existingId = null) {
  const normalizedPoint1 = normalizePoint(point1);
  const normalizedPoint2 = normalizePoint(point2);
  if (!normalizedPoint1 || !normalizedPoint2) {
    throw new Error("Anchor and Guide Point must both be set.");
  }

  return {
    id: existingId ?? crypto.randomUUID(),
    name,
    point1_xyz: normalizedPoint1,
    point2_xyz: normalizedPoint2,
    tangent: tangent || "direction_point_to_anchor",
  };
}

export const state = {
  map: {
    fileName: null,
    metadata: null,
  },
  model: {
    fileName: null,
  },
  toggles: {
    showMap: true,
    showModel: true,
    showAnchors: true,
    showLandmarks: true,
  },
  modelRepresentation: "cartoon-sidechains",
  presetKey: "custom",
  presetLandmarks: [],
  arms: [],
  selectedArmId: null,
  draftArm: {
    name: nextArmName(0),
    point1_xyz: null,
    point2_xyz: null,
    tangent: "direction_point_to_anchor",
  },
  capture: {
    active: false,
    phase: "point1",
  },
  lastPickedPoint: null,
  pickedDraftArm: {
    point1_xyz: null,
    point2_xyz: null,
  },
};

function notify() {
  listeners.forEach((listener) => listener(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function setMapInfo(fileName, metadata) {
  state.map.fileName = fileName;
  state.map.metadata = metadata;
  notify();
}

export function setModelInfo(fileName) {
  state.model.fileName = fileName;
  notify();
}

export function setToggle(key, value) {
  if (!(key in state.toggles)) {
    return;
  }
  state.toggles[key] = Boolean(value);
  notify();
}

export function setModelRepresentation(value) {
  state.modelRepresentation = value || "cartoon-sidechains";
  notify();
}

export function setPreset(key, landmarks) {
  state.presetKey = key;
  state.presetLandmarks = Array.isArray(landmarks) ? landmarks : [];
  notify();
}

export function setDraftArm(name, point1, point2, tangent) {
  state.draftArm.name = name;
  state.draftArm.point1_xyz = normalizePoint(point1);
  state.draftArm.point2_xyz = normalizePoint(point2);
  if (tangent !== undefined) {
    state.draftArm.tangent = tangent;
  }
  notify();
}

export function clearDraft(keepName = true) {
  const preservedName = keepName ? state.draftArm.name : nextArmName(state.arms.length);
  state.draftArm = {
    name: preservedName,
    point1_xyz: null,
    point2_xyz: null,
    tangent: "direction_point_to_anchor",
  };
  state.selectedArmId = null;
  state.capture = {
    active: false,
    phase: "point1",
  };
  state.pickedDraftArm = {
    point1_xyz: null,
    point2_xyz: null,
  };
  notify();
}

export function beginCapture() {
  state.capture = {
    active: true,
    phase: "point1",
  };
  state.draftArm.point1_xyz = null;
  state.draftArm.point2_xyz = null;
  state.pickedDraftArm = {
    point1_xyz: null,
    point2_xyz: null,
  };
  notify();
}

export function capturePoint(point) {
  const normalized = normalizePoint(point);
  if (!normalized) {
    return;
  }

  state.lastPickedPoint = normalized;
  if (!state.capture.active) {
    notify();
    return;
  }

  if (state.capture.phase === "point1") {
    state.draftArm.point1_xyz = normalized;
    state.pickedDraftArm.point1_xyz = clonePoint(normalized);
    state.capture.phase = "point2";
  } else {
    state.draftArm.point2_xyz = normalized;
    state.pickedDraftArm.point2_xyz = clonePoint(normalized);
    state.capture.active = false;
    state.capture.phase = "point1";
  }
  notify();
}

export function selectArm(armId) {
  const arm = state.arms.find((item) => item.id === armId);
  if (!arm) {
    return;
  }
  state.selectedArmId = armId;
  state.draftArm = {
    name: arm.name,
    point1_xyz: clonePoint(arm.point1_xyz),
    point2_xyz: clonePoint(arm.point2_xyz),
    tangent: arm.tangent || "direction_point_to_anchor",
  };
  state.capture = {
    active: false,
    phase: "point1",
  };
  notify();
}

export function saveDraftArm() {
  const name = (state.draftArm.name || "").trim() || nextArmName(state.arms.length);
  const arm = makeArm(
    name,
    state.draftArm.point1_xyz,
    state.draftArm.point2_xyz,
    state.draftArm.tangent || "direction_point_to_anchor",
    state.selectedArmId,
  );

  if (state.selectedArmId) {
    state.arms = state.arms.map((item) =>
      item.id === state.selectedArmId ? arm : item,
    );
  } else {
    state.arms = [...state.arms, arm];
  }

  state.selectedArmId = null;
  state.draftArm = {
    name: nextArmName(state.arms.length),
    point1_xyz: null,
    point2_xyz: null,
    tangent: "direction_point_to_anchor",
  };
  state.capture = {
    active: false,
    phase: "point1",
  };
  notify();
}

export function deleteArm(armId) {
  state.arms = state.arms.filter((item) => item.id !== armId);
  if (state.selectedArmId === armId) {
    state.selectedArmId = null;
    state.draftArm = {
      name: nextArmName(state.arms.length),
      point1_xyz: null,
      point2_xyz: null,
    };
  }
  notify();
}

export function appendArms(arms) {
  const normalized = arms.map((arm, index) =>
    makeArm(
      arm.name || nextArmName(state.arms.length + index),
      arm.point1_xyz,
      arm.point2_xyz,
      arm.tangent || "direction_point_to_anchor",
    ),
  );
  state.arms = [...state.arms, ...normalized];
  notify();
}

export function resetDraftToPicked() {
  if (!state.pickedDraftArm.point1_xyz && !state.pickedDraftArm.point2_xyz) {
    throw new Error("No picked point values are available for reset.");
  }
  state.draftArm.point1_xyz = clonePoint(state.pickedDraftArm.point1_xyz);
  state.draftArm.point2_xyz = clonePoint(state.pickedDraftArm.point2_xyz);
  notify();
}
