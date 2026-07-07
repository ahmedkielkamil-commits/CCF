import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { CheckInProvider } from './context/CheckInContext';
import { ChildPage } from './pages/ChildPage';
import { JoinPage } from './pages/JoinPage';
import { LandingPage } from './pages/LandingPage';
import { StatusPage } from './pages/StatusPage';

export default function App() {
  return (
    <BrowserRouter>
      <CheckInProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/join/child/:index" element={<ChildPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </CheckInProvider>
    </BrowserRouter>
  );
}
