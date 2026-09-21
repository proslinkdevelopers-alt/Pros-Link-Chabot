import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
  assignableRoles,
  can,
  isStaffRole,
} from "../permissions";
import { ADMIN_NAV } from "../../components/admin/nav";
import { canAccessAdmin, isForeignAccount, passwordProblem } from "../auth";
import { companyProfileSchema, whatsappLink } from "../company-schema";

describe("roles and permissions", () => {
  it("grants only permissions that exist", () => {
    for (const role of STAFF_ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        assert.ok(permission in PERMISSIONS, `${role} has unknown permission ${permission}`);
      }
    }
  });

  it("gives the Super Admin everything and the Admin everything but team and settings", () => {
    assert.deepEqual([...ROLE_PERMISSIONS.SUPER_ADMIN].sort(), [...ALL_PERMISSIONS].sort());
    assert.equal(can("ADMIN", "team.manage"), false);
    assert.equal(can("ADMIN", "settings.manage"), false);
    assert.equal(can("ADMIN", "leads.manage"), true);
    assert.equal(can("ADMIN", "reports.view"), true);
  });

  it("keeps the Viewer read-only", () => {
    const writes = ROLE_PERMISSIONS.VIEWER.filter((key) => !key.endsWith(".view"));
    assert.deepEqual(writes, []);
  });

  it("limits a technician to their own tickets", () => {
    assert.equal(can("TECHNICIAN", "tickets.view"), false);
    assert.equal(can("TECHNICIAN", "tickets.view_assigned"), true);
    assert.equal(can("TECHNICIAN", "tickets.update_assigned"), true);
    assert.equal(can("TECHNICIAN", "conversations.view"), false);
    assert.equal(can("TECHNICIAN", "customers.view"), false);
  });

  it("separates sales from support", () => {
    assert.equal(can("SALES", "leads.manage"), true);
    assert.equal(can("SALES", "tickets.view"), false);
    assert.equal(can("SUPPORT", "tickets.manage"), true);
    assert.equal(can("SUPPORT", "leads.view"), false);
  });

  it("lets only a Super Admin create or re-role staff", () => {
    assert.deepEqual(assignableRoles("SUPER_ADMIN"), [...STAFF_ROLES]);
    for (const role of STAFF_ROLES.filter((r) => r !== "SUPER_ADMIN")) {
      assert.deepEqual(assignableRoles(role), []);
      assert.equal(can(role, "team.manage"), false);
    }
  });

  it("denies legacy and unknown roles", () => {
    for (const role of ["AGENT", "GUEST", "CUSTOMER", "STUDENT", "INSTRUCTOR", "", undefined, null]) {
      assert.equal(isStaffRole(role as string), false);
      assert.equal(can(role as string, "dashboard.view"), false);
    }
  });

  it("puts every navigation item behind a real permission", () => {
    for (const group of ADMIN_NAV) {
      for (const item of group.items) {
        const keys = item.permission === undefined ? [] : Array.isArray(item.permission) ? item.permission : [item.permission];
        assert.ok(keys.length > 0, `${item.label} has no permission`);
        for (const key of keys) assert.ok(key in PERMISSIONS, `${item.label} uses unknown permission ${key}`);
      }
    }
  });
});

describe("console access", () => {
  it("admits only staff roles of this tenant", () => {
    assert.equal(canAccessAdmin({ role: "SALES", department: "PROSLINK" }), true);
    assert.equal(canAccessAdmin({ role: "SUPER_ADMIN", department: null }), false, "an account with no tenant is refused");
    assert.equal(canAccessAdmin({ role: "SUPER_ADMIN", department: "MARKETING" }), false);
    assert.equal(canAccessAdmin({ role: "AGENT", department: "PROSLINK" }), false);
    assert.equal(isForeignAccount("PROSLINK"), false);
    assert.equal(isForeignAccount(undefined), true);
  });

  it("requires a reasonable staff password", () => {
    assert.ok(passwordProblem("short1"));
    assert.ok(passwordProblem("onlyletterslong"));
    assert.ok(passwordProblem("1234567890123"));
    assert.equal(passwordProblem("Workshop2026x"), null);
  });
});

describe("company profile", () => {
  it("starts empty — nothing is invented", () => {
    const profile = companyProfileSchema.parse({});
    assert.equal(profile.phone, "");
    assert.equal(profile.whatsapp, "");
    assert.equal(profile.email, "");
    assert.deepEqual(profile.offices, []);
    assert.equal(whatsappLink(profile), null);
  });

  it("validates what staff enter", () => {
    assert.equal(companyProfileSchema.safeParse({ email: "not-an-email" }).success, false);
    assert.equal(companyProfileSchema.safeParse({ website: "example.com" }).success, false);
    assert.equal(companyProfileSchema.safeParse({ phone: "call us" }).success, false);
    const ok = companyProfileSchema.parse({ whatsapp: "+92 300 1234567", website: "https://example.com" });
    assert.equal(whatsappLink(ok, "Hi"), "https://wa.me/923001234567?text=Hi");
  });
});
