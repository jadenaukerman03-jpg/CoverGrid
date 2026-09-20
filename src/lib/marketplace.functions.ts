import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  acceptOfferAction,
  declineOfferAction,
  deleteMarketplaceWorkerAction,
  marketplaceBoardQuery,
  offerShiftAction,
  saveMarketplaceWorkerAction,
  setWorkerStatusAction,
} from "./marketplace.impl.server";

const workerSchema = z.object({
  id: z.string().nullable().optional(),
  fullName: z.string().min(1),
  position: z.enum(["nurse", "qma", "cna"]),
  phone: z.string().optional(),
  email: z.string().optional(),
  city: z.string().optional(),
  hourlyRate: z.number().optional(),
  licenseNumber: z.string().optional(),
  licenseExpiresOn: z.string().nullable().optional(),
  status: z.string().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional(),
});

export const getMarketplaceBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => marketplaceBoardQuery(context.userId));

export const saveMarketplaceWorkerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => workerSchema.parse(d))
  .handler(async ({ context, data }) => saveMarketplaceWorkerAction(context.userId, data));

export const setWorkerStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string(), status: z.string() }).parse(d))
  .handler(async ({ context, data }) =>
    setWorkerStatusAction(context.userId, data.id, data.status),
  );

export const deleteMarketplaceWorkerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => deleteMarketplaceWorkerAction(context.userId, data.id));

export const offerShiftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ assignmentId: z.string(), count: z.number().optional() }).parse(d),
  )
  .handler(async ({ context, data }) =>
    offerShiftAction(context.userId, data.assignmentId, data.count ?? 5),
  );

export const acceptOfferFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offerId: z.string() }).parse(d))
  .handler(async ({ context, data }) => acceptOfferAction(context.userId, data.offerId));

export const declineOfferFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ offerId: z.string(), noShow: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ context, data }) =>
    declineOfferAction(context.userId, data.offerId, data.noShow ?? false),
  );
