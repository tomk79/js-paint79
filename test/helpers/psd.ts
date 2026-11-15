// テスト用: 書き出した PSD を ag-psd で読み戻す(Node 環境)
import { initializeCanvas, readPsd, writePsd, type Psd } from 'ag-psd';

// Node には canvas がないため、ag-psd が画素の格納先として使う ImageData を、配列だけで用意する。
// useImageData: true で読むため、canvas そのものは作らせない
initializeCanvas(
  () => {
    throw new Error('テストでは canvas を使いません');
  },
  (width, height) =>
    ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as unknown as ImageData,
);

export function readPsdBytes(bytes: Uint8Array): Psd {
  return readPsd(bytes, { useImageData: true, skipThumbnail: true, strict: true });
}

/** テスト用の PSD を ag-psd で書き出す(グループ、マスク、16 bit など、encodePsd が書かない要素を含めるため) */
export function writePsdBytes(psd: Psd): Uint8Array {
  return new Uint8Array(writePsd(psd));
}

/** 単色で塗りつぶした ImageData 相当のオブジェクト */
export function solidImage(
  width: number,
  height: number,
  color: [number, number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(color, i);
  return { width, height, data } as unknown as ImageData;
}
