import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StaffLayout } from './layout/StaffLayout';
import { AddWalkInPage } from './pages/AddWalkInPage';
import { DatabaseStatusPage } from './pages/DatabaseStatusPage';
import { MonitorBoardPage } from './pages/MonitorBoardPage';
import { QueuePage } from './pages/QueuePage';
import { ReportsPage } from './pages/ReportsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<StaffLayout />}>
          <Route path="/" element={<QueuePage />} />
          <Route path="/monitor" element={<MonitorBoardPage />} />
          <Route path="/add" element={<AddWalkInPage />} />
          <Route path="/database-status" element={<DatabaseStatusPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
        <Route path="/queue" element={<Navigate to="/" replace />} />
        <Route path="/it-overservation" element={<Navigate to="/reports" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
