import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
export declare function getIO(): SocketIOServer<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
export declare function getHubStatus(): {
    connected: boolean;
    qrCode: string | null;
};
export declare function setupSocket(httpServer: HttpServer): SocketIOServer<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
//# sourceMappingURL=index.d.ts.map