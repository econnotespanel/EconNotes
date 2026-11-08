import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import FatalErrorScreen from '@/components/FatalErrorScreen';
import ErrorBoundary from '@/components/ErrorBoundary';

describe('FatalErrorScreen Component', () => {
  it('renders all key elements with fidelity to the design and typography', () => {
    render(
      <FatalErrorScreen
        errorCode="ECON-FATAL-500"
        timestamp="01.11.2026 23:36:10"
        application="ECONNOTES-WEB"
        status="SERVICE_UNAVAILABLE"
        request="ACCESS_BLOCKED_FOR_MAINTENANCE"
      />
    );

    // Header
    expect(screen.getByText('SYSTEM STATUS')).toBeInTheDocument();

    // Critical banner & 500
    expect(screen.getByText('CRITICAL SERVICE INTERRUPTION')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('500 — Sunucu Hatası')).toBeInTheDocument();

    // Description text
    expect(
      screen.getByText(/EconNotes şu anda beklenmeyen bir sunucu hatası nedeniyle kullanılamıyor/i)
    ).toBeInTheDocument();

    // Technical monospace grid
    expect(screen.getByText('ECON-FATAL-500')).toBeInTheDocument();
    expect(screen.getByText('01.11.2026 23:36:10')).toBeInTheDocument();
    expect(screen.getByText('ECONNOTES-WEB')).toBeInTheDocument();
    expect(screen.getByText('SERVICE_UNAVAILABLE')).toBeInTheDocument();
    expect(screen.getByText('ACCESS_BLOCKED_FOR_MAINTENANCE')).toBeInTheDocument();

    // Diagnostic box
    expect(screen.getByText(/System diagnostic/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Runtime could not establish a healthy application state/i)
    ).toBeInTheDocument();
  });

  it('triggers onReload and onGoHome callbacks when buttons are clicked', () => {
    const handleReload = vi.fn();
    const handleGoHome = vi.fn();

    render(
      <FatalErrorScreen
        onReload={handleReload}
        onGoHome={handleGoHome}
      />
    );

    const reloadBtn = screen.getByRole('button', { name: /Sayfayı Yenile/i });
    const goHomeBtn = screen.getByRole('button', { name: /Ana Sayfaya Dön/i });

    fireEvent.click(reloadBtn);
    expect(handleReload).toHaveBeenCalledTimes(1);

    fireEvent.click(goHomeBtn);
    expect(handleGoHome).toHaveBeenCalledTimes(1);
  });
});

describe('ErrorBoundary with FatalErrorScreen integration', () => {
  it('renders child components when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Normal Uygulama Sayfası</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Normal Uygulama Sayfası')).toBeInTheDocument();
  });

  it('catches runtime fatal errors and displays FatalErrorScreen', () => {
    const ProblemChild = () => {
      throw new Error('Test Fatal Runtime Crash');
    };

    // Suppress console.error in test output for clean test logs
    const originalConsoleError = console.error;
    console.error = vi.fn();

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );

    // Verify fatal screen elements are displayed
    expect(screen.getByText('CRITICAL SERVICE INTERRUPTION')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('500 — Sunucu Hatası')).toBeInTheDocument();
    expect(screen.getByText(/Test Fatal Runtime Crash/i)).toBeInTheDocument();

    console.error = originalConsoleError;
  });
});
