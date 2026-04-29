import { useEffect, useRef, useState } from 'react';
import {
  Alert, Avatar, Badge, Button, Card, Col, Empty,
  Image, Input, List, Popconfirm, Row, Space, Typography, notification,
} from 'antd';
import {
  DeleteOutlined, DownloadOutlined, FileOutlined, FilePdfOutlined,
  PlayCircleOutlined, PrinterOutlined, ReloadOutlined,
  ScissorOutlined, SearchOutlined, SoundOutlined, UserOutlined,
} from '@ant-design/icons';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useWhatsAppStore } from '../stores/whatsappStore';
import type { WhatsAppFile } from '../types/whatsapp';
import { deleteWhatsAppFile, fetchWhatsAppFiles, fetchWhatsAppStatus, normalizeWhatsAppFile } from '../services/whatsapp.api';
import { API_BASE_URL, SOCKET_URL, getPreviewUrl } from '../utils/helpers';
import GoogleDriveLogin from '../components/GoogleDriveLogin';

dayjs.extend(relativeTime);

const { Text, Title } = Typography;

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);

function fileExt(name: string | undefined) {
  return (name ?? '').split('.').pop()?.toLowerCase() ?? '';
}

function FileIcon({ fileName }: { fileName: string }) {
  const ext = fileExt(fileName);
  if (IMAGE_EXTS.has(ext)) return null; // handled by Image component
  if (ext === 'pdf') return <FilePdfOutlined style={{ fontSize: 48, color: '#ff4d4f' }} />;
  if (['mp4', '3gp', 'mov', 'avi'].includes(ext)) return <PlayCircleOutlined style={{ fontSize: 48, color: '#1677ff' }} />;
  if (['mp3', 'ogg', 'wav', 'aac'].includes(ext)) return <SoundOutlined style={{ fontSize: 48, color: '#fa8c16' }} />;
  return <FileOutlined style={{ fontSize: 48, color: '#8c8c8c' }} />;
}

function formatTime(ts: string) {
  const d = dayjs(ts);
  if (!d.isValid()) return 'Unknown time';
  return dayjs().diff(d, 'hour') < 24
    ? d.format('h:mm A')
    : d.format('MMM D, h:mm A');
}

const SLIDE_IN_CSS = `
@keyframes slideIn {
  from { opacity: 0; transform: translateY(-16px); background: #f6ffed; }
  to   { opacity: 1; transform: translateY(0);     background: transparent; }
}
.new-file-card { animation: slideIn 0.6s ease-out; }
`;

export default function WhatsAppInboxPage() {
  const navigate = useNavigate();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const newIds = useRef<Set<string>>(new Set());
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const { files, connected, loading, error, setFiles, addFile, removeFile, setConnected, setLoading, setError } = useWhatsAppStore();

  useEffect(() => {
    if (socketRef.current) return;
    const socket = io(SOCKET_URL);
    socketRef.current = socket;
    socket.on('connection:status', (s: { connected: boolean; qrCode?: string }) => {
      setConnected(s.connected);
      setQrCode(s.connected ? null : (s.qrCode ?? null));
    });
    socket.on('new_whatsapp_file', (file: WhatsAppFile) => {
      newIds.current.add(file.id);
      addFile(file);
      notification.success({
        message: 'New file received',
        description: `${file.customerName ?? 'Unknown customer'}: ${file.fileName ?? 'New file'}`,
        placement: 'topRight',
        duration: 4,
      });
      setTimeout(() => newIds.current.delete(file.id), 3000);
    });

    load();
    loadDriveFiles();

    // Poll Drive files every 10 seconds
    const poll = setInterval(loadDriveFiles, 10000);

    return () => { socket.disconnect(); socketRef.current = null; clearInterval(poll); };
  }, []);

  async function loadDriveFiles() {
    try {
      const { data } = await axios.get<unknown[]>(`${API_BASE_URL}/drive/files`);
      const normalized = data
        .map((file) => normalizeWhatsAppFile(file as Parameters<typeof normalizeWhatsAppFile>[0]))
        .filter((file): file is WhatsAppFile => file !== null);
      if (normalized.length > 0) setFiles(normalized);
    } catch { /* ignore */ }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [fetched, connected] = await Promise.all([fetchWhatsAppFiles(), fetchWhatsAppStatus()]);
      // Only overwrite if backend returned files; otherwise keep persisted local files
      if (fetched.length > 0) setFiles(fetched);
      setConnected(connected);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!id) return;
    try {
      // Try Drive delete first (Drive IDs are long alphanumeric, not UUID)
      await axios.delete(`${API_BASE_URL}/drive/files/${id}`);
    } catch {
      // Fall back to local file delete
      try { await deleteWhatsAppFile(id); } catch { /* ignore */ }
    }
    removeFile(id);
    notification.success({ message: 'File deleted', placement: 'topRight' });
  }

  function handlePrint(fileUrl: string) {
    const win = window.open(getPreviewUrl(fileUrl), '_blank');
    win?.addEventListener('load', () => win.print());
  }

  const visibleFiles = (Array.isArray(files) ? files : [])
    .map((file) => normalizeWhatsAppFile(file))
    .filter((file): file is WhatsAppFile => file !== null);

  return (
    <>
      <style>{SLIDE_IN_CSS}</style>
      <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100vh' }}>
        <Card
          variant="outlined"
          style={{ borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
        >
          {/* Header */}
          <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
            <Col>
              <Space align="center" size={12}>
                <Title level={3} style={{ margin: 0 }}>WhatsApp Inbox</Title>
                <Badge status={connected ? 'success' : 'error'} />
              </Space>
              <Text type="secondary" style={{ display: 'block', marginTop: 2 }}>
                Real-time customer files from WhatsApp
              </Text>
            </Col>
            <Col>
              <Space>
                <Text type="secondary">{visibleFiles.length} file{visibleFiles.length !== 1 ? 's' : ''}</Text>
                <Input prefix={<SearchOutlined />} placeholder="Search…" style={{ width: 180 }} disabled />
                <GoogleDriveLogin />
                <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
              </Space>
            </Col>
          </Row>

          {/* Status bar */}
          <Alert
            type={connected ? 'success' : 'warning'}
            message={connected ? 'Connected – receiving files' : 'Disconnected. Scan QR code below to connect.'}
            showIcon
            style={{ marginBottom: qrCode ? 8 : 16, borderRadius: 8 }}
          />
          {!connected && qrCode && (
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <img src={qrCode} alt="WhatsApp QR Code" style={{ width: 200, height: 200, borderRadius: 8, border: '1px solid #f0f0f0' }} />
              <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>Open WhatsApp → Linked Devices → Link a Device</div>
            </div>
          )}

          {error && (
            <Alert type="error" message={error} showIcon style={{ marginBottom: 16, borderRadius: 8 }} />
          )}

          {/* File list */}
          <List
            loading={loading}
            dataSource={visibleFiles}
            locale={{ emptyText: (
              <Empty
                description={
                  <Text type="secondary">
                    No files received yet.<br />Ask customers to send files via WhatsApp.
                  </Text>
                }
              />
            )}}
            renderItem={(file) => {
              const isImg = IMAGE_EXTS.has(fileExt(file.fileName));
              const isNew = newIds.current.has(file.id);
              const previewUrl = getPreviewUrl(file.fileUrl);
              return (
                <List.Item style={{ padding: '12px 0' }}>
                  <Card
                    hoverable
                    className={isNew ? 'new-file-card' : ''}
                    style={{ width: '100%', borderRadius: 10 }}
                    styles={{ body: { padding: '12px 16px' } }}
                  >
                    <Row align="middle" gutter={16} wrap={false}>
                      {/* Thumbnail */}
                      <Col flex="88px">
                        <div style={{
                          width: 80, height: 80, borderRadius: 8, overflow: 'hidden',
                          background: '#fafafa', border: '1px solid #f0f0f0',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isImg ? (
                            <Image
                              src={previewUrl}
                              width={80}
                              height={80}
                              style={{ objectFit: 'cover' }}
                              preview={{ src: previewUrl }}
                              fallback="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
                            />
                          ) : (
                            <FileIcon fileName={file.fileName} />
                          )}
                        </div>
                      </Col>

                      {/* Info */}
                      <Col flex="auto" style={{ minWidth: 0 }}>
                        <Text strong style={{ fontSize: 15, display: 'block' }} ellipsis>
                          {file.fileName}
                        </Text>
                        <Space size={8} style={{ marginTop: 4 }}>
                          <Avatar
                            src={file.profilePicUrl ?? undefined}
                            icon={!file.profilePicUrl && <UserOutlined />}
                            size={22}
                          />
                          <Text type="secondary" style={{ fontSize: 13 }}>{file.customerName}</Text>
                          <Text type="secondary" style={{ fontSize: 13 }}>·</Text>
                          <Text type="secondary" style={{ fontSize: 13 }}>{file.customerId}</Text>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                          {formatTime(file.timestamp)}
                        </Text>
                      </Col>

                      {/* Actions */}
                      <Col flex="none">
                        <Space size={6} wrap>
                          <a href={previewUrl} download={file.fileName}>
                            <Button size="small" icon={<DownloadOutlined />}>Download</Button>
                          </a>
                          <Button
                            size="small"
                            type="primary"
                            ghost
                            icon={<ScissorOutlined />}
                            onClick={() => navigate('/photo-stitch', { state: { file } })}
                          >
                            Photo Stitch
                          </Button>
                          <Button
                            size="small"
                            icon={<PrinterOutlined />}
                            onClick={() => handlePrint(file.fileUrl)}
                          >
                            Print
                          </Button>
                          <Popconfirm
                            title="Delete this file?"
                            okText="Delete"
                            okType="danger"
                            onConfirm={() => handleDelete(file.id)}
                          >
                            <Button size="small" danger icon={<DeleteOutlined />}>Delete</Button>
                          </Popconfirm>
                        </Space>
                      </Col>
                    </Row>
                  </Card>
                </List.Item>
              );
            }}
          />
        </Card>
      </div>
    </>
  );
}
