import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import PlaceholderPage from './components/PlaceholderPage'
import Login from './pages/Login'
import { homeFor, useRole } from './context/RoleContext'
import { StudentDashboard } from './pages/student/StudentDashboard'
import { MyMeals } from './pages/student/MyMeals'
import { Leave } from './pages/student/Leave'
import { QrPage } from './pages/student/QrPage'
import { Preferences } from './pages/student/Preferences'
import { Notifications } from './pages/student/Notifications'
import Billing from './pages/student/Billing'
import Scanner from './pages/staff/Scanner'
import { AdminDashboard } from './pages/admin/AdminDashboard'
import { Planning } from './pages/admin/Planning'
import { Closures } from './pages/admin/Closures'
import { Memberships } from './pages/admin/Memberships'
import { Reports } from './pages/admin/Reports'
import { Demand } from './pages/admin/Demand'
import { Rates } from './pages/admin/Rates'
import { Waste } from './pages/admin/Waste'
import { MenuPublishing } from './pages/admin/MenuPublishing'
function Guard({allow}:{allow:Array<'STUDENT'|'STAFF'|'ADMIN'|'SUPER_ADMIN'>}){const {account,status}=useRole();if(status==='loading')return <p className="p-8">Checking your session…</p>;if(!account)return <Navigate to="/login" replace />;if(!allow.includes(account.role))return <Navigate to={homeFor(account.role)} replace />;return <Outlet />}
export default function App(){const {account}=useRole();return <Routes>
<Route path="/login" element={<Login />} />
<Route element={<Guard allow={['STUDENT','STAFF','ADMIN','SUPER_ADMIN']} />}><Route element={<AppShell />}><Route index element={<Navigate to={account?homeFor(account.role):'/login'} replace />} />
<Route element={<Guard allow={['STUDENT']} />}><Route path="/student" element={<StudentDashboard />} /><Route path="/student/meals" element={<MyMeals />} /><Route path="/student/leave" element={<Leave />} /><Route path="/student/qr" element={<QrPage />} /><Route path="/student/preferences" element={<Preferences />} /><Route path="/student/billing" element={<Billing />} /><Route path="/student/notifications" element={<Notifications />} /></Route>
<Route element={<Guard allow={['STAFF']} />}><Route path="/staff/scan" element={<Scanner />} /></Route>
<Route element={<Guard allow={['ADMIN','SUPER_ADMIN']} />}><Route path="/admin" element={<AdminDashboard />} /><Route path="/admin/planning" element={<Planning />} /><Route path="/admin/menu" element={<MenuPublishing />} /><Route path="/admin/closures" element={<Closures />} /><Route path="/admin/memberships" element={<Memberships />} /><Route path="/admin/rates" element={<Rates />} /><Route path="/admin/forecast" element={<Demand />} /><Route path="/admin/waste" element={<Waste />} /><Route path="/admin/reports" element={<Reports />} /></Route>
<Route path="*" element={<PlaceholderPage title="Page not found" />} />
</Route></Route></Routes>}
