import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import PlaceholderPage from './components/PlaceholderPage'
import ApiTest from './ApiTest'
import { StudentDashboard } from './pages/student/StudentDashboard'

export default function App() {
  return (
    <Routes>
      {/* Temporary: remove once real pages call the API */}
      <Route path="/api-test" element={<ApiTest />} />

      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/student" replace />} />

        <Route path="/student" element={<StudentDashboard />} />
        <Route path="/student/meals" element={<PlaceholderPage title="My Meals" />} />
        <Route path="/student/leave" element={<PlaceholderPage title="Leave" />} />
        <Route path="/student/qr" element={<PlaceholderPage title="My QR" />} />
        <Route path="/student/preferences" element={<PlaceholderPage title="Preferences" />} />
        <Route path="/student/billing" element={<PlaceholderPage title="Billing" />} />
        <Route path="/student/notifications" element={<PlaceholderPage title="Notifications" />} />

        <Route path="/staff/scan" element={<PlaceholderPage title="Scan" />} />

        <Route path="/admin" element={<PlaceholderPage title="Admin Overview" />} />
        <Route path="/admin/planning" element={<PlaceholderPage title="Meal Planning" />} />
        <Route path="/admin/closures" element={<PlaceholderPage title="Closures" />} />
        <Route path="/admin/forecast" element={<PlaceholderPage title="Demand Forecast" />} />
        <Route path="/admin/waste" element={<PlaceholderPage title="Waste & Sustainability" />} />
        <Route path="/admin/reports" element={<PlaceholderPage title="Reports" />} />

        <Route path="*" element={<PlaceholderPage title="Page not found" />} />
      </Route>
    </Routes>
  )
}