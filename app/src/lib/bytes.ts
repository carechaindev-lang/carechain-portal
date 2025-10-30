export const hexToBytes = (hex: string): Uint8Array => {
  const s = hex.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]*$/.test(s) || s.length % 2) throw new Error("Invalid hex");
  const arr = new Uint8Array(s.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(s.substr(i * 2, 2), 16);
  return arr;
};

export const bytesToHex = (b: Uint8Array) =>
  "0x" + Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");