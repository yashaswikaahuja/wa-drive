export declare const oauth2Client: import("google-auth-library").OAuth2Client;
export declare function loadDriveTokenFromDB(): Promise<void>;
export declare function getDrive(): import("googleapis").drive_v3.Drive | null;
export declare function getDriveAccessToken(): string | null;
/** Load workspace-specific tokens and return a Drive client scoped to that workspace */
export declare function getDriveForWorkspace(wsId: string): Promise<import("googleapis").drive_v3.Drive | null>;
export declare function findOrCreateFolder(drive: any, name: string, parentId?: string): Promise<any>;
export declare function uploadFileToDrive(drive: any, buffer: Buffer, fileName: string, mimetype: string, phone: string, senderName: string): Promise<{
    fileId: any;
    webContentLink: any;
}>;
//# sourceMappingURL=service.d.ts.map