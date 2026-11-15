// sRGB の ICC プロファイル(PSD の Image Resource 1039 に埋め込む)
//
// 出典: Compact-ICC-Profiles の profiles/sRGB-v2-micro.icc(456 バイト)
//   https://github.com/saucecontrol/Compact-ICC-Profiles
// ライセンス: CC0 1.0 Universal(パブリックドメイン相当。著作権表示は不要)
// SHA-256: 0a8a33aea66a6f154a5642ebe168ef287e73265d9f7b51c42a45e6eedbacda7a
//
// ICC v2 のプロファイルを選ぶのは、古いバージョンの Photoshop を含め、広く解釈できるため

const BASE64 =
  'AAAByGxjbXMCEAAAbW50clJHQiBYWVogB+IAAwAUAAkADgAdYWNzcE1TRlQAAAAAc2F3c2N0cmwA' +
  'AAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1oYW5knZEAPUCAsD1AdCyBnqUijgAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAJZGVzYwAAAPAAAABfY3BydAAAAQwAAAAMd3RwdAAAARgAAAAUclhZ' +
  'WgAAASwAAAAUZ1hZWgAAAUAAAAAUYlhZWgAAAVQAAAAUclRSQwAAAWgAAABgZ1RSQwAAAWgAAABg' +
  'YlRSQwAAAWgAAABgZGVzYwAAAAAAAAAFdVJHQgAAAAAAAAAAAAAAAHRleHQAAAAAQ0MwAFhZWiAA' +
  'AAAAAADzVAABAAAAARbJWFlaIAAAAAAAAG+gAAA48gAAA49YWVogAAAAAAAAYpYAALeJAAAY2lhZ' +
  'WiAAAAAAAAAkoAAAD4UAALbEY3VydgAAAAAAAAAqAAAAfAD4AZwCdQODBMkGTggSChgMYg70Ec8U' +
  '9hhqHC4gQySsKWoufjPrObM/1kZXTTZUdlwXZB1shnVWfo2ILJI2nKunjLLbvpnKx9dl5Hfx+f//';

/** プロファイルのバイト列。呼び出し側で書き換えても影響しないよう、毎回新しく作る */
export function srgbIccProfile(): Uint8Array {
  const bin = atob(BASE64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
