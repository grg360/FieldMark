import { StrictMode, Component, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop';
import App from './App.tsx';
import { FilterProvider } from './lib/filter-context';
import { initAnalytics } from './lib/analytics';
import './index.css';

initAnalytics();

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: '#E8A020', padding: '20px', fontFamily: 'monospace' }}>
          FieldMark loading...
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        {/* Forward navigations start at the top; back/forward keep the browser's own
            restore. See the component for the measurement that prompted it. */}
        <ScrollToTop />
        <FilterProvider>
          <App />
        </FilterProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
