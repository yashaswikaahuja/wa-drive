export interface WhatsAppFile {
  id: string;
  customerId: string;
  customerName: string;
  fileName: string;
  fileUrl: string;
  profilePicUrl: string | null;
  timestamp: string;
}

export interface ConnectionStatus {
  connected: boolean;
}
