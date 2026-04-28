export interface Customer {
  id: string;
  name: string;
  whatsapp?: string;
}

export interface WhatsAppFile {
  id: string;
  customerId: string;
  customerName: string;
  fileName: string;
  fileUrl: string;
  filePath: string;
  type: string;
  timestamp: string;
}

export interface WhatsAppConnectionStatus {
  connected: boolean;
  qrCode?: string;
}
