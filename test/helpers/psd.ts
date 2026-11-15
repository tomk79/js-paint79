// テスト用: 書き出した PSD を ag-psd で読み戻す(Node 環境)
import { initializeCanvas, readPsd, type Psd } from 'ag-psd';

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
