import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processOperations } from '../src/modules/sync/sync.controller.js';
import { db } from '../src/database/db.js';


vi.mock('../src/database/db.js', () => {
  return {
    db: {
      project: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      workspaceMember: {
        findFirst: vi.fn(),
      },
      device: {
        findUnique: vi.fn(),
      },
      syncOperation: {
        create: vi.fn(),
      },
      file: {
        findMany: vi.fn(),
      }
    }
  };
});

describe('Sync Controller Policy Enforcements', () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    vi.resetAllMocks();
    req = {
      params: { projectId: 'project-1' },
      body: {
        deviceId: 'device-1',
        operations: [
          {
            type: 'CREATE',
            path: 'src/main.ts',
            hash: 'hash-abc',
            size: 1024,
            timestamp: new Date().toISOString(),
          }
        ]
      },
      user: { id: 'user-1' }
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    next = vi.fn();
  });

  it('should return 403 if device approval is required and device is not approved', async () => {

    db.project.findUnique.mockResolvedValue({
      id: 'project-1',
      workspaceId: 'workspace-1',
      workspace: {
        requireDeviceApproval: true,
        storageQuotaBytes: null,
      }
    });
    db.workspaceMember.findFirst.mockResolvedValue({
      userId: 'user-1',
      role: 'ADMIN'
    });

    db.device.findUnique.mockResolvedValue({
      id: 'device-1',
      status: 'PENDING'
    });

    await processOperations(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        message: expect.stringContaining('Device requires admin approval')
      })
    }));
  });

  it('should return 507 if workspace storage quota is exceeded', async () => {

    db.project.findUnique.mockResolvedValue({
      id: 'project-1',
      workspaceId: 'workspace-1',
      workspace: {
        requireDeviceApproval: false,
        storageQuotaBytes: 2048,
      }
    });
    db.workspaceMember.findFirst.mockResolvedValue({
      userId: 'user-1',
      role: 'ADMIN'
    });
    db.project.findMany.mockResolvedValue([
      { id: 'project-1' }
    ]);

    db.file.findMany.mockResolvedValue([
      { size: 1500 }
    ]);


    await processOperations(req, res, next);

    expect(res.status).toHaveBeenCalledWith(507);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        message: expect.stringContaining('storage quota exceeded')
      })
    }));
  });
});
