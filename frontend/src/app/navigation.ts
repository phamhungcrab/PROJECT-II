import { appRoutes } from './routeRegistry'

export const navigationItems = appRoutes.map(({ path, label, description }) => ({
  path,
  label,
  description,
}))
