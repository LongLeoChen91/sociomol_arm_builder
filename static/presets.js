export const PRESETS = [
  {
    key: "custom",
    label: "Custom",
    description: "No preset landmarks. Use the generic arm-building workflow.",
    landmarks: [],
  },
  {
    key: "nucleosome",
    label: "Nucleosome (hook)",
    description:
      "Placeholder for DNA entry/exit anchor points, dyad axis, and linker emergence landmarks.",
    landmarks: [],
  },
  {
    key: "ribosome",
    label: "Ribosome (hook)",
    description:
      "Placeholder for mRNA entry/exit points, E/P/A sites, and path-direction landmarks.",
    landmarks: [],
  },
];

export function getPresetByKey(key) {
  return PRESETS.find((preset) => preset.key === key) ?? PRESETS[0];
}
