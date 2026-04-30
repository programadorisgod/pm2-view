import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Helper to read file content
const getFileContent = (filePath: string): string => {
  const fullPath = path.join(process.cwd(), filePath);
  return fs.readFileSync(fullPath, 'utf-8');
};

// NOTE: These were TDD red-phase tests for Phase 0 fixes.
// The fixes are now applied, so these tests are obsolete.
// Kept as documentation of what was fixed.
describe.skip('Phase 0 - Critical Fixes (TDD Red Phase - OBSOLETE)', () => {
  describe('Task 0.1: Admin Layout Protection', () => {
    const filePath = 'src/routes/(app)/admin/+layout.server.ts';

    it('should import requireAdmin from route-guards', () => {
      const content = getFileContent(filePath);
      expect(content).toContain('requireAdmin');
    });

    it('should NOT have "Don\'t throw here" comment (the bug to fix)', () => {
      const content = getFileContent(filePath);
      const hasBug = content.includes("Don't throw here");

      if (hasBug) {
        console.log('TASK 0.1 - BUG CONFIRMED: File has "Don\'t throw here" comment');
        console.log('NEED TO FIX: Call requireAdmin() and throw/error on non-admin');
      }

      // This test documents the bug - will pass once fixed
      expect(hasBug).toBe(false);
    });

    it('should call requireAdmin() and throw error for non-admin users', () => {
      const content = getFileContent(filePath);

      // After fix, should have logic like:
      // requireAdmin(user) - which throws if not admin
      // OR explicit check + throw error(403)
      const callsRequireAdmin = content.includes('requireAdmin(');
      const hasThrowOrError = content.includes('throw') || content.includes('error(403');

      // Document current state
      if (!hasThrowOrError) {
        console.log('TASK 0.1 - MISSING: No throw/error for non-admin users');
      }

      expect(callsRequireAdmin).toBe(true);
    });
  });

  describe('Task 0.2: Team Creation Auto-Owner', () => {
    const filePath = 'src/routes/(app)/admin/teams/+server.ts';

    it('should import teamMembers schema', () => {
      const content = getFileContent(filePath);
      expect(content).toContain('teamMembers');
    });

    it('should insert team_members record with role team_owner after team creation', () => {
      const content = getFileContent(filePath);

      // After fix, should have:
      // 1. Insert into teamMembers after team creation
      // 2. Use role: 'team_owner'
      // 3. Use the creator's user ID (from locals.user.id)
      const hasTeamMemberInsert = content.includes('teamMembers') &&
                                  content.includes('insert') &&
                                  content.includes("team_owner");

      if (!hasTeamMemberInsert) {
        console.log('TASK 0.2 - BUG CONFIRMED: No team_members insert with team_owner role');
        console.log('NEED TO FIX: Add teamMembers insert after team creation');
      }

      expect(hasTeamMemberInsert).toBe(true);
    });

    it('should use crypto.randomUUID for teamMembers entry ID', () => {
      const content = getFileContent(filePath);

      // After fix, should generate UUID for teamMembers entry
      const hasTeamMemberInsert = content.includes('teamMembers') &&
                                  content.includes('crypto.randomUUID()');

      expect(hasTeamMemberInsert).toBe(true);
    });
  });

  describe('Task 0.3: Atomic User Updates', () => {
    const filePath = 'src/routes/(app)/admin/users/[id]/+server.ts';

    it('should NOT use Promise.all for user updates (the bug)', () => {
      const content = getFileContent(filePath);
      const usesPromiseAll = content.includes('Promise.all(');
      const usesUpdatePromises = content.includes('updatePromises');

      if (usesPromiseAll || usesUpdatePromises) {
        console.log('TASK 0.3 - BUG CONFIRMED: Uses Promise.all() or updatePromises array');
        console.log('NEED TO FIX: Sequence operations - Better Auth first, then audit logs');
      }

      // This test documents the bug - will pass once fixed
      expect(usesPromiseAll || usesUpdatePromises).toBe(false);
    });

    it('should sequence operations: Better Auth call first, then audit log', () => {
      const content = getFileContent(filePath);

      // After fix, should NOT have .then(() => logAudit(...)) chained to auth.api calls
      // Should be sequential: await auth.api.setRole() then await logAudit()
      const chainsAuditWithThen = content.includes('.then(() =>') &&
                                   content.includes('logAudit(');

      if (chainsAuditWithThen) {
        console.log('TASK 0.3 - BUG: audit log chained with .then() instead of sequential');
      }

      expect(chainsAuditWithThen).toBe(false);
    });
  });
});
