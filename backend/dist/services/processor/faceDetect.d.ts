export interface FaceRect {
    top: number;
    left: number;
    width: number;
    height: number;
}
export declare function setLastImage(buf: Buffer): void;
export declare function getLastImage(): Buffer<ArrayBufferLike> | null;
/** Call Face++ detect API, return largest face rect or null. Results are cached. */
export declare function detectFace(imageBuffer: Buffer): Promise<FaceRect | null>;
/**
 * Crop and align face. Options:
 *   pad   — padding multiplier (default 0.9). Higher = more space around face.
 *   debug — if true, draws face rect and crop box as SVG overlay on the output.
 */
export declare function cropAndAlignFace(input: Buffer, targetW: number, targetH: number, options?: {
    pad?: number;
    debug?: boolean;
}): Promise<Buffer>;
//# sourceMappingURL=faceDetect.d.ts.map