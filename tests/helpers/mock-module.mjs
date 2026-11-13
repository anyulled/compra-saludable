const isNode25 = process.versions.node.startsWith("25.");

export function mockOpts(exportsObj) {
  if (isNode25) {
    if (exportsObj && "default" in exportsObj && Object.keys(exportsObj).length === 1) {
      return { defaultExport: exportsObj.default };
    }
    return { namedExports: exportsObj };
  }
  return { exports: exportsObj };
}
