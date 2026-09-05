import {z} from 'zod';

export const stockImportSchema = z.object({
  variantId: z.string().uuid(),
  filename: z.string().trim().min(1).max(255),
  csv: z.string().min(1).max(5_000_000)
});

export const manualDeliverySchema = z
  .object({
    kind: z.enum(['code', 'text', 'file', 'link']),
    payload: z.string().trim().max(20_000).nullable().optional(),
    displayHint: z.string().trim().max(120).nullable().optional(),
    storagePath: z.string().trim().max(1000).nullable().optional(),
    quantity: z.number().int().positive().max(1_000_000).default(1)
  })
  .superRefine((value, context) => {
    if (value.kind === 'file' && !value.storagePath)
      context.addIssue({code: 'custom', message: 'storage_path_required', path: ['storagePath']});
    if (value.kind !== 'file' && !value.payload)
      context.addIssue({code: 'custom', message: 'payload_required', path: ['payload']});
  });

export const bulkManualDeliverySchema = z.object({
  deliveries: z
    .array(manualDeliverySchema.and(z.object({taskId: z.string().uuid()})))
    .min(1)
    .max(100)
});

export const supplierConfigSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_-]{2,47}$/),
    name: z.string().trim().min(2).max(120),
    driver: z.enum(['smm_panel', 'reseller_api', 'mock']),
    endpoint: z.string().trim().max(1000),
    apiKey: z.string().trim().max(2000).nullable().optional(),
    currencyCode: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/),
    marginBps: z.number().int().min(-10_000).max(100_000),
    priority: z.number().int().min(0).max(1000),
    enabled: z.boolean(),
    sandboxMode: z.boolean()
  })
  .superRefine((value, context) => {
    if (value.driver === 'mock' && !value.endpoint.startsWith('mock://'))
      context.addIssue({code: 'custom', message: 'mock_endpoint_required', path: ['endpoint']});
    if (value.driver !== 'mock' && !/^https:\/\//.test(value.endpoint))
      context.addIssue({code: 'custom', message: 'https_endpoint_required', path: ['endpoint']});
  });

export const manualNoteSchema = z.object({body: z.string().trim().min(1).max(5000)});
