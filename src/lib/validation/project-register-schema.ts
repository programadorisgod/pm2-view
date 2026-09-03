import { z } from 'zod';

export const registerProjectSchema = z.object({
  processName: z.string().min(1, 'Process name is required'),
  name: z.string().min(1, 'Name is required').optional(),
  description: z.string().optional(),
  targetPath: z.string().optional(),
  teamId: z.string().nullable().optional(),
  pm2Names: z.array(z.string().trim().min(1)).min(1).optional(),
  members: z.array(z.object({
    userId: z.string().min(1),
    role: z.enum(['owner', 'editor', 'viewer'])
  })).optional().default([]),
}).refine(
  (data) => !data.targetPath || /^[A-Z]:[/\\]/i.test(data.targetPath) || data.targetPath.startsWith('/'),
  {
    message: 'Target path must be an absolute path',
    path: ['targetPath'],
  }
);

export type RegisterProjectInput = z.infer<typeof registerProjectSchema>;
