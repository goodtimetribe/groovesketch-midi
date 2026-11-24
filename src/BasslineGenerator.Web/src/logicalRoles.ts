export const logicalRoles = [
  "bass", "chords", "lead", "pad", "keys", "strings", "brass", "arp",
  "drums", "aux-percussion", "custom",
] as const;

export type LogicalRole = typeof logicalRoles[number];

export interface RoleRoute {
  outputId: string | null;
  channel: number;
}

export type RoleRouting = Partial<Record<LogicalRole, RoleRoute>>;

export const legacyRoleRouting: Readonly<RoleRouting> = Object.freeze({
  bass: { outputId: null, channel: 0 },
  chords: { outputId: null, channel: 1 },
  lead: { outputId: null, channel: 2 },
  pad: { outputId: null, channel: 3 },
  drums: { outputId: null, channel: 9 },
  "aux-percussion": { outputId: null, channel: 7 },
});

export function logicalRoleForLegacyRole(role: string): LogicalRole | null {
  switch (role) {
    case "kick":
    case "snare":
    case "hats":
      return "drums";
    case "percussion":
      return "aux-percussion";
    default:
      return logicalRoles.includes(role as LogicalRole) ? role as LogicalRole : null;
  }
}

export function validateRoleRouting(routing: RoleRouting): void {
  for (const [role, route] of Object.entries(routing) as [LogicalRole, RoleRoute][]) {
    if (!logicalRoles.includes(role))
      throw new RangeError(`Unknown logical role: ${role}`);
    if (!route || (route.outputId !== null && typeof route.outputId !== "string")
      || !Number.isInteger(route.channel) || route.channel < 0 || route.channel > 15)
      throw new RangeError(`The ${role} route is invalid.`);
  }
}

export function routeForRole(routing: RoleRouting, role: LogicalRole): RoleRoute | undefined {
  validateRoleRouting(routing);
  return routing[role];
}
