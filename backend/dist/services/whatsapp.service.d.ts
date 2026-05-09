import { Server as SocketIOServer } from 'socket.io';
export declare class WhatsAppService {
    private client;
    private io;
    private isConnected;
    private isInitializing;
    private lastQrCode;
    private driveAccessToken;
    private customerNames;
    setSocketIO(io: SocketIOServer): void;
    setDriveToken(token: string | null): void;
    getDriveToken(): string | null;
    getStatus(): boolean;
    getQrCode(): string | null;
    getCustomerName(phone: string): string;
    init(): Promise<void>;
    private handleMedia;
    private processMedia;
    disconnect(): Promise<void>;
}
export declare const whatsappService: WhatsAppService;
//# sourceMappingURL=whatsapp.service.d.ts.map