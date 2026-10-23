import React from 'react';

interface State {
  error: Error | null;
}

export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-foreground">
        <section className="max-w-md space-y-4">
          <h1 className="text-2xl font-bold">EconNotes şu anda açılamadı</h1>
          <p className="text-sm text-muted-foreground">
            Uygulama bağlantı ayarlarını yükleyemedi. Sayfayı yenileyin; sorun sürerse destek@econnotes.online adresine ulaşın.
          </p>
          <button
            type="button"
            className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            Tekrar dene
          </button>
        </section>
      </main>
    );
  }
}
