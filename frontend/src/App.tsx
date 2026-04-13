import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { AlertCenterPage } from './pages/AlertCenterPage'
import { DashboardPage } from './pages/DashboardPage'
import { DemoAssistantPage } from './pages/DemoAssistantPage'
import { FlowsPage } from './pages/FlowsPage'
import { InventoryPage } from './pages/InventoryPage'
import { ModelViewerPage } from './pages/ModelViewerPage'
import { PolicyCenterPage } from './pages/PolicyCenterPage'
import { TopologyPage } from './pages/TopologyPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/alert-center" element={<AlertCenterPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/demo-assistant" element={<DemoAssistantPage />} />
          <Route path="/policies" element={<PolicyCenterPage />} />
          <Route path="/model-viewer" element={<ModelViewerPage />} />
          <Route path="/topology" element={<TopologyPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/flows" element={<FlowsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
