export function zenkakuToHankaku(str: string): string {
  return str
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xfee0),
    )
    .replace("： ", ":")
    .replace("　", " ")

    .replace(/^\s+/, "")
    .replace(/\s+$/, "");
}
