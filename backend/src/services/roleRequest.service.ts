import prisma from '../config/database';
import { UserRole } from '../../../shared/types';
import { RoleRequestStatus } from '@prisma/client';
import { sendRoleRequestSubmittedEmail, sendRoleRequestReviewedEmail } from './email.service';

const ROLE_HIERARCHY: UserRole[] = ['VIEWER', 'MODELER', 'DSL_DESIGNER', 'ADMIN'];

function roleIndex(role: UserRole): number {
  return ROLE_HIERARCHY.indexOf(role);
}

class RoleRequestService {
  async createRequest(userId: string, requestedRole: UserRole, reason: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const currentRole = user.role as UserRole;

    if (roleIndex(requestedRole) <= roleIndex(currentRole)) {
      throw new Error('Requested role must be higher than your current role');
    }

    if (requestedRole === 'ADMIN') {
      throw new Error('Cannot request ADMIN role');
    }

    // Check for existing pending request
    const existing = await prisma.roleRequest.findFirst({
      where: { userId, status: 'PENDING' },
    });
    if (existing) {
      throw new Error('You already have a pending role request');
    }

    const request = await prisma.roleRequest.create({
      data: {
        userId,
        currentRole: user.role,
        requestedRole,
        reason,
      },
      include: { user: { select: { email: true } } },
    });

    // Notify admins
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { email: true },
    });
    sendRoleRequestSubmittedEmail(
      admins.map(a => a.email),
      request.user.email,
      requestedRole,
      reason
    );

    return request;
  }

  async getMyRequests(userId: string) {
    return prisma.roleRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllRequests(filters?: { status?: RoleRequestStatus }) {
    return prisma.roleRequest.findMany({
      where: filters?.status ? { status: filters.status } : undefined,
      include: {
        user: { select: { email: true } },
        reviewedBy: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewRequest(
    requestId: string,
    reviewerId: string,
    approved: boolean,
    reviewNote?: string
  ) {
    const request = await prisma.roleRequest.findUnique({
      where: { id: requestId },
      include: { user: { select: { email: true } } },
    });

    if (!request) throw new Error('Role request not found');
    if (request.status !== 'PENDING') throw new Error('This request has already been reviewed');

    const status: RoleRequestStatus = approved ? 'APPROVED' : 'REJECTED';

    const updated = await prisma.$transaction(async (tx) => {
      const updatedRequest = await tx.roleRequest.update({
        where: { id: requestId },
        data: {
          status,
          reviewedById: reviewerId,
          reviewNote: reviewNote || null,
          reviewedAt: new Date(),
        },
        include: { user: { select: { email: true } } },
      });

      if (approved) {
        await tx.user.update({
          where: { id: request.userId },
          data: { role: request.requestedRole },
        });
      }

      return updatedRequest;
    });

    // Send notification to user
    sendRoleRequestReviewedEmail(
      updated.user.email,
      updated.requestedRole,
      approved,
      reviewNote
    );

    return updated;
  }
}

export const roleRequestService = new RoleRequestService();
