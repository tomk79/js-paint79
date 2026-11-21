type Listener = (event: any) => void;
export declare class Emitter {
    private readonly names;
    private readonly listeners;
    constructor(names: readonly string[]);
    private check;
    on(name: string, listener: Listener): void;
    off(name: string, listener: Listener): void;
    emit(name: string, event: unknown): void;
    clear(): void;
}
export {};
