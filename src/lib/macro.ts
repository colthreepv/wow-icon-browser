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
  icon: string | number,
): string {
  if (
    typeof icon === "number" &&
    (!Number.isSafeInteger(icon) || icon <= 0 || icon > 0xffffffff)
  )
    throw new RangeError("FileDataID must be a positive uint32 integer");
  const reference = typeof icon === "number" ? String(icon) : luaString(icon);
  return `/run EditMacro(${luaString(macroName)},${luaString(macroName)},${reference})`;
}
