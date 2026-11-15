// PSD を組み立てるためのバイト列の書き込み(DOM 非依存)
// PSD の数値はすべてビッグエンディアン

export class ByteWriter {
  #buf = new Uint8Array(1024);
  #view = new DataView(this.#buf.buffer);
  offset = 0;

  #ensure(size: number): void {
    const need = this.offset + size;
    if (need <= this.#buf.length) return;
    let cap = this.#buf.length * 2;
    while (cap < need) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.#buf.subarray(0, this.offset));
    this.#buf = next;
    this.#view = new DataView(next.buffer);
  }

  u8(v: number): void {
    this.#ensure(1);
    this.#view.setUint8(this.offset, v);
    this.offset += 1;
  }

  u16(v: number): void {
    this.#ensure(2);
    this.#view.setUint16(this.offset, v);
    this.offset += 2;
  }

  i16(v: number): void {
    this.#ensure(2);
    this.#view.setInt16(this.offset, v);
    this.offset += 2;
  }

  u32(v: number): void {
    this.#ensure(4);
    this.#view.setUint32(this.offset, v);
    this.offset += 4;
  }

  i32(v: number): void {
    this.#ensure(4);
    this.#view.setInt32(this.offset, v);
    this.offset += 4;
  }

  /** ASCII の 4 文字(シグネチャ、キー) */
  ascii(s: string): void {
    for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i));
  }

  bytes(b: Uint8Array): void {
    this.#ensure(b.length);
    this.#buf.set(b, this.offset);
    this.offset += b.length;
  }

  /**
   * 長さ(32 bit)を先頭に持つセクションを書く。内容の長さが padTo の倍数になるよう 0 で埋め、
   * 埋めた分も長さに含める
   */
  section(padTo: number, write: () => void): void {
    const at = this.offset;
    this.u32(0);
    const start = this.offset;
    write();
    while ((this.offset - start) % padTo !== 0) this.u8(0);
    const length = this.offset - start;
    assertSectionLength(length);
    this.#view.setUint32(at, length);
  }

  result(): Uint8Array<ArrayBuffer> {
    return this.#buf.slice(0, this.offset);
  }
}

/** セクションの長さが、長さの欄(符号なし 32 bit)で表せることを確かめる */
export function assertSectionLength(length: number): void {
  if (length > 0xffffffff) {
    throw new Error(`PSD のセクションが 4 GB を超えるため、書き出せません(${length} バイト)`);
  }
}
