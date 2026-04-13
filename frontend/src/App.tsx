import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { appRoutes, defaultRoutePath } from './app/routeRegistry'
import { AppShell } from './components/layout/AppShell'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to={defaultRoutePath} replace />} />
          {appRoutes.map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
          <Route path="*" element={<Navigate to={defaultRoutePath} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
