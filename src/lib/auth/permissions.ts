import type { Role } from "@/lib/utils/types";

/**
 * Single source of truth for role-based access control.
 * Every API route and page layout checks this file.
 * Never inline role checks elsewhere.
 */

export interface RolePermissions {
  /** Route patterns this role can access (glob-like) */
  routes: string[];
  /** API operations this role can perform */
  operations: string[];
}

export const PERMISSIONS: Record<Role, RolePermissions> = {
  pmm_admin: {
    routes: [
      "/",
      "/setup",
      "/signals",
      "/signals/*",
      "/enablement",
      "/auto-answers",
      "/competitors",
      "/competitors/*",
      "/icp",
      "/positioning",
      "/settings",
    ],
    operations: [
      "canonical.read",
      "canonical.write",
      "transcript.create",
      "transcript.read",
      "transcript.delete",
      "signal.read",
      "signal.approve",
      "signal.dismiss",
      "signal.promote",
      "signal.demote",
      "signal.investigate",
      "contested.resolve",
      "auto_answer.read",
      "auto_answer.approve",
      "auto_answer.dismiss",
      "auto_answer.edit",
      "battlecard.read",
      "battlecard.generate",
      "battlecard.edit",
      "battlecard.publish",
      "battlecard.archive",
      "positioning.read",
      "positioning.run",
      "dashboard.read.pmm",
      "invitation.create",
      "invitation.delete",
      "invitation.read",
      "settings.read",
      "settings.write",
    ],
  },

  sales_rep: {
    routes: [
      "/capture",
      "/calls",
      "/calls/*",
      "/battlecard",
      "/battlecard/*",
      "/enablement/mine",
    ],
    operations: [
      "transcript.create",
      "transcript.read.own",
      "signal.read.own",
      "battlecard.read",
      "dashboard.read.rep",
    ],
  },

  sales_leader: {
    routes: [
      "/team",
      "/team/*",
    ],
    operations: [
      "transcript.read.team",
      "signal.read",
      "battlecard.read",
      "dashboard.read.leader",
    ],
  },

  viewer: {
    routes: [
      "/",
      "/export",
    ],
    operations: [
      "dashboard.read.viewer",
    ],
  },
};

/**
 * Check if a role has permission for a given operation.
 */
export function hasPermission(role: Role, operation: string): boolean {
  const perms = PERMISSIONS[role];
  if (!perms) return false;
  return perms.operations.some((op) => {
    if (op === "*") return true;
    if (op === operation) return true;
    // Check wildcard patterns like "signal.*"
    if (op.endsWith(".*")) {
      const prefix = op.slice(0, -2);
      return operation.startsWith(prefix + ".");
    }
    return false;
  });
}

/**
 * Check if a role can access a given route path.
 */
export function canAccessRoute(role: Role, path: string): boolean {
  const perms = PERMISSIONS[role];
  if (!perms) return false;
  return perms.routes.some((pattern) => {
    if (pattern === "/*") return true;
    if (pattern === path) return true;
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      return path.startsWith(prefix);
    }
    return false;
  });
}

/**
 * Get the default landing page for a role after login.
 */
export function getDefaultRoute(role: Role): string {
  switch (role) {
    case "pmm_admin":
      return "/dashboard";
    case "sales_rep":
      return "/capture";
    case "sales_leader":
      return "/team";
    case "viewer":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}
