import { inferFileExtension } from "./api.js";

const DEFAULT_MAP_STYLE = {
  color: "#6ad0ff",
  opacity: 0.3,
  isolevel: 1.5,
};

function nglVector(point) {
  return new window.NGL.Vector3(point[0], point[1], point[2]);
}

function colorArray(hex) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

function sameScale(scale) {
  return scale.every((value) => Math.abs(value - 1) < 1e-6);
}

function pointsMatch(point1, point2) {
  return point1.every((value, index) => Math.abs(value - point2[index]) < 1e-6);
}

export class ArmViewer {
  constructor(containerId, callbacks) {
    this.callbacks = callbacks;
    this.stage = new window.NGL.Stage(containerId, {
      backgroundColor: "#051118",
    });
    this.mapComponent = null;
    this.modelComponent = null;
    this.armComponents = [];
    this.draftComponent = null;
    this.landmarkComponent = null;
    this.mapCenterOffset = [0, 0, 0];
    this.showMap = true;
    this.showModel = true;
    this.showAnchors = true;
    this.modelRepresentation = "cartoon-sidechains";

    window.addEventListener("resize", () => this.stage.handleResize(), false);
    this.stage.signals.clicked.add((pickingProxy) => {
      if (!pickingProxy || !pickingProxy.position) {
        this.callbacks.onStatusChange(
          "Click on the rendered map surface or fitted model to capture a point.",
        );
        return;
      }
      this.callbacks.onPointPicked([
        pickingProxy.position.x,
        pickingProxy.position.y,
        pickingProxy.position.z,
      ]);
    });
  }

  async loadMap(file, metadata) {
    this._removeComponent(this.mapComponent);

    this.mapComponent = await this.stage.loadFile(file, {
      ext: inferFileExtension(file.name),
      defaultRepresentation: false,
    });

    if (
      typeof this.mapComponent.setScale === "function" &&
      metadata?.viewer_scale_ratio &&
      !sameScale(metadata.viewer_scale_ratio)
    ) {
      this.mapComponent.setScale(metadata.viewer_scale_ratio);
    }

    this.mapComponent.addRepresentation("surface", DEFAULT_MAP_STYLE);
    this._recenterSceneFromMap();
    this.setMapVisibility(this.showMap);
    this.stage.autoView();
    this.callbacks.onStatusChange(
      "Map loaded. Use capture mode to place point 1 and point 2.",
    );
  }

  async loadModel(file) {
    this._removeComponent(this.modelComponent);

    this.modelComponent = await this.stage.loadFile(file, {
      ext: inferFileExtension(file.name),
      defaultRepresentation: false,
    });

    this._applyModelRepresentation();

    this._applyCenteringToComponent(this.modelComponent);
    this.setModelVisibility(this.showModel);
    this.stage.autoView();
    this.callbacks.onStatusChange("Optional fitted model loaded.");
  }

  setMapVisibility(visible) {
    this.showMap = visible;
    if (this.mapComponent?.setVisibility) {
      this.mapComponent.setVisibility(visible);
    }
  }

  setModelVisibility(visible) {
    this.showModel = visible;
    if (this.modelComponent?.setVisibility) {
      this.modelComponent.setVisibility(visible);
    }
  }

  setModelRepresentation(representation) {
    const nextRepresentation = representation || "cartoon-sidechains";
    if (nextRepresentation === this.modelRepresentation) {
      return;
    }
    this.modelRepresentation = nextRepresentation;
    this._applyModelRepresentation();
  }

  _applyModelRepresentation() {
    if (!this.modelComponent) {
      return;
    }
    if (typeof this.modelComponent.removeAllRepresentations === "function") {
      this.modelComponent.removeAllRepresentations();
    }

    if (this.modelRepresentation === "cartoon") {
      this.modelComponent.addRepresentation("cartoon", {
        colorScheme: "chainname",
        opacity: 0.95,
      });
      return;
    }

    if (this.modelRepresentation === "licorice") {
      this.modelComponent.addRepresentation("licorice", {
        sele: "not hydrogen",
        colorScheme: "element",
        radius: 0.2,
        opacity: 0.95,
      });
      return;
    }

    if (this.modelRepresentation === "ball-stick") {
      this.modelComponent.addRepresentation("ball+stick", {
        sele: "not hydrogen",
        colorScheme: "element",
        scale: 1.35,
        opacity: 0.95,
      });
      return;
    }

    this.modelComponent.addRepresentation("cartoon", {
      colorScheme: "chainname",
      opacity: 0.78,
    });
    this.modelComponent.addRepresentation("licorice", {
      sele: "(protein or nucleic) and not hydrogen",
      colorScheme: "element",
      radius: 0.18,
      opacity: 0.95,
    });
    this.modelComponent.addRepresentation("ball+stick", {
      sele: "hetero and not hydrogen",
      colorScheme: "element",
      scale: 1.6,
      opacity: 0.9,
    });
  }

  renderArms(arms, options = {}) {
    this.showAnchors = options.showAnchors ?? this.showAnchors;
    this.armComponents.forEach((component) => this._removeComponent(component));
    this.armComponents = [];

    arms.forEach((arm) => {
      const shape = new window.NGL.Shape(arm.name);
      if (this.showAnchors) {
        shape.addSphere(nglVector(arm.point1_xyz), colorArray("#78d7d4"), 0.7);
        shape.addSphere(nglVector(arm.point2_xyz), colorArray("#f3c969"), 0.7);
      }
      if (!pointsMatch(arm.point1_xyz, arm.point2_xyz)) {
        shape.addCylinder(
          nglVector(arm.point1_xyz),
          nglVector(arm.point2_xyz),
          colorArray("#ff9e44"),
          0.18,
        );
      }
      const component = this.stage.addComponentFromObject(shape);
      component.addRepresentation("buffer");
      this.armComponents.push(component);
    });
  }

  renderDraftArm(draftArm, showAnchors = true) {
    this._removeComponent(this.draftComponent);
    this.draftComponent = null;

    if (!draftArm?.point1_xyz && !draftArm?.point2_xyz) {
      return;
    }

    const shape = new window.NGL.Shape("Draft Arm");
    if (draftArm.point1_xyz && showAnchors) {
      shape.addSphere(nglVector(draftArm.point1_xyz), colorArray("#78d7d4"), 0.85);
    }
    if (draftArm.point2_xyz && showAnchors) {
      shape.addSphere(nglVector(draftArm.point2_xyz), colorArray("#f3c969"), 0.85);
    }
    if (
      draftArm.point1_xyz &&
      draftArm.point2_xyz &&
      !pointsMatch(draftArm.point1_xyz, draftArm.point2_xyz)
    ) {
      shape.addCylinder(
        nglVector(draftArm.point1_xyz),
        nglVector(draftArm.point2_xyz),
        colorArray("#ffffff"),
        0.14,
      );
    }

    this.draftComponent = this.stage.addComponentFromObject(shape);
    this.draftComponent.addRepresentation("buffer");
  }

  renderLandmarks(landmarks, visible) {
    this._removeComponent(this.landmarkComponent);
    this.landmarkComponent = null;

    if (!visible || !Array.isArray(landmarks) || landmarks.length === 0) {
      return;
    }

    const concrete = landmarks.filter(
      (landmark) =>
        Array.isArray(landmark.position_xyz) && landmark.position_xyz.length === 3,
    );
    if (concrete.length === 0) {
      return;
    }

    const shape = new window.NGL.Shape("Biological Landmarks");
    concrete.forEach((landmark) => {
      shape.addSphere(
        nglVector(landmark.position_xyz),
        colorArray("#ff7d74"),
        0.6,
      );
    });

    this.landmarkComponent = this.stage.addComponentFromObject(shape);
    this.landmarkComponent.addRepresentation("buffer");
  }

  _recenterSceneFromMap() {
    if (!this.mapComponent) {
      return;
    }

    const center = this._getComponentCenter(this.mapComponent);
    this.mapCenterOffset = center.map((value) => -value);
    this._applyCenteringToComponent(this.mapComponent);
    this._applyCenteringToComponent(this.modelComponent);
  }

  _applyCenteringToComponent(component) {
    if (!component || !Array.isArray(this.mapCenterOffset)) {
      return;
    }
    if (typeof component.setPosition === "function") {
      component.setPosition(this.mapCenterOffset);
    }
  }

  _getComponentCenter(component) {
    if (component && typeof component.getCenter === "function") {
      const center = component.getCenter();
      return [center.x, center.y, center.z];
    }
    return [0, 0, 0];
  }

  _removeComponent(component) {
    if (!component) {
      return;
    }
    this.stage.removeComponent(component);
  }
}
