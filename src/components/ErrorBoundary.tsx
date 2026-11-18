import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Erro inesperado na aplicação.',
    };
  }

  render() {
    if (this.state.hasError) {
      let friendlyMessage =
        'Ocorreu um erro ao sincronizar seus dados. Recarregue a página para tentar novamente.';
      if (this.state.errorMessage.includes('Quota exceeded')) {
        friendlyMessage =
          'A cota gratuita diária do banco de dados foi atingida hoje. Tente novamente amanhã.';
      }

      return (
        <div className="min-h-dvh bg-[#0B141A] text-[#E9EDEF] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#111B21] border border-[#222E35] rounded-2xl p-6 space-y-4">
            <h1 className="font-display text-lg font-bold text-[#E9EDEF]">
              Ops, algo interrompeu a conexão
            </h1>
            <p className="text-sm text-[#AEBAC1] leading-relaxed">{friendlyMessage}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-2.5 px-4 rounded-xl bg-[#00A884] hover:bg-[#06CF9C] text-[#0B141A] font-semibold text-sm transition-colors"
            >
              Recarregar aplicativo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
