import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Search, RefreshCw, Cloud, LogOut, MessageCircle, LayoutGrid, List } from 'lucide-react';
import GoogleDriveLogin from '../GoogleDriveLogin';

interface HeaderProps {
  fileCount: number;
  isConnected: boolean;
  driveConnected: boolean;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => void;
  onDisconnect: () => void;
  loading?: boolean;
}

export function Header({ fileCount, isConnected, driveConnected, viewMode, onViewModeChange, searchQuery, onSearchChange, onRefresh, onDisconnect, loading }: HeaderProps) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
      <div className="px-4 lg:px-6 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/20 border border-accent/30">
                <MessageCircle className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground tracking-tight">WhatsApp Inbox</h1>
                <p className="text-xs text-muted-foreground">Real-time customer files</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="bg-secondary/50 text-muted-foreground border-border text-xs">
                {fileCount} files
              </Badge>
              {isConnected ? (
                <Badge className="bg-accent/20 text-accent border-accent/30 text-xs gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                  Disconnected
                </Badge>
              )}
              {driveConnected && (
                <Badge variant="outline" className="bg-secondary/50 text-muted-foreground border-border text-xs gap-1.5">
                  <Cloud className="w-3 h-3" />Drive synced
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search files..." value={searchQuery} onChange={e => onSearchChange(e.target.value)}
                className="pl-9 w-full sm:w-64 bg-secondary/50 border-border h-9 text-sm" />
            </div>
            <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1 border border-border">
              <Button variant="ghost" size="sm" onClick={() => onViewModeChange('grid')}
                className={`h-7 w-7 p-0 ${viewMode === 'grid' ? 'bg-accent/20 text-accent' : 'text-muted-foreground hover:text-foreground'}`}>
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onViewModeChange('list')}
                className={`h-7 w-7 p-0 ${viewMode === 'list' ? 'bg-accent/20 text-accent' : 'text-muted-foreground hover:text-foreground'}`}>
                <List className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <GoogleDriveLogin />
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}
                className="h-9 gap-2 bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:bg-secondary">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button variant="outline" size="sm" onClick={onDisconnect}
                className="h-9 gap-2 bg-secondary/50 border-border text-muted-foreground hover:text-destructive hover:border-destructive/50">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Disconnect</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
