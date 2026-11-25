export function variableLength(value: number): number[] {
  let remaining = Math.floor(value);
  const bytes = [remaining & 0x7f];
  while ((remaining >>= 7) > 0) bytes.unshift((remaining & 0x7f) | 0x80);
  return bytes;
}

export function chunk(id: string, data: number[]): number[] {
  const length = data.length;
  return [
    ...Array.from(id, (character) => character.charCodeAt(0)),
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...data,
  ];
}
