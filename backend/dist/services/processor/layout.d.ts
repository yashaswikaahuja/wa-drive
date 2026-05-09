export declare const PHOTO_SPECS: {
    readonly standard: {
        readonly w: number;
        readonly h: number;
        readonly label: "35×45mm (Passport/PAN/Aadhaar)";
    };
    readonly small: {
        readonly w: number;
        readonly h: number;
        readonly label: "25×30mm (School/College)";
    };
    readonly stamp: {
        readonly w: number;
        readonly h: number;
        readonly label: "20×25mm (Stamp size)";
    };
};
export type PhotoSpec = keyof typeof PHOTO_SPECS;
export declare const SHEET_PRESETS: {
    readonly '4x6-8': {
        readonly sw: 1800;
        readonly sh: 1200;
        readonly cols: 4;
        readonly rows: 2;
        readonly label: "4×6 · 8 photos (Standard)";
    };
    readonly '4x6-12': {
        readonly sw: 1800;
        readonly sh: 1200;
        readonly cols: 4;
        readonly rows: 3;
        readonly label: "4×6 · 12 photos (Small)";
    };
    readonly '4x6-4': {
        readonly sw: 1200;
        readonly sh: 1800;
        readonly cols: 2;
        readonly rows: 2;
        readonly label: "4×6 · 4 photos (Large)";
    };
    readonly 'a4-24': {
        readonly sw: 2480;
        readonly sh: 3508;
        readonly cols: 4;
        readonly rows: 6;
        readonly label: "A4 · 24 photos (Bulk)";
    };
};
export type SheetPreset = keyof typeof SHEET_PRESETS;
export type FontStyle = 'bold' | 'normal' | 'italic';
export declare function generatePassportSheet(photoBuffer: Buffer, preset?: SheetPreset, spec?: PhotoSpec, text?: {
    name?: string;
    date?: string;
    signature?: boolean;
}, font?: FontStyle): Promise<Buffer>;
export declare function generateSingleSheet(photoBuffer: Buffer, spec?: PhotoSpec): Promise<Buffer>;
export declare function generateAadhaarLayout(buffers: Buffer[]): Promise<Buffer>;
//# sourceMappingURL=layout.d.ts.map