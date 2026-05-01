import Sidebar from './Sidebar'

export default function Layout({ children }) {
  return (
    <div className="paper-bg flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {children}
      </main>
    </div>
  )
}
