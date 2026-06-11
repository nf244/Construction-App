export const ROLES = {
  ADMIN: 'admin',
  OWNER: 'owner',
  PROJECT_MANAGER: 'project_manager',
  EMPLOYEE: 'employee',
};

export const ROLE_LABELS = {
  admin: 'Admin',
  owner: 'Owner',
  project_manager: 'Project Manager',
  employee: 'Employee',
};

/** Returns true for any role with owner-level authority. */
export function isOwnerLevel(role) {
  return role === ROLES.ADMIN || role === ROLES.OWNER;
}
