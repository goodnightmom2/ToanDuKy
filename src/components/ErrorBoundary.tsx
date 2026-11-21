import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  {children: React.ReactNode},
  ErrorBoundaryState
> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = {hasError: false, message: ''};
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Đã xảy ra sự cố không mong muốn.',
    };
  }

  componentDidCatch(error: Error): void {
    console.error('[Toán Du Ký ErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh paper-surface flex items-center justify-center p-4">
          <div className="notebook-card max-w-md w-full p-6 space-y-3 text-center">
            <h1 className="font-display text-2xl font-extrabold text-[#14284A]">
              Có trục trặc nhỏ khi hiển thị
            </h1>
            <p className="text-sm text-[#5B6B82]">
              Dữ liệu học tập của em vẫn được bảo lưu an toàn. Hãy tải lại trang để tiếp tục hành trình.
            </p>
            <p className="text-xs text-[#8A5108] bg-[#FFF5E2] border border-[#D98A1F] rounded-xl p-2.5 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-tactile btn-jade w-full text-sm"
            >
              Tải lại Toán Du Ký
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
