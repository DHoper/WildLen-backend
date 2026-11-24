import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'

/** Throws unless `userId` is a confirmed participant of trip `tripId` (may attach photos). */
export const assertTripMember = async (tripId: number, userId: number) => {
  const m = await prisma.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } }, select: { status: true } })
  if (m?.status !== 'GOING') throw ApiError.badRequest('trip.not_member')
}
