import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import PlaceholderPage from './components/PlaceholderPage'
import ApiTest from './ApiTest'
import { StudentDashboard } from './pages/student/StudentDashboard'
import { Leave } from './pages/student/Leave'
import { QrPage } from './pages/student/QrPage'
import { Preferences } from './pages/student/Preferences'
import { Notifications } from './pages/student/Notifications'
import Billing from './pages/student/Billing'
import Scanner from './pages/staff/Scanner'

export default function App() {
  return (
    <Routes>
      {/* Temporary: remove once real pages call the API */}
      <Route path="/api-test" element={<ApiTest />} />

      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/student" replace />} />

        <Route path="/student" element={<StudentDashboard />} />
        <Route path="/student/meals" element={<PlaceholderPage title="My Meals" />} />
        <Route path="/student/leave" element={<Leave />} />
        <Route path="/student/qr" element={<QrPage />} />
        <Route path="/student/preferences" element={<Preferences />} />
        <Route path="/student/billing" element={<Billing />} />
        <Route path="/student/notifications" element={<Notifications />} />

        <Route path="/staff/scan" element={<Scanner />} />

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