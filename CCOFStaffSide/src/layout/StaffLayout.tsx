import { Outlet } from 'react-router-dom';
import { StaffSidebar } from '../components/staff-ui';
import { useStaffName } from '../hooks/useStaffName';

export function StaffLayout() {
  const { staffName, updateStaffName } = useStaffName();

  return (
    <div className="staff-shell">
      <StaffSidebar />
      <div className="staff-main">
        <div className="staff-topbar">
          <div className="staff-topbar__meta">
            <span>{new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
            <span>{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
          <div className="staff-topbar__user">
            <label htmlFor="staffNameSelect" className="sr-only">
              Staff name
            </label>
            <select
              id="staffNameSelect"
              className="staff-topbar__select"
              value={staffName}
              onChange={(event) => updateStaffName(event.target.value)}
            >
              <option>Sarah</option>
              <option>Mike</option>
              <option>Jordan</option>
            </select>
            <span className="staff-topbar__role">Front Desk</span>
          </div>
        </div>
        <div className="staff-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
