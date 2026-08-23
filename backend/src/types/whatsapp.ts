export type { Customer, WhatsAppFile } from '@cybercontrol/backend-core';

export interface ConnectionStatus {
  connected: boolean;
  qrCode?: string;
}
