export function luaString(value: string): string {
  return (
    '"' +
    value.replace(/[\\"\x00-\x1f\x7f]/g, (char) => {
      if (char === "\\") return "\\\\";
      if (char === '"') return '\\"';
      return "\\" + char.charCodeAt(0).toString().padStart(3, "0");
    }) +
    '"'
  );
}
export function makeMacroCommand(
  macroName: string,
  texturePath: string,
): string {
  return `/run EditMacro(${luaString(macroName)},${luaString(macroName)},${luaString(texturePath)})`;
}
