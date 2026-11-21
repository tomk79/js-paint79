export declare class ByteWriter {
    #private;
    offset: number;
    u8(v: number): void;
    u16(v: number): void;
    i16(v: number): void;
    u32(v: number): void;
    i32(v: number): void;
    /** ASCII の 4 文字(シグネチャ、キー) */
    ascii(s: string): void;
    bytes(b: Uint8Array): void;
    /**
     * 長さ(32 bit)を先頭に持つセクションを書く。内容の長さが padTo の倍数になるよう 0 で埋め、
     * 埋めた分も長さに含める
     */
    section(padTo: number, write: () => void): void;
    result(): Uint8Array<ArrayBuffer>;
}
/** セクションの長さが、長さの欄(符号なし 32 bit)で表せることを確かめる */
export declare function assertSectionLength(length: number): void;
