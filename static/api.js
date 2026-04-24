function maybeInt(value) {
  return Number.isFinite(value) ? value : null;
}

function maybeVoxel(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function roundNumber(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function inferFileExtension(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".mmcif")) {
    return "cif";
  }
  const parts = lower.split(".");
  return parts.length > 1 ? parts.at(-1) : "";
}

export async function parseMrcMetadata(file, voxelSizeOverride) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer, 0, Math.min(buffer.byteLength, 1024));

  const nx = maybeInt(view.getInt32(0, true));
  const ny = maybeInt(view.getInt32(4, true));
  const nz = maybeInt(view.getInt32(8, true));

  const mx = maybeInt(view.getInt32(28, true)) || nx;
  const my = maybeInt(view.getInt32(32, true)) || ny;
  const mz = maybeInt(view.getInt32(36, true)) || nz;

  const xlen = view.getFloat32(40, true);
  const ylen = view.getFloat32(44, true);
  const zlen = view.getFloat32(48, true);

  const headerVoxel = [
    maybeVoxel(mx > 0 ? xlen / mx : null),
    maybeVoxel(my > 0 ? ylen / my : null),
    maybeVoxel(mz > 0 ? zlen / mz : null),
  ];

  const manualVoxel = maybeVoxel(Number(voxelSizeOverride));
  const headerBase = headerVoxel.map((value) => value ?? 1);
  const effectiveVoxel = manualVoxel
    ? [manualVoxel, manualVoxel, manualVoxel]
    : headerVoxel.every(Boolean)
      ? headerVoxel
      : [1, 1, 1];

  const scaleRatio = effectiveVoxel.map((value, index) => value / headerBase[index]);
  const gridSize = [nx, ny, nz];
  const boxSize = gridSize.map((value, index) =>
    roundNumber((value ?? 0) * effectiveVoxel[index], 6),
  );

  return {
    file_name: file.name,
    grid_size_voxels: gridSize,
    voxel_size_angstrom: effectiveVoxel.map((value) => roundNumber(value, 6)),
    header_voxel_size_angstrom: headerVoxel.map((value) =>
      value ? roundNumber(value, 6) : null,
    ),
    box_size_angstrom: boxSize,
    box_center_angstrom: [0, 0, 0],
    units: "angstrom",
    origin_convention: "map_box_center",
    viewer_scale_ratio: scaleRatio.map((value) => roundNumber(value, 6)),
  };
}
