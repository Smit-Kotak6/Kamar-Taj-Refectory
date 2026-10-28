import { Outlet } from 'react-router-dom'
import MobileTabBar from './MobileTabBar'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function AppShell() {
  return (
    <div className="min-h-dvh bg-cream">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <Sidebar />

      <div className="lg:pl-64">
        <TopBar />
        <main
          id="main-content"
          tabIndex={-1}
          className="px-4 pb-28 pt-6 outline-none sm:px-6 lg:px-10 lg:pb-12 lg:pt-8"
        >
          <Outlet />
        </main>
      </div>

      <MobileTabBar />
    </div>
  )
}