import React, { Component, ErrorInfo, ReactNode } from 'react';
import EconLogo from '@/components/EconLogo';
import { Button } from '@/components/ui/button';
import { RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uygulama arayüz hatası yakalandı:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
          <EconLogo className="h-10 w-44 mb-6 opacity-90" />
          <div className="max-w-md w-full rounded-2xl border border-border/70 bg-card p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              Sayfa Görüntülenirken Bir Hata Oluştu
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Bu bölüm yüklenirken beklenmeyen bir arayüz hatası meydana geldi. Sayfayı yenileyerek veya ana sayfaya dönerek devam edebilirsiniz.
            </p>
            {this.state.error?.message && (
              <p className="text-xs font-mono bg-muted/60 p-2.5 rounded-lg text-muted-foreground overflow-auto max-h-24 text-left">
                {this.state.error.message}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button onClick={this.handleReload} variant="default" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Sayfayı Yenile
              </Button>
              <Button onClick={this.handleGoHome} variant="outline" className="gap-2">
                <Home className="h-4 w-4" />
                Ana Sayfaya Dön
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
