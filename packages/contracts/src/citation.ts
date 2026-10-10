import { z } from "zod";

/** One registry record that supports a data point, with the exact value that put it there. */
export const Citation = z.object({
  nct_id: z.string().regex(/^NCT\d{8}$/),
  title: z.string(),
  /** JSON path in the ClinicalTrials.gov response, e.g. protocolSection.designModule.phases */
  field: z.string(),
  /** The exact value at that path (or the two values, for an edge). */
  excerpt: z.string(),
});
export type Citation = z.infer<typeof Citation>;

const cell = z.union([z.string(), z.number(), z.null()]);

/** Every data row carries how many studies it stands for and which ones. */
export const DataRow = z.object({ study_count: z.number().int().nonnegative(), citations: z.array(Citation) }).catchall(cell);
export type DataRow = z.infer<typeof DataRow>;
