import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "next-themes"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import WeddingMode from './pages/WeddingMode';
import Gifts from './pages/Gifts';
import AdminDashboard from './pages/AdminDashboard';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { WeddingProvider, useWedding } from '@/lib/WeddingContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Login from '@/components/Login';
import CreateWedding from '@/components/CreateWedding';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const { hasNoWeddings, isLoading: weddingsLoading } = useWedding();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-border border-t-foreground rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Show the sign-in screen; AuthContext re-renders on successful login.
      return <Login />;
    }
  }

  // Show loading spinner while wedding memberships are being fetched
  if (weddingsLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  // Show onboarding screen if user has no weddings
  if (hasNoWeddings) return <CreateWedding />;

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/Gifts" element={
        <LayoutWrapper currentPageName="Gifts">
          <Gifts />
        </LayoutWrapper>
      } />
      <Route path="/WeddingMode" element={
        <LayoutWrapper currentPageName="WeddingMode">
          <WeddingMode />
        </LayoutWrapper>
      } />
      <Route path="/AdminDashboard" element={
        <LayoutWrapper currentPageName="AdminDashboard">
          <AdminDashboard />
        </LayoutWrapper>
      } />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <WeddingProvider>
            <Router basename="/app">
              <NavigationTracker />
              <AuthenticatedApp />
            </Router>
            <Toaster />
          </WeddingProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App